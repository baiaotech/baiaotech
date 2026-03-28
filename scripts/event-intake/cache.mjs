import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { gzip as gzipCallback, gunzip as gunzipCallback } from "node:zlib";

import { normalizeUrl } from "./shared.mjs";

const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

export const EVENT_INTAKE_CACHE_ROOT = ".cache/event-intake";
export const SOURCE_HEALTH_PATH = "source-health.json";
export const DEFAULT_BROWSER_LISTING_TTL_HOURS = 6;
export const DEFAULT_BROWSER_DETAIL_TTL_HOURS = 24;

function sha1(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function resolveCacheRoot(cwd = process.cwd()) {
  return path.join(cwd, EVENT_INTAKE_CACHE_ROOT);
}

function buildHttpPaths(cacheRoot, key) {
  return {
    metaPath: path.join(cacheRoot, "http-meta", `${key}.json`),
    bodyPath: path.join(cacheRoot, "http-body", `${key}.html.gz`)
  };
}

function buildBrowserPaths(cacheRoot, key) {
  return {
    metaPath: path.join(cacheRoot, "browser-meta", `${key}.json`),
    bodyPath: path.join(cacheRoot, "browser-body", `${key}.html.gz`)
  };
}

async function ensureDir(targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function readJson(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  return JSON.parse(source);
}

async function readMaybeJson(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readGzipBody(filePath) {
  const body = await fs.readFile(filePath);
  return gunzip(body).then((buffer) => buffer.toString("utf8"));
}

async function writeGzipBody(filePath, body) {
  await ensureDir(filePath);
  const compressed = await gzip(Buffer.from(String(body || ""), "utf8"));
  await fs.writeFile(filePath, compressed);
}

function toIso(value) {
  return new Date(value).toISOString();
}

function isExpired(isoString, now = new Date()) {
  if (!isoString) {
    return true;
  }

  const timestamp = new Date(isoString).getTime();
  return Number.isNaN(timestamp) || timestamp <= now.getTime();
}

export function createEmptySourceHealth() {
  return {
    version: 1,
    hosts: {}
  };
}

export async function createCacheManager({
  cwd = process.cwd(),
  cacheBust = false,
  now = new Date()
} = {}) {
  const cacheRoot = resolveCacheRoot(cwd);
  const sourceHealthPath = path.join(cacheRoot, SOURCE_HEALTH_PATH);
  const sourceHealth = await readMaybeJson(sourceHealthPath, createEmptySourceHealth());

  async function ensureCacheLayout() {
    await Promise.all([
      fs.mkdir(path.join(cacheRoot, "http-meta"), { recursive: true }),
      fs.mkdir(path.join(cacheRoot, "http-body"), { recursive: true }),
      fs.mkdir(path.join(cacheRoot, "browser-meta"), { recursive: true }),
      fs.mkdir(path.join(cacheRoot, "browser-body"), { recursive: true })
    ]);
  }

  await ensureCacheLayout();

  function getHostKey(url) {
    try {
      return new URL(normalizeUrl(url)).host;
    } catch {
      return "";
    }
  }

  function getCooldown(url) {
    const host = getHostKey(url);
    const entry = sourceHealth.hosts?.[host];

    if (!host || !entry || isExpired(entry.cooldownUntil, now)) {
      return null;
    }

    return {
      host,
      ...entry
    };
  }

  function recordFailure({ url, sourceName = "", status = 500 } = {}) {
    const host = getHostKey(url);

    if (!host) {
      return null;
    }

    const durationHours = status === 403 || status === 429 ? 12 : 2;
    const current = sourceHealth.hosts?.[host] || {};
    const failureCount = (Number(current.failureCount || 0) || 0) + 1;
    const sourceNames = [...new Set([...(current.sourceNames || []), sourceName].filter(Boolean))];
    const cooldownUntil = new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString();

    sourceHealth.hosts[host] = {
      status,
      failureCount,
      sourceNames,
      lastFailureAt: now.toISOString(),
      cooldownUntil
    };

    return {
      host,
      ...sourceHealth.hosts[host]
    };
  }

  function clearFailure(url) {
    const host = getHostKey(url);

    if (host && sourceHealth.hosts[host]) {
      delete sourceHealth.hosts[host];
      return true;
    }

    return false;
  }

  async function readHttpCache(url) {
    if (cacheBust) {
      return null;
    }

    const key = sha1(normalizeUrl(url));
    const { metaPath, bodyPath } = buildHttpPaths(cacheRoot, key);

    try {
      const meta = await readJson(metaPath);
      const body = await readGzipBody(bodyPath);
      return { key, meta, body, metaPath, bodyPath };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async function writeHttpCache({
    url,
    kind,
    status,
    contentType = "",
    etag = "",
    lastModified = "",
    body = "",
    finalUrl = ""
  }) {
    const normalizedUrl = normalizeUrl(url);
    const key = sha1(normalizedUrl);
    const { metaPath, bodyPath } = buildHttpPaths(cacheRoot, key);
    const metadata = {
      url: normalizedUrl,
      finalUrl: normalizeUrl(finalUrl || normalizedUrl),
      etag: String(etag || "").trim(),
      lastModified: String(lastModified || "").trim(),
      status: Number(status || 0) || 0,
      fetchedAt: now.toISOString(),
      contentType: String(contentType || "").trim(),
      bodyPath: path.relative(cacheRoot, bodyPath),
      kind: String(kind || "").trim()
    };

    await writeJson(metaPath, metadata);
    await writeGzipBody(bodyPath, body);
    return metadata;
  }

  async function readBrowserCache(url, ttlHours) {
    if (cacheBust) {
      return null;
    }

    const normalizedUrl = normalizeUrl(url);
    const key = sha1(normalizedUrl);
    const { metaPath, bodyPath } = buildBrowserPaths(cacheRoot, key);

    try {
      const meta = await readJson(metaPath);
      const fetchedAt = new Date(meta.fetchedAt || 0).getTime();
      const maxAgeMs = Number(ttlHours || meta.ttlHours || DEFAULT_BROWSER_DETAIL_TTL_HOURS) * 60 * 60 * 1000;

      if (!fetchedAt || Number.isNaN(fetchedAt) || now.getTime() - fetchedAt > maxAgeMs) {
        return null;
      }

      const body = await readGzipBody(bodyPath);
      return { key, meta, body, metaPath, bodyPath };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async function writeBrowserCache({
    url,
    kind,
    ttlHours,
    body = "",
    finalUrl = ""
  }) {
    const normalizedUrl = normalizeUrl(url);
    const key = sha1(normalizedUrl);
    const { metaPath, bodyPath } = buildBrowserPaths(cacheRoot, key);
    const metadata = {
      url: normalizedUrl,
      finalUrl: normalizeUrl(finalUrl || normalizedUrl),
      fetchedAt: now.toISOString(),
      bodyPath: path.relative(cacheRoot, bodyPath),
      ttlHours: Number(ttlHours || DEFAULT_BROWSER_DETAIL_TTL_HOURS),
      kind: String(kind || "").trim()
    };

    await writeJson(metaPath, metadata);
    await writeGzipBody(bodyPath, body);
    return metadata;
  }

  async function persistHealth() {
    await writeJson(sourceHealthPath, sourceHealth);
    return sourceHealthPath;
  }

  function getSourceHealthSnapshot() {
    return JSON.parse(JSON.stringify(sourceHealth));
  }

  return {
    cacheRoot,
    sourceHealthPath,
    cacheBust,
    now: toIso(now),
    getHostKey,
    getCooldown,
    recordFailure,
    clearFailure,
    readHttpCache,
    writeHttpCache,
    readBrowserCache,
    writeBrowserCache,
    persistHealth,
    getSourceHealthSnapshot
  };
}
