import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/event-intake/manual.mjs")).href;
const originalCwd = process.cwd();

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

const categories = [
  { slug: "backend", name: "Backend" },
  { slug: "big-data", name: "Big Data" },
  { slug: "cloud", name: "Cloud" },
  { slug: "data-science", name: "Data Science" },
  { slug: "ia", name: "IA" },
  { slug: "seguranca", name: "Segurança" },
  { slug: "agilidade", name: "Agilidade" },
  { slug: "outros", name: "Outros" }
];

describe("manual event intake", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-manual-intake-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("extrai blocos YAML de EVENTS.md mesmo com texto livre entre eventos", async () => {
    const { parseManualEventsMarkdown } = await importModule();
    const events = parseManualEventsMarkdown(`
Texto antes.
---
title: "Security BSides Recife 2026"
start_date: "2026-06-06"
end_date: "2026-06-06"
kind: "conference"
format: "in-person"
city: "Recife"
state: "PE"
organizer: "BSides Recife"
venue: "Recife"
ticket_url: "https://bsidesrecife.com.br"
categories:
- "security"
---
Conferencia de seguranca.

Outro texto.
---
title: "DevOpsDays Natal 2026"
start_date: "2026-05-16"
end_date: "2026-05-16"
kind: "conference"
format: "in-person"
city: "Natal"
state: "RN"
organizer: "DevOpsDays"
venue: "Natal"
ticket_url: "https://devopsdays.org/events/2026-natal/welcome/"
categories:
- "cloud"
---
Evento de devops.
`);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      index: 1,
      title: "Security BSides Recife 2026",
      description: "Conferencia de seguranca.\n\nOutro texto."
    });
    expect(events[1].title).toBe("DevOpsDays Natal 2026");
  });

  it("normaliza kind, categorias e URLs com tracking", async () => {
    const { normalizeManualEvent } = await importModule();
    const normalized = normalizeManualEvent({
      title: "DunaSec 2026",
      start_date: "2026-05-30",
      end_date: "2026-05-30",
      kind: "forum",
      format: "in-person",
      city: "Natal",
      state: "RN",
      organizer: "DunaSec",
      venue: "Natal",
      ticket_url: "https://dunasec.com.br/?utm_source=chatgpt.com#agenda",
      categories: ["security", "ciberseguranca"],
      description: "Conferencia tecnica de seguranca ofensiva e defensiva."
    }, {
      categorySlugs: categories.map((item) => item.slug)
    });

    expect(normalized.kind).toBe("summit");
    expect(normalized.categories).toEqual(["seguranca"]);
    expect(normalized.ticket_url).toBe("https://dunasec.com.br/");
    expect(normalized.source_url).toBe("https://dunasec.com.br/");
  });

  it("rejeita URL placeholder, evento passado e duplicata existente", async () => {
    const { buildManualEventOperations } = await importModule();
    const existingEvents = [
      {
        path: "src/content/events/build-com-ai-recife.md",
        title: "Build com AI Recife",
        start_date: "2026-05-09",
        end_date: "2026-05-09",
        organizer: "Google Developer Groups",
        ticket_url: "https://gdg.community.dev/events/details/build-com-ai-recife",
        source_url: "https://gdg.community.dev/events/details/build-com-ai-recife"
      }
    ];

    const result = await buildManualEventOperations([
      {
        title: "Evento sem fonte",
        start_date: "2026-05-09",
        end_date: "2026-05-09",
        kind: "conference",
        format: "in-person",
        city: "Recife",
        state: "PE",
        organizer: "Comunidade Tech",
        venue: "Recife",
        ticket_url: "https://...",
        categories: ["ia"],
        description: "Evento tecnico de IA."
      },
      {
        title: "Evento passado",
        start_date: "2026-04-28",
        end_date: "2026-04-28",
        kind: "conference",
        format: "in-person",
        city: "Recife",
        state: "PE",
        organizer: "Comunidade Tech",
        venue: "Recife",
        ticket_url: "https://example.com/evento-passado",
        categories: ["ia"],
        description: "Evento tecnico de IA."
      },
      {
        title: "Build com AI Recife",
        start_date: "2026-05-09",
        end_date: "2026-05-09",
        kind: "workshop",
        format: "in-person",
        city: "Recife",
        state: "PE",
        organizer: "Google Developer Groups",
        venue: "Recife",
        ticket_url: "https://gdg.community.dev/events/details/build-com-ai-recife",
        categories: ["ia"],
        description: "Workshop tecnico de IA."
      }
    ], {
      categories,
      existingEvents,
      todayKey: "2026-04-29"
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      "placeholder_url",
      "past_event",
      "duplicate_existing_event"
    ]);
  });

  it("gera operacoes dry-run para novo evento e correcao de evento existente", async () => {
    const { runManualEventIntake } = await importModule();
    const report = await runManualEventIntake({
      events: [
        {
          title: "DevOpsDays Natal 2026",
          start_date: "2026-05-16",
          end_date: "2026-05-16",
          kind: "conference",
          format: "in-person",
          city: "Natal",
          state: "RN",
          organizer: "DevOpsDays",
          venue: "Natal",
          ticket_url: "https://devopsdays.org/events/2026-natal/welcome/",
          categories: ["cloud"],
          description: "Conferencia tecnica da comunidade DevOpsDays em Natal."
        },
        {
          title: "Build com AI Recife",
          start_date: "2026-05-09",
          end_date: "2026-05-09",
          kind: "workshop",
          format: "in-person",
          city: "Recife",
          state: "PE",
          organizer: "Google Developer Groups",
          venue: "IZI Corporate House",
          ticket_url: "https://gdg.community.dev/events/details/build-com-ai-recife",
          categories: ["ia"],
          description: "Workshop tecnico de IA do GDG Recife.",
          target_path: "src/content/events/build-com-ai-recife.md"
        }
      ],
      categories,
      existingEvents: [
        {
          path: "src/content/events/build-com-ai-recife.md",
          title: "Build com AI Recife",
          start_date: "2026-05-09",
          end_date: "2026-05-09",
          organizer: "Google Developer Groups",
          ticket_url: "https://gdg.community.dev/events/details/build-com-ai-recife",
          source_url: "https://gdg.community.dev/events/details/build-com-ai-recife"
        }
      ],
      todayKey: "2026-04-29"
    });

    expect(report.created_prs).toEqual([
      expect.objectContaining({
        title: "DevOpsDays Natal 2026",
        file_path: "src/content/events/devopsdays-natal-2026.md",
        dry_run: true
      })
    ]);
    expect(report.updated_prs).toEqual([
      expect.objectContaining({
        title: "Build com AI Recife",
        file_path: "src/content/events/build-com-ai-recife.md",
        dry_run: true
      })
    ]);
    await expect(fs.stat(path.join(tempDir, "output/event-intake/manual-latest.json"))).resolves.toBeTruthy();
  });
});
