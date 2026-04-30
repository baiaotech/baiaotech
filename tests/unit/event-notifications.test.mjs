import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildEventNotificationPayload,
  buildEventUrl,
  normalizeEventPaths,
  sendEventNotifications
} from "../../scripts/notify-new-events.mjs";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-events-"));
  tempDirs.push(root);
  return root;
}

describe("event notification payloads", () => {
  it("filtra apenas arquivos Markdown de eventos novos", () => {
    expect(
      normalizeEventPaths([
        "src/content/events/meu-evento.md",
        "src/content/events/meu-evento.md",
        "src/content/events/.rascunho.md",
        "src/content/events/subpasta/outro-evento.md",
        "src/content/communities/minha-comunidade.md",
        "README.md"
      ])
    ).toEqual(["src/content/events/meu-evento.md"]);
  });

  it("monta link publico do evento sem duplicar prefixo", () => {
    expect(
      buildEventUrl({
        filePath: "src/content/events/meu-evento.md",
        siteUrl: "https://baiaotech.org",
        pathPrefix: "/",
        env: {}
      })
    ).toBe("https://baiaotech.org/eventos/meu-evento/");

    expect(
      buildEventUrl({
        filePath: "src/content/events/meu-evento.md",
        siteUrl: "https://example.com/portal",
        pathPrefix: "/portal/",
        env: {}
      })
    ).toBe("https://example.com/portal/eventos/meu-evento/");
  });

  it("inclui nome, link e dados principais no payload", () => {
    const payload = buildEventNotificationPayload({
      filePath: "src/content/events/devopsdays-recife-2026.md",
      siteUrl: "https://baiaotech.org",
      pathPrefix: "/",
      repository: "baiaotech/baiaotech",
      commitSha: "abc123",
      env: {},
      data: {
        title: "DevOpsDays Recife 2026",
        start_date: "2026-09-10",
        end_date: "2026-09-11",
        kind: "conference",
        format: "in-person",
        city: "Recife",
        state: "PE",
        organizer: "DevOpsDays Recife",
        venue: "Recife",
        ticket_url: "https://example.com/inscricao",
        source_name: "Site oficial",
        source_url: "https://example.com/evento"
      }
    });

    expect(payload).toMatchObject({
      notification_type: "event_added",
      event_name: "DevOpsDays Recife 2026",
      event_link: "https://baiaotech.org/eventos/devopsdays-recife-2026/",
      start_date: "2026-09-10",
      end_date: "2026-09-11",
      city: "Recife",
      state: "PE",
      repository: "baiaotech/baiaotech",
      commit_sha: "abc123"
    });
  });

  it("envia um POST por evento novo", async () => {
    const root = await makeTempRoot();
    const eventDir = path.join(root, "src/content/events");
    const calls = [];

    await fs.mkdir(eventDir, { recursive: true });
    await fs.writeFile(
      path.join(eventDir, "meu-evento.md"),
      `---
title: "Meu Evento"
start_date: "2026-05-01"
end_date: "2026-05-01"
kind: "meetup"
format: "in-person"
city: "Fortaleza"
state: "CE"
organizer: "Comunidade"
venue: "Auditório"
ticket_url: "https://example.com/ticket"
categories:
  - "cloud"
featured: false
cover_image: ""
---

Descricao do evento.
`
    );

    const payloads = await sendEventNotifications({
      eventPaths: ["src/content/events/meu-evento.md"],
      webhookUrl: "https://hooks.example.test/catch",
      siteUrl: "https://baiaotech.org",
      pathPrefix: "/",
      root,
      fetchImpl: async (url, init) => {
        calls.push({
          url,
          method: init.method,
          payload: JSON.parse(init.body)
        });

        return { ok: true, status: 200 };
      }
    });

    expect(payloads).toHaveLength(1);
    expect(calls).toEqual([
      {
        url: "https://hooks.example.test/catch",
        method: "POST",
        payload: expect.objectContaining({
          event_name: "Meu Evento",
          event_link: "https://baiaotech.org/eventos/meu-evento/"
        })
      }
    ]);
  });
});
