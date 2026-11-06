import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../scripts/event-intake/github.mjs", () => ({
  createOrUpdateEventPr: vi.fn()
}));

import { createOrUpdateEventPr } from "../../../scripts/event-intake/github.mjs";
import {
  buildManualEventOperations,
  normalizeManualCategories,
  normalizeManualKind,
  parseManualEventsJson,
  parseManualEventsMarkdown,
  runManualEventIntake,
  validateManualEvent
} from "../../../scripts/event-intake/manual.mjs";

const originalCwd = process.cwd();
const categories = [{ slug: "cloud", name: "Cloud" }, { slug: "ia", name: "IA" }];
const validEvent = {
  title: "Cloud Recife 2027",
  start_date: "2027-03-10",
  end_date: "2027-03-10",
  kind: "conference",
  format: "in-person",
  city: "Recife",
  state: "PE",
  organizer: "Comunidade Cloud",
  venue: "Porto Digital",
  source_url: "https://example.com/cloud-recife",
  ticket_url: "https://example.com/cloud-recife",
  categories: ["cloud"],
  description: "Conferencia de cloud e software para desenvolvedores.",
  tech_relevance: "direct",
  tech_audience: "tech"
};
const options = { categories, existingEvents: [], todayKey: "2027-01-01" };

describe("manual event intake validation and execution", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-manual-validation-"));
    process.chdir(tempDir);
    vi.stubEnv("MANUAL_EVENT_INTAKE_JSON", "");
    vi.stubEnv("MANUAL_EVENT_INTAKE_FILE", "");
    vi.stubEnv("TOKEN_FOR_CI_EVENTS", "");
    vi.stubEnv("GITHUB_REPOSITORY", "");
    vi.mocked(createOrUpdateEventPr).mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("aceita JSON em array ou envelope e rejeita formatos inesperados", () => {
    expect(parseManualEventsJson(JSON.stringify([validEvent]))).toEqual([{ index: 1, ...validEvent }]);
    expect(parseManualEventsJson(JSON.stringify({ events: [validEvent] }))).toEqual([{ index: 1, ...validEvent }]);
    expect(parseManualEventsJson()).toEqual([]);
    expect(() => parseManualEventsJson('{"events":{}}')).toThrow("deve ser um array");
    expect(() => parseManualEventsJson("{invalid")).toThrow(SyntaxError);
  });

  it("sinaliza YAML invalido e ignora blocos sem titulo", () => {
    expect(parseManualEventsMarkdown()).toEqual([]);
    expect(parseManualEventsMarkdown("---\norganizer: Comunidade\n---\nSem titulo.")).toEqual([]);
    expect(parseManualEventsMarkdown('---\ntitle: "incompleto\n---\nTexto.')).toEqual([
      { index: 1, title: "", description: "", manual_rejection_reason: "invalid_front_matter" }
    ]);
    expect(parseManualEventsMarkdown('---\ntitle: Evento\ndescription: Resumo editorial\n---\nCorpo.')[0].description)
      .toBe("Resumo editorial");
  });

  it("mapeia categorias conhecidas, deduplica e infere tipos desconhecidos", () => {
    expect(normalizeManualCategories(["AWS", "cloud", "desconhecida"], "", ["cloud"]))
      .toEqual(["cloud"]);
    expect(normalizeManualCategories("cloud", "Workshop de cloud", ["cloud"]))
      .toEqual(["cloud"]);
    expect(normalizeManualKind("course")).toBe("workshop");
    expect(normalizeManualKind("desconhecido", "Hackathon Cloud", "")).toBe("hackathon");
  });

  it.each([
    ["missing_title", { title: "" }],
    ["missing_categories", { categories: [] }],
    ["online_only", { format: "online" }],
    ["non_northeast_or_missing_state", { state: "SP" }],
    ["not_direct_tech", { tech_relevance: "adjacent" }],
    ["not_direct_tech", { tech_audience: "general" }],
    ["past_event", { end_date: "2026-12-31" }]
  ])("rejeita %s sem publicar um evento", (issue, changes) => {
    expect(validateManualEvent({ ...validEvent, ...changes }, {}, options)).toContain(issue);
    expect(createOrUpdateEventPr).not.toHaveBeenCalled();
  });

  it("distingue URL invalida de placeholder e aceita o dia atual", () => {
    expect(validateManualEvent({ ...validEvent, source_url: "", ticket_url: "" }, { source_url: "nao e URL" }, options))
      .toContain("invalid_url");
    expect(validateManualEvent(validEvent, { source_url: "https://..." }, options)).toContain("placeholder_url");
    expect(validateManualEvent({ ...validEvent, end_date: options.todayKey }, {}, options)).toEqual([]);
  });

  it("rejeita atualizacao de arquivo inexistente e candidato com local incerto", async () => {
    const result = await buildManualEventOperations([
      { ...validEvent, target_path: "src/content/events/inexistente.md" },
      { ...validEvent, ambiguities: ["location_uncertain"] }
    ], options);
    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((item) => item.reason)).toEqual(["target_path_not_found", "low_confidence"]);
    expect(result.rejected[0].details).toEqual(["src/content/events/inexistente.md"]);
  });

  it("detecta conflito de slug mesmo quando fonte e data sao diferentes", async () => {
    const result = await buildManualEventOperations([validEvent], {
      ...options,
      existingEvents: [{
        path: "src/content/events/cloud-recife-2027.md",
        title: validEvent.title,
        start_date: "2026-01-01",
        organizer: "Outro organizador",
        source_url: "https://example.com/outro-evento"
      }]
    });
    expect(result.rejected[0]).toMatchObject({
      reason: "duplicate_existing_event", matched_path: "src/content/events/cloud-recife-2027.md"
    });
  });

  it.each(["json", "file", "env-json", "env-file"])("le entradas por %s sem enviar PR no dry-run", async (inputType) => {
    const input = {};
    if (inputType.endsWith("json")) {
      const json = JSON.stringify([validEvent]);
      if (inputType === "json") input.json = json;
      else vi.stubEnv("MANUAL_EVENT_INTAKE_JSON", json);
    } else {
      const file = path.join(tempDir, "EVENTS.md");
      await fs.writeFile(file, `---\n${JSON.stringify(validEvent)}\n---\n`);
      if (inputType === "file") input.file = file;
      else vi.stubEnv("MANUAL_EVENT_INTAKE_FILE", file);
    }
    const report = await runManualEventIntake({ ...options, ...input });
    expect(report.summary).toMatchObject({ candidates: 1, accepted: 1, created_prs: 1 });
    expect(report.created_prs[0].dry_run).toBe(true);
    expect(createOrUpdateEventPr).not.toHaveBeenCalled();
    const saved = JSON.parse(await fs.readFile(path.join(tempDir, "output/event-intake/manual-latest.json"), "utf8"));
    expect(saved).toEqual(report);
  });

  it("exige entrada e credenciais explicitas antes de publicar", async () => {
    await expect(runManualEventIntake(options)).rejects.toThrow("Informe MANUAL_EVENT_INTAKE_JSON");
    await expect(runManualEventIntake({ ...options, events: [], apply: true }))
      .rejects.toThrow("TOKEN_FOR_CI_EVENTS precisa estar definido");
    vi.stubEnv("TOKEN_FOR_CI_EVENTS", "test-token");
    await expect(runManualEventIntake({ ...options, events: [], apply: true }))
      .rejects.toThrow("GITHUB_REPOSITORY precisa estar definido");
    expect(createOrUpdateEventPr).not.toHaveBeenCalled();
  });

  it("separa criacoes, atualizacoes e operacoes sem mudanca no relatorio", async () => {
    vi.stubEnv("TOKEN_FOR_CI_EVENTS", "test-token");
    vi.stubEnv("GITHUB_REPOSITORY", "example/events");
    vi.mocked(createOrUpdateEventPr)
      .mockResolvedValueOnce({ action: "updated", pr_number: 1, branch: "event-intake/novo" })
      .mockResolvedValueOnce({ action: "updated", pr_number: 2, branch: "event-intake/corrigir" })
      .mockResolvedValueOnce({ action: "noop", pr_number: 3, branch: "event-intake/igual" });
    const target = "src/content/events/evento-existente.md";
    const report = await runManualEventIntake({
      ...options,
      apply: true,
      existingEvents: [{ path: target }],
      events: [validEvent, { ...validEvent, target_path: target }, { ...validEvent, target_path: target }]
    });
    expect(report.summary).toMatchObject({ accepted: 3, created_prs: 1, updated_prs: 1, noop_prs: 1 });
    expect(report.created_prs[0].pr_number).toBe(1);
    expect(report.updated_prs[0].pr_number).toBe(2);
    expect(report.noop_prs[0].pr_number).toBe(3);
    expect(createOrUpdateEventPr).toHaveBeenNthCalledWith(2, expect.objectContaining({
      repo: "example/events", filePath: target,
      prTitle: `fix(events): update ${validEvent.title}`,
      prBody: expect.stringContaining("corrigir evento existente"),
      content: expect.stringContaining('title: "Cloud Recife 2027"')
    }));
  });
});
