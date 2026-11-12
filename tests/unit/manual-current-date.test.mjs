import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildManualEventOperations, normalizeManualEvent, validateManualEvent } from "../../scripts/event-intake/manual.mjs";

const raw = {
  title: "Oficina de software", start_date: "2026-11-10", end_date: "2026-11-11",
  format: "in-person", city: "Fortaleza", state: "CE", organizer: "Comunidade",
  venue: "Auditório", source_url: "https://example.org/oficina", ticket_url: "https://example.org/oficina",
  categories: ["backend"], description: "Oficina de desenvolvimento de software e APIs.",
  tech_relevance: "direct", tech_audience: "tech", tech_topics: ["software"],
  tech_evidence: ["Programação de APIs"], kind: "workshop"
};
const candidate = normalizeManualEvent(raw, { categorySlugs: ["backend"] });
afterEach(() => vi.useRealTimers());

describe("manual intake current editorial date", () => {
  it("uses Fortaleza date and recalculates after local midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T02:59:59Z"));
    expect(validateManualEvent(candidate, raw)).not.toContain("past_event");
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
    expect(validateManualEvent(candidate, raw)).toContain("past_event");
  });
  it("rejects expired operations without a today override", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const result = await buildManualEventOperations([raw], {
      categories: [{slug: "backend"}], existingEvents: []
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("past_event");
  });
  it("preserves explicit dates for reproducible tests", () => {
    expect(validateManualEvent(candidate, raw, {todayKey: "2026-11-11"})).not.toContain("past_event");
  });
  it("does not pin the workflow to a literal date", () => {
    const workflow = readFileSync(new URL("../../.github/workflows/event-intake.yml", import.meta.url), "utf8");
    expect(workflow).not.toMatch(/--today=\d{4}-\d{2}-\d{2}/);
  });
});
