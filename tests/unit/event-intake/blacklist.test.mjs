import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EVENT_BLACKLIST_PATH,
  createEmptyBlacklist,
  findBlacklistedEvent,
  isBlacklistableReason,
  loadEventBlacklist,
  saveEventBlacklist,
  upsertBlacklistEntry
} from "../../../scripts/event-intake/blacklist.mjs";

describe("event intake blacklist", () => {
  it("carrega vazio quando o arquivo ainda nao existe", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-blacklist-"));
    const blacklist = await loadEventBlacklist(tempDir);

    expect(blacklist).toEqual(createEmptyBlacklist());
  });

  it("persiste em NDJSON e encontra entradas por source_url", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-blacklist-"));
    const created = upsertBlacklistEntry(
      createEmptyBlacklist(),
      {
        title: "Cloud Day Recife",
        source_name: "Meetup Recife",
        source_url: "https://www.meetup.com/devops-recife/events/313900050/",
        ticket_url: "https://www.meetup.com/devops-recife/events/313900050/",
        state: "PE",
        city: "Recife",
        format: "in-person",
        start_date: "2026-04-20",
        end_date: "2026-04-20"
      },
      { todayKey: "2026-03-28", reason: "non_northeast" }
    );
    const filePath = await saveEventBlacklist(created.blacklist, tempDir);
    const reloaded = await loadEventBlacklist(tempDir);
    const raw = await fs.readFile(filePath, "utf8");

    expect(filePath).toBe(path.join(tempDir, EVENT_BLACKLIST_PATH));
    expect(raw.trim().split(/\r?\n/)).toHaveLength(1);
    expect(findBlacklistedEvent(reloaded, {
      event_url: "https://www.meetup.com/devops-recife/events/313900050"
    })?.reason).toBe("non_northeast");
  });

  it("preserva origem de review feedback e encontra por fingerprint de titulo", () => {
    const created = upsertBlacklistEntry(
      createEmptyBlacklist(),
      {
        title: "XVI Fórum Internacional de Pedagogia",
        source_name: "Even3 Eventos",
        source_url: "https://even3.com.br/fiped"
      },
      {
        todayKey: "2026-03-28",
        reason: "non_tech",
        origin: "review_feedback",
        feedbackUrl: "https://github.com/baiaotech/baiaotech/issues/10"
      }
    );

    expect(created.entry.origin).toBe("review_feedback");
    expect(created.entry.feedback_url).toBe("https://github.com/baiaotech/baiaotech/issues/10");
    expect(
      findBlacklistedEvent(created.blacklist, {
        title: "xvi forum internacional de pedagogia",
        source_name: "Another source"
      })?.origin
    ).toBe("review_feedback");
  });

  it("atualiza hits e mantem somente a versao mais recente em memoria", async () => {
    const initial = upsertBlacklistEntry(
      createEmptyBlacklist(),
      {
        title: "Evento remoto",
        source_name: "Meetup Nordeste",
        source_url: "https://example.com/evento-remoto",
        format: "online"
      },
      { todayKey: "2026-03-27", reason: "online_only" }
    );
    const updated = upsertBlacklistEntry(
      initial.blacklist,
      {
        title: "Evento remoto",
        source_name: "Meetup Nordeste",
        source_url: "https://example.com/evento-remoto",
        format: "online"
      },
      { todayKey: "2026-03-28", reason: "online_only", details: "seen_again" }
    );

    expect(updated.changed).toBe(true);
    expect(updated.entry.hit_count).toBe(2);
    expect(updated.entry.first_seen_on).toBe("2026-03-27");
    expect(updated.entry.last_seen_on).toBe("2026-03-28");
    expect(updated.entry.details).toBe("seen_again");
  });

  it("reconhece apenas motivos blacklistables", () => {
    expect(isBlacklistableReason("past")).toBe(true);
    expect(isBlacklistableReason("online_only")).toBe(true);
    expect(isBlacklistableReason("low_confidence")).toBe(false);
  });

  it("carrega o fallback legado em JSON quando o NDJSON nao existe", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-blacklist-"));
    await fs.mkdir(path.join(tempDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "data/event-intake-blacklist.json"),
      JSON.stringify({
        version: 2,
        updated_at: "2026-03-28T00:00:00.000Z",
        entries: [
          {
            key: "legacy-key",
            title: "Legacy entry",
            reason: "past",
            source_url: "https://example.com/legacy"
          }
        ]
      }),
      "utf8"
    );

    const blacklist = await loadEventBlacklist(tempDir);

    expect(blacklist.version).toBe(2);
    expect(blacklist.entries).toHaveLength(1);
    expect(blacklist.entries[0].title).toBe("Legacy entry");
  });

  it("encontra por chave derivada quando a URL nao esta presente", () => {
    const created = upsertBlacklistEntry(
      createEmptyBlacklist(),
      {
        title: "Cloud Day Recife",
        source_name: "Meetup Recife",
        start_date: "2026-04-20"
      },
      { todayKey: "2026-03-28", reason: "non_tech" }
    );

    expect(
      findBlacklistedEvent(created.blacklist, {
        title: "Cloud Day Recife",
        source_name: "Meetup Recife",
        start_date: "2026-04-20"
      })?.reason
    ).toBe("non_tech");
  });
});
