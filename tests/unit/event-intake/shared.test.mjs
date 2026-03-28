import { describe, expect, it } from "vitest";

import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildPrBody,
  buildPrTitle,
  ensureEventDefaults,
  findExistingEvent,
  normalizeUrl,
  scoreNormalizedEvent
} from "../../../scripts/event-intake/shared.mjs";

describe("event intake shared helpers", () => {
  it("normaliza URLs e remove tracking params", () => {
    expect(
      normalizeUrl("https://example.com/evento/?utm_source=x&fbclid=y#section")
    ).toBe("https://example.com/evento");
  });

  it("deduplica por source_url e por similaridade", () => {
    const existingEvents = [
      {
        path: "src/content/events/frontend-day.md",
        title: "Frontend Day 2025",
        start_date: "2025-09-20",
        organizer: "FrontendCE",
        ticket_url: "",
        source_url: "https://eventos.frontendce.com.br/event/front-end-day-2025"
      }
    ];

    expect(
      findExistingEvent(existingEvents, {
        title: "Qualquer titulo",
        start_date: "2025-09-20",
        organizer: "FrontendCE",
        source_url: "https://eventos.frontendce.com.br/event/front-end-day-2025"
      })?.reason
    ).toBe("source_url");

    expect(
      findExistingEvent(existingEvents, {
        title: "Frontend Day 2025",
        start_date: "2025-09-20",
        organizer: "FrontendCE",
        source_url: ""
      })?.reason
    ).toBe("title_date_organizer");
  });

  it("exige categoria e local para considerar alta confiança", () => {
    const normalized = ensureEventDefaults(
      {
        title: "Build with AI Fortaleza",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        organizer: "GDG Fortaleza",
        venue: "Online",
        state: "CE",
        source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza",
        ticket_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza",
        description: "Evento sobre IA generativa.",
        categories: ["ia"],
        source_name: "GDG Fortaleza"
      },
      ["ia"]
    );

    expect(scoreNormalizedEvent(normalized).isHighConfidence).toBe(true);
    expect(scoreNormalizedEvent({ ...normalized, categories: [] }).isHighConfidence).toBe(false);
  });

  it("monta markdown, branch e corpos de PR/issue com rastreabilidade", () => {
    const candidate = ensureEventDefaults(
      {
        title: "Build with AI Fortaleza",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        kind: "workshop",
        format: "in-person",
        city: "Fortaleza",
        state: "CE",
        organizer: "GDG Fortaleza",
        venue: "Hub de Inovação",
        ticket_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza",
        source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza",
        source_name: "GDG Fortaleza",
        categories: ["ia"],
        description: "Evento sobre IA generativa.",
        summary: "Resumo curto"
      },
      ["ia"]
    );
    const scoreResult = scoreNormalizedEvent(candidate);

    expect(buildBranchName(candidate)).toMatch(/^event-intake\//);
    expect(buildPrTitle(candidate)).toBe("feat(events): add Build with AI Fortaleza");
    expect(buildEventMarkdown(candidate)).toContain('source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza"');
    expect(buildPrBody(candidate, scoreResult)).toContain("event-intake-source:");
    expect(buildIssueBody(candidate, scoreResult)).toContain("JSON extraido");
  });
});
