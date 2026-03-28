import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/event-intake/index.mjs")).href;
const githubModulePath = pathToFileURL(path.resolve("scripts/event-intake/github.mjs")).href;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const originalCwd = process.cwd();

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBlacklist(tempDir, value) {
  const entries = Array.isArray(value.entries) ? value.entries : [];
  const targetPath = path.join(tempDir, "data/event-intake-blacklist.ndjson");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(
    targetPath,
    entries.map((entry) => JSON.stringify(entry)).join("\n").concat(entries.length ? "\n" : ""),
    "utf8"
  );
}

async function writeEvent(tempDir, fileName, frontMatter) {
  const targetPath = path.join(tempDir, "src/content/events", fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `---\n${frontMatter}\n---\n\nDescricao.\n`, "utf8");
}

function makeTextResponse(url, body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        return headers[String(name || "").toLowerCase()] || "";
      }
    },
    text: async () => body
  };
}

function makeFetchMock(routeMap, geminiJson) {
  return vi.fn(async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes("generativelanguage.googleapis.com")) {
      return {
        ok: true,
        status: 200,
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

    const body = routeMap.get(requestUrl);
    if (!body) {
      throw new Error(`URL nao mockada: ${requestUrl}`);
    }

    return makeTextResponse(requestUrl, body);
  });
}

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;
  });

