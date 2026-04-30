import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import matter from "gray-matter";

const require = createRequire(import.meta.url);
const { getSiteConfig } = require("../site.config.js");

const EVENTS_DIR = "src/content/events";

function compact(value) {
  return String(value ?? "").trim();
}

function trimOuterSlashes(value) {
  const text = String(value || "");
  let start = 0;
  let end = text.length;

  while (start < end && text[start] === "/") {
    start += 1;
  }

  while (end > start && text[end - 1] === "/") {
    end -= 1;
  }

  return text.slice(start, end);
}

function stripTrailingSlash(value) {
  const text = String(value || "");
  let end = text.length;

  while (end > 0 && text[end - 1] === "/") {
    end -= 1;
  }

  return text.slice(0, end);
}

function normalizePathPrefix(value) {
  const trimmed = trimOuterSlashes(value || "/");
  return trimmed ? `/${trimmed}/` : "/";
}

function joinUrlPath(...segments) {
  const parts = [];
  let trailingSlash = false;

  for (const segment of segments) {
    const text = String(segment ?? "");

    if (!text || text === "/") {
      trailingSlash = true;
      continue;
    }

    const trimmed = trimOuterSlashes(text);

    if (trimmed) {
      parts.push(trimmed);
      trailingSlash = text.endsWith("/");
    }
  }

  return `/${parts.join("/")}${trailingSlash ? "/" : ""}`;
}

function normalizeRelativePath(filePath) {
  return compact(filePath).replaceAll("\\", "/");
}

export function normalizeEventPaths(filePaths) {
  const seen = new Set();
  const normalized = [];

  for (const filePath of filePaths) {
    const relativePath = normalizeRelativePath(filePath);
    const relativeName = relativePath.slice(`${EVENTS_DIR}/`.length);
    const basename = path.posix.basename(relativePath);

    if (
      !relativePath.startsWith(`${EVENTS_DIR}/`) ||
      !relativePath.endsWith(".md") ||
      relativeName.includes("/") ||
      basename.startsWith(".")
    ) {
      continue;
    }

    if (!seen.has(relativePath)) {
      seen.add(relativePath);
      normalized.push(relativePath);
    }
  }

  return normalized;
}

export function buildEventUrl({ filePath, siteUrl, pathPrefix, env = process.env }) {
  const site = getSiteConfig(env);
  const publicSiteUrl = compact(siteUrl || site.siteUrl);
  const prefix = normalizePathPrefix(pathPrefix ?? site.pathPrefix);
  const slug = path.posix.basename(normalizeRelativePath(filePath), ".md");
  const url = new URL(publicSiteUrl);
  const prefixPath = prefix === "/" ? "" : stripTrailingSlash(prefix);
  let basePath = stripTrailingSlash(url.pathname);

  if (prefixPath && !basePath.endsWith(prefixPath)) {
    basePath = joinUrlPath(basePath, prefixPath);
  }

  url.pathname = joinUrlPath(basePath, "eventos", slug, "/");
  url.search = "";
  url.hash = "";

  return url.toString();
}

export function buildEventNotificationPayload({
  data,
  filePath,
  siteUrl,
  pathPrefix,
  repository = "",
  commitSha = "",
  env = process.env
}) {
  const title = compact(data.title);

  if (!title) {
    throw new Error(`${filePath}: evento sem title para notificacao`);
  }

  const eventUrl = buildEventUrl({ filePath, siteUrl, pathPrefix, env });

  return {
    notification_type: "event_added",
    event_name: title,
    event_link: eventUrl,
    title,
    url: eventUrl,
    start_date: compact(data.start_date),
    end_date: compact(data.end_date || data.start_date),
    kind: compact(data.kind),
    format: compact(data.format),
    city: compact(data.city),
    state: compact(data.state),
    organizer: compact(data.organizer),
    venue: compact(data.venue),
    ticket_url: compact(data.ticket_url),
    source_name: compact(data.source_name),
    source_url: compact(data.source_url),
    file_path: normalizeRelativePath(filePath),
    repository: compact(repository),
    commit_sha: compact(commitSha)
  };
}

