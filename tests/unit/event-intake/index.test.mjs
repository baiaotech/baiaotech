import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/event-intake/index.mjs")).href;
const originalFetch = globalThis.fetch;

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeEvent(tempDir, fileName, frontMatter) {
  const targetPath = path.join(tempDir, "src/content/events", fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `---\n${frontMatter}\n---\n\nDescricao.\n`, "utf8");
}

function makeFetchMock({ sourceHtml, eventHtml, geminiJson }) {
  return vi.fn(async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(geminiJson) }]
              }
            }
          ]
        })
      };
    }

    const body =
      String(url).includes("/events/") && !String(url).includes("meetup.com/pt-BR/aws-user-group-joao-pessoa/events/")
        ? eventHtml
        : sourceHtml;

    return {
      ok: true,
      url: String(url),
      text: async () => body
    };
  });
}

const originalEnv = { ...process.env };
const originalCwd = process.cwd();

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
});

describe("event intake orchestrator", () => {
  it("em dry-run lista um PR para evento de alta confiança", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "data/event-sources.json"), [
      {
        source_name: "AWS User Group João Pessoa",
        source_type: "meetup-group",
        entry_url: "https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/",
        enabled: true,
        state: "PB",
        city: "João Pessoa",
        fetch_mode: "http"
      }
    ]);
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = makeFetchMock({
      sourceHtml:
        '<html><body><a href="https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/313477743/">Evento</a></body></html>',
      eventHtml:
        '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"AWS Community Day João Pessoa","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"AWS User Group João Pessoa"},"location":{"@type":"Place","name":"Hub PB","address":{"@type":"PostalAddress","addressLocality":"João Pessoa","addressRegion":"PB"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/313477743/"}}</script></head><body>Evento cloud.</body></html>',
      geminiJson: {
        title: "AWS Community Day João Pessoa",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "João Pessoa",
        state: "PB",
        organizer: "AWS User Group João Pessoa",
        venue: "Hub PB",
        ticket_url: "https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/313477743/",
        categories: ["cloud"],
        cover_image: "",
        price: "0",
        description: "Evento da comunidade AWS em João Pessoa.",
        summary: "Evento da comunidade AWS em João Pessoa.",
        source_url: "https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/313477743/",
        source_name: "AWS User Group João Pessoa",
        ambiguities: []
      }
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({ apply: false, maxSources: 1, maxCandidates: 1 });

    expect(report.created_prs).toHaveLength(1);
    expect(report.created_prs[0].dry_run).toBe(true);
  });

  it("ignora candidatos que ja existem no repositorio", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "data/event-sources.json"), [
      {
        source_name: "GDG Fortaleza",
        source_type: "generic-html",
        entry_url: "https://gdg.community.dev/gdg-fortaleza/",
        enabled: true,
        state: "CE",
        city: "Fortaleza",
        fetch_mode: "http"
      }
    ]);
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "ia", name: "IA" }
    ]);
    await writeEvent(
      tempDir,
      "build-with-ai-fortaleza.md",
      'title: "Build With AI Fortaleza"\nstart_date: "2026-04-10"\nend_date: "2026-04-10"\nkind: "workshop"\nformat: "in-person"\ncity: "Fortaleza"\nstate: "CE"\norganizer: "GDG Fortaleza"\nvenue: "Hub"\nticket_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/"\nsource_name: "GDG Fortaleza"\nsource_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/"\ncategories:\n  - "ia"\nfeatured: false\ncover_image: ""\nprice: ""'
    );

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = makeFetchMock({
      sourceHtml:
        '<html><body><a href="https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/">Evento</a></body></html>',
      eventHtml: '<html><body>unused</body></html>',
      geminiJson: {
        title: "Build With AI Fortaleza",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        kind: "workshop",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "GDG Fortaleza",
        venue: "Hub",
        ticket_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
        categories: ["ia"],
        cover_image: "",
        price: "",
        description: "Evento.",
        summary: "Evento.",
        source_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
        source_name: "GDG Fortaleza",
        ambiguities: []
      }
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({ apply: false, maxSources: 1, maxCandidates: 1 });

    expect(report.skipped_duplicates).toHaveLength(1);
  });

  it("manda para fila de baixa confiança quando faltam categoria e local", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "data/event-sources.json"), [
      {
        source_name: "GDG Fortaleza",
        source_type: "generic-html",
        entry_url: "https://gdg.community.dev/gdg-fortaleza/",
        enabled: true,
        state: "CE",
        city: "Fortaleza",
        fetch_mode: "http"
      }
    ]);
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "ia", name: "IA" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    globalThis.fetch = makeFetchMock({
      sourceHtml:
        '<html><body><a href="https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/">Evento</a></body></html>',
      eventHtml:
        '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Build With AI Fortaleza","startDate":"2026-04-10T18:00:00-03:00","endDate":"2026-04-10T22:00:00-03:00","offers":{"@type":"Offer","url":"https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/"}}</script></head><body>Evento.</body></html>',
      geminiJson: {
        title: "Build With AI Fortaleza",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        kind: "workshop",
        format: "in-person",
        city: "",
        state: "",
        organizer: "GDG Fortaleza",
        venue: "",
        ticket_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
        categories: [],
        cover_image: "",
        price: "",
        description: "Evento.",
        summary: "Evento.",
        source_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
        source_name: "GDG Fortaleza",
        ambiguities: ["category_uncertain", "location_uncertain"]
      }
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({ apply: false, maxSources: 1, maxCandidates: 1 });

    expect(report.skipped_low_confidence).toHaveLength(1);
    expect(report.created_prs).toHaveLength(0);
  });
});
