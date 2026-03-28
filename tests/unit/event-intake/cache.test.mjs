import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_BROWSER_DETAIL_TTL_HOURS,
  createCacheManager,
  createEmptySourceHealth
} from "../../../scripts/event-intake/cache.mjs";

describe("event intake cache manager", () => {
  it("grava e relê cache HTTP compactado com metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-cache-"));
    const manager = await createCacheManager({ cwd: tempDir });

    await manager.writeHttpCache({
      url: "https://example.com/eventos?utm_source=teste",
      kind: "listing",
      status: 200,
      contentType: "text/html; charset=utf-8",
      etag: "etag-v1",
      lastModified: "Wed, 01 Jan 2026 00:00:00 GMT",
      body: "<html>cacheado</html>",
      finalUrl: "https://example.com/eventos"
    });

    const cached = await manager.readHttpCache("https://example.com/eventos");

    expect(cached?.body).toBe("<html>cacheado</html>");
    expect(cached?.meta?.etag).toBe("etag-v1");
    expect(cached?.meta?.lastModified).toBe("Wed, 01 Jan 2026 00:00:00 GMT");
    expect(cached?.meta?.finalUrl).toBe("https://example.com/eventos");
  });

  it("respeita TTL no cache de browser entre execucoes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-cache-"));
    const now = new Date("2026-03-28T12:00:00.000Z");
    const manager = await createCacheManager({ cwd: tempDir, now });

    await manager.writeBrowserCache({
      url: "https://example.com/evento",
      kind: "detail",
      ttlHours: DEFAULT_BROWSER_DETAIL_TTL_HOURS,
      body: "<html>browser</html>",
      finalUrl: "https://example.com/evento"
    });

    const stillFresh = await createCacheManager({
      cwd: tempDir,
      now: new Date("2026-03-28T20:00:00.000Z")
    });
    const expired = await createCacheManager({
      cwd: tempDir,
      now: new Date("2026-03-29T13:00:00.000Z")
    });

    expect((await stillFresh.readBrowserCache("https://example.com/evento", 24))?.body).toBe(
      "<html>browser</html>"
    );
    expect(await expired.readBrowserCache("https://example.com/evento", 24)).toBeNull();
  });

  it("persiste cooldown por host e permite limpar falhas", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-cache-"));
    const manager = await createCacheManager({
      cwd: tempDir,
      now: new Date("2026-03-28T12:00:00.000Z")
    });

    expect(createEmptySourceHealth()).toEqual({ version: 1, hosts: {} });
    expect(manager.getCooldown("https://example.com/evento")).toBeNull();

    const failure = manager.recordFailure({
      url: "https://example.com/evento",
      sourceName: "Example",
      status: 429
    });
    await manager.persistHealth();

    expect(failure?.host).toBe("example.com");
    expect(manager.getCooldown("https://example.com/evento")?.status).toBe(429);
    expect(manager.getSourceHealthSnapshot().hosts["example.com"]?.failureCount).toBe(1);

    const reloaded = await createCacheManager({
      cwd: tempDir,
      now: new Date("2026-03-28T18:00:00.000Z")
    });
    const expired = await createCacheManager({
      cwd: tempDir,
      now: new Date("2026-03-29T01:00:00.000Z")
    });

    expect(reloaded.getCooldown("https://example.com/evento")?.host).toBe("example.com");
    expect(expired.getCooldown("https://example.com/evento")).toBeNull();
    expect(reloaded.clearFailure("https://example.com/evento")).toBe(true);
    expect(reloaded.getCooldown("https://example.com/evento")).toBeNull();
  });
});