async function readEventFile(relativePath, root = process.cwd()) {
  const absolutePath = path.join(root, relativePath);
  const source = await fs.readFile(absolutePath, "utf8");
  return matter(source).data;
}

async function readFileList(fileListPath) {
  const source = await fs.readFile(fileListPath, "utf8");
  return source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function assertWebhookUrl(webhookUrl) {
  const value = compact(webhookUrl);

  if (!value) {
    throw new Error("EVENT_NOTIFICATION_WEBHOOK_URL nao esta configurado");
  }

  const parsed = new URL(value);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("EVENT_NOTIFICATION_WEBHOOK_URL deve ser uma URL http(s)");
  }

  return value;
}

export async function postWebhook({ webhookUrl, payload, fetchImpl = globalThis.fetch }) {
  const targetUrl = assertWebhookUrl(webhookUrl);
  const response = await fetchImpl(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Webhook falhou: HTTP ${response.status}${body ? ` - ${body}` : ""}`);
  }

  return {
    ok: true,
    status: response.status
  };
}

export async function sendEventNotifications({
  eventPaths,
  webhookUrl,
  siteUrl,
  pathPrefix,
  repository,
  commitSha,
  root = process.cwd(),
  dryRun = false,
  fetchImpl = globalThis.fetch,
  env = process.env
}) {
  const normalizedPaths = normalizeEventPaths(eventPaths);
  const payloads = [];

  for (const filePath of normalizedPaths) {
    const data = await readEventFile(filePath, root);
    const payload = buildEventNotificationPayload({
      data,
      filePath,
      siteUrl,
      pathPrefix,
      repository,
      commitSha,
      env
    });
    payloads.push(payload);

    if (!dryRun) {
      await postWebhook({ webhookUrl, payload, fetchImpl });
    }
  }

  return payloads;
}

function readValueArg(argv, index, name) {
  const current = argv[index];
  const prefix = `${name}=`;

  if (current.startsWith(prefix)) {
    return {
      value: current.slice(prefix.length),
      nextIndex: index
    };
  }

  return {
    value: argv[index + 1],
    nextIndex: index + 1
  };
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    eventPaths: [],
    fileListPath: "",
    webhookUrl: "",
    siteUrl: "",
    pathPrefix: "",
    repository: process.env.GITHUB_REPOSITORY || "",
    commitSha: process.env.GITHUB_SHA || ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--file-list" || arg.startsWith("--file-list=")) {
      const parsed = readValueArg(argv, index, "--file-list");
      options.fileListPath = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--webhook-url" || arg.startsWith("--webhook-url=")) {
      const parsed = readValueArg(argv, index, "--webhook-url");
      options.webhookUrl = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--site-url" || arg.startsWith("--site-url=")) {
      const parsed = readValueArg(argv, index, "--site-url");
      options.siteUrl = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--path-prefix" || arg.startsWith("--path-prefix=")) {
      const parsed = readValueArg(argv, index, "--path-prefix");
      options.pathPrefix = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--repository" || arg.startsWith("--repository=")) {
      const parsed = readValueArg(argv, index, "--repository");
      options.repository = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--commit-sha" || arg.startsWith("--commit-sha=")) {
      const parsed = readValueArg(argv, index, "--commit-sha");
      options.commitSha = parsed.value || "";
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Opcao desconhecida: ${arg}`);
    }

    options.eventPaths.push(arg);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fileListPaths = options.fileListPath ? await readFileList(options.fileListPath) : [];
  const eventPaths = normalizeEventPaths([...fileListPaths, ...options.eventPaths]);

  if (!eventPaths.length) {
    console.log("Nenhum evento novo para notificar.");
    return;
  }

  const payloads = await sendEventNotifications({
    eventPaths,
    webhookUrl: options.webhookUrl || process.env.EVENT_NOTIFICATION_WEBHOOK_URL,
    siteUrl: options.siteUrl || process.env.SITE_URL,
    pathPrefix: options.pathPrefix || process.env.PATH_PREFIX,
    repository: options.repository,
    commitSha: options.commitSha,
    dryRun: options.dryRun
  });

  for (const payload of payloads) {
    console.log(`${options.dryRun ? "Preparada" : "Enviada"} notificacao: ${payload.event_name} -> ${payload.event_link}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