describe("event intake orchestrator", () => {
  it("em dry-run lista um PR para evento de alta confiança", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http",
        keywords: ["cloud", "ia", "frontend"]
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
          '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Fortaleza JS: Cloud, IA e Frontend</a></body></html>'
        ],
        [
          "https://www.meetup.com/fortaleza-js/events/313900001",
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento sobre cloud, ia e software.</body></html>'
        ]
      ]),
      {
        title: "Cloud AI Nordeste Fortaleza",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "Comunidade Cloud CE",
        venue: "Hub de Inovacao",
        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        categories: ["cloud"],
        cover_image: "",
        price: "0",
        description: "Evento sobre cloud, ia e software no Nordeste.",
        summary: "Evento sobre cloud, ia e software no Nordeste.",
        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        source_name: "Meetup Fortaleza",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.created_prs).toHaveLength(1);
    expect(report.created_prs[0].dry_run).toBe(true);
    expect(report.summary.counts.prs).toBe(1);
  });

  it("ignora candidatos que ja existem no repositorio", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);
    await writeEvent(
      tempDir,
      "cloud-ai-nordeste-fortaleza.md",
      'title: "Cloud AI Nordeste Fortaleza"\nstart_date: "2026-04-20"\nend_date: "2026-04-20"\nkind: "conference"\nformat: "in-person"\ncity: "Fortaleza"\nstate: "CE"\norganizer: "Comunidade Cloud CE"\nvenue: "Hub de Inovacao"\nticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/"\nsource_name: "Meetup Fortaleza"\nsource_url: "https://www.meetup.com/fortaleza-js/events/313900001/"\ncategories:\n  - "cloud"\nfeatured: false\ncover_image: ""\nprice: ""'
    );

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
          '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a></body></html>'
        ],
        [
          "https://www.meetup.com/fortaleza-js/events/313900001",
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        ]
      ]),
      {
        title: "Cloud AI Nordeste Fortaleza",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "Comunidade Cloud CE",
        venue: "Hub de Inovacao",
        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento de cloud e ia.",
        summary: "Evento de cloud e ia.",
        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        source_name: "Meetup Fortaleza",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.skipped_duplicates).toHaveLength(1);
    expect(report.summary.counts.duplicates).toBe(1);
  });

  it("descarta eventos online ou fora do Nordeste sem abrir PR", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Recife",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
          '<html><body><a href="https://www.meetup.com/devops-recife/events/313900009/">Cloud remoto</a></body></html>'
        ],
        [
          "https://www.meetup.com/devops-recife/events/313900009",
          '<html><body>Evento online com participantes do Sudeste.</body></html>'
        ]
      ]),
      {
        title: "Cloud remoto Brasil",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "online",
        city: "Sao Paulo",
        state: "SP",
        organizer: "Comunidade Remota",
        venue: "Online",
        ticket_url: "https://www.meetup.com/devops-recife/events/313900009/",
        categories: ["cloud"],
        cover_image: "",
        price: "0",
        description: "Evento online de cloud.",
        summary: "Evento online de cloud.",
        source_url: "https://www.meetup.com/devops-recife/events/313900009/",
        source_name: "Meetup Recife",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.created_prs).toHaveLength(0);
    expect(report.skipped_policy).toHaveLength(1);
    expect(["online_only", "non_northeast"]).toContain(report.skipped_policy[0].reason);
  });

  it("em dry-run registra issue quando o evento fica em baixa confiança", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "ia", name: "IA" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "GDG Fortaleza",
        source_type: "gdg-chapter",
        entry_url: "https://gdg.community.dev/gdg-fortaleza/",
        enabled: true,
        fetch_mode: "http",
        keywords: ["google", "ai", "cloud"]
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://gdg.community.dev/gdg-fortaleza/",
          '<html><body><a href="https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/">Evento</a></body></html>'
        ],
        [
          "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza",
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Build With AI Fortaleza","startDate":"2026-04-10T18:00:00-03:00","endDate":"2026-04-10T22:00:00-03:00","offers":{"@type":"Offer","url":"https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/"}}</script></head><body>Evento.</body></html>'
        ]
      ]),
      {
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
        description: "Evento de ia generativa para a comunidade.",
        summary: "Evento de ia generativa para a comunidade.",
        source_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
        source_name: "GDG Fortaleza",
        ambiguities: ["category_uncertain", "location_uncertain"]
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.created_issues).toHaveLength(1);
    expect(report.created_issues[0].dry_run).toBe(true);
    expect(report.created_prs).toHaveLength(0);
    expect(report.summary.counts.low_confidence).toBe(1);
  });

  it("salva eventos passados no blacklist versionado sem abrir PR", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "GDG Recife",
        source_type: "gdg-chapter",
        entry_url: "https://gdg.community.dev/gdg-recife/",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://gdg.community.dev/gdg-recife/",
          '<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"customBlockData":{"prefetchedData":{"https://gdg.community.dev/api/event_slim/for_chapter/999/?status=Live":{}}}}}}</script></head><body>GDG Recife</body></html>'
        ],
        [
          "https://gdg.community.dev/api/event_slim/for_chapter/999/?status=Live",
          JSON.stringify({
            results: [
              {
                title: "Cloud Day Recife",
                start_date: "2026-01-10T18:00:00-03:00",
                cohost_registration_url:
                  "https://gdg.community.dev/events/details/google-gdg-recife-presents-cloud-day-recife/"
              }
            ]
          })
        ]
      ]),
      {
        title: "Cloud Day Recife",
        start_date: "2026-01-10",
        end_date: "2026-01-10",
        kind: "conference",
        format: "in-person",
        city: "Recife",
        state: "PE",
        organizer: "GDG Recife",
        venue: "Porto Digital",
        ticket_url: "https://gdg.community.dev/events/details/google-gdg-recife-presents-cloud-day-recife/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento passado de cloud.",
        summary: "Evento passado de cloud.",
        source_url: "https://gdg.community.dev/events/details/google-gdg-recife-presents-cloud-day-recife/",
        source_name: "GDG Recife",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      persistBlacklist: true,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    const blacklistPath = path.join(tempDir, "data/event-intake-blacklist.ndjson");
    const blacklistEntries = (await fs.readFile(blacklistPath, "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(report.created_prs).toHaveLength(0);
    expect(report.summary.counts.past).toBe(1);
    expect(report.blacklist_changed).toBe(true);
    expect(blacklistEntries).toHaveLength(1);
    expect(blacklistEntries[0].reason).toBe("past");
  });

  it("nao reprocessa candidatos ja presentes no blacklist versionado", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);
    await writeBlacklist(tempDir, {
      version: 1,
      updated_at: "2026-03-28T00:00:00.000Z",
      entries: [
        {
          key: "abc123",
          title: "Cloud Day Recife",
          source_name: "Meetup Recife",
          source_url: "https://www.meetup.com/devops-recife/events/313900050",
          ticket_url: "https://www.meetup.com/devops-recife/events/313900050",
          reason: "non_northeast",
          details: "",
          state: "SP",
          city: "Sao Paulo",
          format: "in-person",
          start_date: "2026-04-20",
          end_date: "2026-04-20",
          first_seen_on: "2026-03-27",
          last_seen_on: "2026-03-27",
          hit_count: 1
        }
      ]
    });

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Recife",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl === "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR") {
        return {
          ok: true,
          url: requestUrl,
          text: async () =>
            '<html><body><a href="https://www.meetup.com/devops-recife/events/313900050/">Cloud Day Recife</a></body></html>'
        };
      }

      throw new Error(`Nao deveria buscar a pagina do evento blacklisted: ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.summary.counts.blacklisted).toBe(1);
    expect(report.skipped_blacklist).toHaveLength(1);
    expect(report.summary.processed_candidates).toBe(0);
  });

  it("usa feedback humano fechado para barrar eventos rejeitados sem reabrir PR ou issue", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.TOKEN_FOR_CI_EVENTS = "token";
    process.env.GITHUB_REPOSITORY = "baiaotech/baiaotech";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Even3 Eventos",
        source_type: "even3-search",
        entry_url: "https://www.even3.com.br/eventos/",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    vi.doMock(githubModulePath, () => ({
      createOrUpdateEventPr: vi.fn(async () => ({ action: "updated", branch: "x", pr_number: 1 })),
      closeIssueByMarker: vi.fn(async () => null),
      listClosedEventIntakeFeedback: vi.fn(async () => [
        {
          title: "XVI Fórum Internacional de Pedagogia",
          source_name: "Even3 Eventos",
          source_url: "https://www.even3.com.br/fiped",
          ticket_url: "https://www.even3.com.br/fiped",
          feedback_url: "https://github.com/baiaotech/baiaotech/issues/10",
          details: "closed_issue"
        }
      ]),
      upsertIssue: vi.fn(async () => ({ action: "created", issue_number: 1 })),
      syncRepoFileToDefaultBranch: vi.fn(async () => ({ changed: false, branch: "main" }))
    }));

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl === "https://www.even3.com.br/eventos/") {
        return makeTextResponse(
          requestUrl,
          '<html><body><a href="https://www.even3.com.br/fiped/">XVI Fórum Internacional de Pedagogia</a></body></html>'
        );
      }

      throw new Error(`Nao deveria buscar detalhe de evento rejeitado por feedback: ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.feedback_seeded).toBe(1);
    expect(report.summary.counts.blacklisted).toBe(1);
    expect(report.summary.counts.rejected_by_feedback).toBe(1);
    expect(report.created_prs).toEqual([]);
    expect(report.created_issues).toEqual([]);
    expect(report.skipped_blacklist[0]).toMatchObject({
      title: "XVI Fórum Internacional de Pedagogia",
      origin: "review_feedback"
    });
  });

  it("descarta evento academico fora do escopo tech antes de chamar Gemini", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "ia", name: "IA" },
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Even3 Eventos",
        source_type: "even3-search",
        entry_url: "https://www.even3.com.br/eventos/",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("generativelanguage.googleapis.com")) {
        throw new Error("Nao deveria chamar Gemini para evento non_tech evidente");
      }

      if (requestUrl === "https://www.even3.com.br/eventos/") {
        return makeTextResponse(
          requestUrl,
          '<html><body><a href="https://www.even3.com.br/fiped/">Fórum Internacional de Pedagogia e Tecnologia Educacional</a></body></html>'
        );
      }

      if (requestUrl === "https://www.even3.com.br/fiped") {
        return makeTextResponse(
          requestUrl,
          "<html><body><h1>Fórum Internacional de Pedagogia e Tecnologia Educacional</h1><p>Congresso acadêmico sobre pedagogia, educação e práticas docentes. Uso de tecnologia educacional em sala de aula.</p></body></html>"
        );
      }

      throw new Error(`URL nao mockada: ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.summary.counts.non_tech).toBe(1);
    expect(report.created_prs).toEqual([]);
    expect(report.created_issues).toEqual([]);
    expect(report.skipped_policy[0]).toMatchObject({
      reason: "non_tech"
    });
  });

  it("revalida paginas HTTP com ETag e reaproveita o cache em respostas 304", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    const listingUrl = "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR";
    const eventUrl = "https://www.meetup.com/fortaleza-js/events/313900001";
    const callCount = new Map();

    globalThis.fetch = vi.fn(async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        title: "Cloud AI Nordeste Fortaleza",
                        start_date: "2026-04-20",
                        end_date: "2026-04-20",
                        kind: "conference",
                        format: "in-person",
                        city: "Fortaleza",
                        state: "CE",
                        organizer: "Comunidade Cloud CE",
                        venue: "Hub de Inovacao",
                        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        categories: ["cloud"],
                        cover_image: "",
                        price: "",
                        description: "Evento de cloud e ia.",
                        summary: "Evento de cloud e ia.",
                        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        source_name: "Meetup Fortaleza",
                        ambiguities: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }

      const seen = callCount.get(requestUrl) || 0;
      callCount.set(requestUrl, seen + 1);

      if (requestUrl === listingUrl) {
        if (seen === 0) {
          return makeTextResponse(
            requestUrl,
            `<html><body><a href="${eventUrl}/">Cloud AI Nordeste Fortaleza</a></body></html>`,
            200,
            {
              etag: "listing-v1",
              "last-modified": "Wed, 01 Jan 2026 00:00:00 GMT"
            }
          );
        }

        expect(options.headers["if-none-match"]).toBe("listing-v1");
        expect(options.headers["if-modified-since"]).toBe("Wed, 01 Jan 2026 00:00:00 GMT");
        return {
          ok: false,
          status: 304,
          url: requestUrl,
          headers: { get: () => "" },
          text: async () => ""
        };
      }

      if (requestUrl === eventUrl) {
        if (seen === 0) {
          return makeTextResponse(
            requestUrl,
            '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>',
            200,
            {
              etag: "event-v1",
              "last-modified": "Wed, 01 Jan 2026 01:00:00 GMT"
            }
          );
        }

        expect(options.headers["if-none-match"]).toBe("event-v1");
        expect(options.headers["if-modified-since"]).toBe("Wed, 01 Jan 2026 01:00:00 GMT");
        return {
          ok: false,
          status: 304,
          url: requestUrl,
          headers: { get: () => "" },
          text: async () => ""
        };
      }

      throw new Error(`URL nao mockada: ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const firstReport = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });
    const secondReport = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(firstReport.performance.http_cache_misses).toBeGreaterThanOrEqual(2);
    expect(secondReport.performance.http_cache_hits).toBeGreaterThanOrEqual(2);
    expect(secondReport.performance.http_not_modified_304).toBeGreaterThanOrEqual(2);
  });

  it("ignora o cache persistido quando cacheBust=true", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    const listingUrl = "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR";
    const eventUrl = "https://www.meetup.com/fortaleza-js/events/313900001";

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          listingUrl,
          `<html><body><a href="${eventUrl}/">Cloud AI Nordeste Fortaleza</a></body></html>`
        ],
        [
          eventUrl,
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        ]
      ]),
      {
        title: "Cloud AI Nordeste Fortaleza",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "Comunidade Cloud CE",
        venue: "Hub de Inovacao",
        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento de cloud e ia.",
        summary: "Evento de cloud e ia.",
        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        source_name: "Meetup Fortaleza",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    globalThis.fetch = vi.fn(async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        title: "Cloud AI Nordeste Fortaleza",
                        start_date: "2026-04-20",
                        end_date: "2026-04-20",
                        kind: "conference",
                        format: "in-person",
                        city: "Fortaleza",
                        state: "CE",
                        organizer: "Comunidade Cloud CE",
                        venue: "Hub de Inovacao",
                        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        categories: ["cloud"],
                        cover_image: "",
                        price: "",
                        description: "Evento de cloud e ia.",
                        summary: "Evento de cloud e ia.",
                        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        source_name: "Meetup Fortaleza",
                        ambiguities: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }

      expect(options.headers?.["if-none-match"]).toBeUndefined();
      expect(options.headers?.["if-modified-since"]).toBeUndefined();

      if (requestUrl === listingUrl) {
        return makeTextResponse(
          requestUrl,
          `<html><body><a href="${eventUrl}/">Cloud AI Nordeste Fortaleza</a></body></html>`
        );
      }

      if (requestUrl === eventUrl) {
        return makeTextResponse(
          requestUrl,
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        );
      }

      throw new Error(`URL nao mockada: ${requestUrl}`);
    });

    const report = await runEventIntake({
      apply: false,
      cacheBust: true,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.performance.http_cache_hits).toBe(0);
    expect(report.performance.http_not_modified_304).toBe(0);
    expect(report.performance.http_cache_misses).toBeGreaterThanOrEqual(2);
  });

  it("entra em cooldown apos 429 e evita nova tentativa no host ate expirar", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);
      return {
        ok: false,
        status: 429,
        url: requestUrl,
        headers: { get: () => "" },
        text: async () => "Too many requests"
      };
    });

    const { runEventIntake } = await importModule();
    const firstReport = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(firstReport.summary.counts.errors).toBe(1);
    expect(firstReport.performance.host_failures["www.meetup.com"]?.status).toBe(429);

    globalThis.fetch = vi.fn(async () => {
      throw new Error("Nao deveria buscar novamente durante o cooldown");
    });

    const secondReport = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(secondReport.performance.source_cooldown_skips).toBe(1);
    expect(secondReport.summary.sources_processed).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("deduplica candidatos identicos entre fontes e busca o detalhe uma unica vez", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      },
      {
        source_name: "Meetup Ceara",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Ceara,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    const eventUrl = "https://www.meetup.com/fortaleza-js/events/313900001";
    let detailFetches = 0;

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        title: "Cloud AI Nordeste Fortaleza",
                        start_date: "2026-04-20",
                        end_date: "2026-04-20",
                        kind: "conference",
                        format: "in-person",
                        city: "Fortaleza",
                        state: "CE",
                        organizer: "Comunidade Cloud CE",
                        venue: "Hub de Inovacao",
                        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        categories: ["cloud"],
                        cover_image: "",
                        price: "",
                        description: "Evento de cloud e ia.",
                        summary: "Evento de cloud e ia.",
                        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
                        source_name: "Meetup Fortaleza",
                        ambiguities: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }

      if (requestUrl === "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR") {
        return makeTextResponse(
          requestUrl,
          `<html><body><a href="${eventUrl}/">Cloud AI Nordeste Fortaleza</a></body></html>`
        );
      }

      if (requestUrl === "https://www.meetup.com/find/?keywords=tecnologia&location=Ceara,%20BR") {
        return makeTextResponse(
          requestUrl,
          `<html><body><a href="${eventUrl}/">Cloud AI Nordeste Fortaleza</a></body></html>`
        );
      }

      if (requestUrl === eventUrl) {
        detailFetches += 1;
        return makeTextResponse(
          requestUrl,
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        );
      }

      throw new Error(`URL nao mockada: ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 2,
      maxUniqueUrls: 10
    });

    expect(detailFetches).toBe(1);
    expect(report.summary.counts.prs).toBe(1);
    expect(report.summary.counts.duplicates).toBe(1);
  });

  it("em modo apply cria PR real do intake usando o cliente GitHub", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.TOKEN_FOR_CI_EVENTS = "token";
    process.env.GITHUB_REPOSITORY = "baiaotech/baiaotech";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    const createOrUpdateEventPr = vi.fn(async () => ({
      action: "updated",
      branch: "event-intake/cloud-ai-nordeste-fortaleza",
      pr_number: 77
    }));
    const closeIssueByMarker = vi.fn(async () => null);
    const upsertIssue = vi.fn(async () => ({ action: "created", issue_number: 1 }));
    const syncRepoFileToDefaultBranch = vi.fn(async () => ({ changed: true, branch: "main" }));
    vi.doMock(githubModulePath, () => ({
      createOrUpdateEventPr,
      closeIssueByMarker,
      listClosedEventIntakeFeedback: vi.fn(async () => []),
      upsertIssue,
      syncRepoFileToDefaultBranch
    }));

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
          '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a></body></html>'
        ],
        [
          "https://www.meetup.com/fortaleza-js/events/313900001",
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        ]
      ]),
      {
        title: "Cloud AI Nordeste Fortaleza",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "Comunidade Cloud CE",
        venue: "Hub de Inovacao",
        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento de cloud e ia.",
        summary: "Evento de cloud e ia.",
        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        source_name: "Meetup Fortaleza",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: true,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.created_prs).toEqual([]);
    expect(report.updated_prs).toEqual([
      {
        title: "Cloud AI Nordeste Fortaleza",
        pr_number: 77,
        branch: "event-intake/cloud-ai-nordeste-fortaleza"
      }
    ]);
    expect(createOrUpdateEventPr).toHaveBeenCalledTimes(1);
    expect(closeIssueByMarker).toHaveBeenCalledTimes(1);
    expect(upsertIssue).not.toHaveBeenCalled();
    expect(syncRepoFileToDefaultBranch).not.toHaveBeenCalled();
  });

  it("em modo apply sincroniza o blacklist quando descarta evento por politica", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.TOKEN_FOR_CI_EVENTS = "token";
    process.env.GITHUB_REPOSITORY = "baiaotech/baiaotech";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Recife",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    const syncRepoFileToDefaultBranch = vi.fn(async () => ({ changed: true, branch: "main" }));
    vi.doMock(githubModulePath, () => ({
      createOrUpdateEventPr: vi.fn(async () => ({ action: "updated", branch: "x", pr_number: 1 })),
      closeIssueByMarker: vi.fn(async () => null),
      listClosedEventIntakeFeedback: vi.fn(async () => []),
      upsertIssue: vi.fn(async () => ({ action: "created", issue_number: 1 })),
      syncRepoFileToDefaultBranch
    }));

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
          '<html><body><a href="https://www.meetup.com/devops-recife/events/313900009/">Cloud remoto</a></body></html>'
        ],
        [
          "https://www.meetup.com/devops-recife/events/313900009",
          "<html><body>Evento online.</body></html>"
        ]
      ]),
      {
        title: "Cloud remoto Brasil",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "online",
        city: "Recife",
        state: "PE",
        organizer: "Comunidade Remota",
        venue: "Online",
        ticket_url: "https://www.meetup.com/devops-recife/events/313900009/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento online de cloud.",
        summary: "Evento online de cloud.",
        source_url: "https://www.meetup.com/devops-recife/events/313900009/",
        source_name: "Meetup Recife",
        ambiguities: []
      }
    );

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: true,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.summary.counts.online_only).toBe(1);
    expect(report.blacklist_changed).toBe(true);
    expect(report.blacklist_sync).toEqual({ changed: true, branch: "main" });
    expect(syncRepoFileToDefaultBranch).toHaveBeenCalledTimes(1);
  });

  it("falha cedo no main quando apply nao tem token configurado", async () => {
    delete process.env.TOKEN_FOR_CI_EVENTS;
    const { main } = await importModule();

    await expect(main(["--apply"])).rejects.toThrow(
      "TOKEN_FOR_CI_EVENTS precisa estar definido para executar em modo apply."
    );
  });

  it("em modo apply cria issue real para evento de baixa confiança", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "ia", name: "IA" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.TOKEN_FOR_CI_EVENTS = "token";
    process.env.GITHUB_REPOSITORY = "baiaotech/baiaotech";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "GDG Fortaleza",
        source_type: "gdg-chapter",
        entry_url: "https://gdg.community.dev/gdg-fortaleza/",
        enabled: true,
        fetch_mode: "http",
        keywords: ["google", "ai", "cloud"]
      }
    ]);
    vi.doUnmock(githubModulePath);

    globalThis.fetch = vi.fn(async (url, options = {}) => {
      const requestUrl = String(url);
      const method = options.method || "GET";

      if (requestUrl.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
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
                        description: "Evento de ia generativa para a comunidade.",
                        summary: "Evento de ia generativa para a comunidade.",
                        source_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/",
                        source_name: "GDG Fortaleza",
                        ambiguities: ["category_uncertain", "location_uncertain"]
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }

      if (requestUrl === "https://gdg.community.dev/gdg-fortaleza/") {
        return makeTextResponse(
          requestUrl,
          '<html><body><a href="https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/">Evento</a></body></html>'
        );
      }

      if (requestUrl === "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza") {
        return makeTextResponse(requestUrl, "<html><body>Evento.</body></html>");
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/issues?state=closed&labels=event-intake&per_page=100") {
        return {
          ok: true,
          status: 200,
          json: async () => []
        };
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/pulls?state=closed&per_page=100") {
        return {
          ok: true,
          status: 200,
          json: async () => []
        };
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/labels/event-intake") {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: "Not Found" }),
          text: async () => "{\"message\":\"Not Found\"}"
        };
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/labels" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ name: "event-intake" })
        };
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/issues?state=open&labels=event-intake&per_page=100") {
        return {
          ok: true,
          status: 200,
          json: async () => []
        };
      }

      if (requestUrl === "https://api.github.com/repos/baiaotech/baiaotech/issues" && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ number: 88 })
        };
      }

      throw new Error(`URL nao mockada: ${method} ${requestUrl}`);
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: true,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.created_issues).toEqual([
      {
        title: "Build With AI Fortaleza",
        issue_number: 88,
        action: "created",
        source_url: "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza"
      }
    ]);
    expect(
      globalThis.fetch.mock.calls.some(([url, options = {}]) =>
        String(url) === "https://api.github.com/repos/baiaotech/baiaotech/issues" &&
        (options.method || "GET") === "POST"
      )
    ).toBe(true);
  });

  it("registra erro por candidato quando a pagina do evento falha", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl === "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR") {
        return {
          ok: true,
          url: requestUrl,
          text: async () =>
            '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a></body></html>'
        };
      }

      return {
        ok: false,
        status: 503,
        url: requestUrl,
        text: async () => "Service unavailable"
      };
    });

    const { runEventIntake } = await importModule();
    const report = await runEventIntake({
      apply: false,
      maxSources: 1,
      maxUniqueUrls: 10
    });

    expect(report.summary.counts.errors).toBe(1);
    expect(report.errors[0].event_url).toBe("https://www.meetup.com/fortaleza-js/events/313900001");
  });

  it("o main nao falha quando existem apenas erros recuperaveis de coleta", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = vi.fn(async (url) => {
      const requestUrl = String(url);

      if (requestUrl === "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR") {
        return {
          ok: true,
          url: requestUrl,
          text: async () =>
            '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a></body></html>'
        };
      }

      throw new Error("fetch failed");
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { main } = await importModule();

    process.exitCode = undefined;
    await expect(main(["--dry-run", "--max-sources=1", "--max-urls=10"])).resolves.toBeUndefined();

    expect(process.exitCode).toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain("erro(s) recuperavel(is)");
  });

  it("o main interpreta os argumentos de dry-run e imprime o relatorio final", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-intake-"));
    await writeJson(path.join(tempDir, "src/_data/categories.json"), [
      { slug: "cloud", name: "Cloud" }
    ]);

    process.chdir(tempDir);
    process.env.GEMINI_API_KEY = "test-key";
    process.env.EVENT_INTAKE_SOURCES_JSON = JSON.stringify([
      {
        source_name: "Meetup Fortaleza",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        enabled: true,
        fetch_mode: "http"
      },
      {
        source_name: "Meetup Recife",
        source_type: "meetup-search",
        entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Recife,%20BR",
        enabled: true,
        fetch_mode: "http"
      }
    ]);

    globalThis.fetch = makeFetchMock(
      new Map([
        [
          "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
          '<html><body><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a><a href="https://www.meetup.com/fortaleza-js/events/313900001/">Cloud AI Nordeste Fortaleza</a></body></html>'
        ],
        [
          "https://www.meetup.com/fortaleza-js/events/313900001",
          '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Cloud AI Nordeste Fortaleza","startDate":"2026-04-20T19:00:00-03:00","endDate":"2026-04-20T22:00:00-03:00","organizer":{"@type":"Organization","name":"Comunidade Cloud CE"},"location":{"@type":"Place","name":"Hub de Inovacao","address":{"@type":"PostalAddress","addressLocality":"Fortaleza","addressRegion":"CE"}},"offers":{"@type":"Offer","url":"https://www.meetup.com/fortaleza-js/events/313900001/"}}</script></head><body>Evento cloud.</body></html>'
        ]
      ]),
      {
        title: "Cloud AI Nordeste Fortaleza",
        start_date: "2026-04-20",
        end_date: "2026-04-20",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "Comunidade Cloud CE",
        venue: "Hub de Inovacao",
        ticket_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        categories: ["cloud"],
        cover_image: "",
        price: "",
        description: "Evento de cloud e ia.",
        summary: "Evento de cloud e ia.",
        source_url: "https://www.meetup.com/fortaleza-js/events/313900001/",
        source_name: "Meetup Fortaleza",
        ambiguities: []
      }
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { main } = await importModule();
    await main([
      "--dry-run",
      "--source-type=meetup-search",
      "--max-sources=2",
      "--max-urls=1"
    ]);

    expect(consoleSpy).toHaveBeenCalledOnce();
    const printed = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(printed.summary.processed_candidates).toBe(1);
    expect(printed.summary.sources_processed).toBe(1);
  });
});
