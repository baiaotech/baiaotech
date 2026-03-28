import { describe, expect, it } from "vitest";

import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildPrBody,
  buildPrTitle,
  classifyIntakeCandidate,
  ensureEventDefaults,
  findExistingEvent,
  hashString,
  htmlToText,
  parseEventSources,
  normalizeUrl,
  normalizeStateCode,
  scoreNormalizedEvent
} from "../../../scripts/event-intake/shared.mjs";

describe("event intake shared helpers", () => {
  it("normaliza URLs e remove tracking params", () => {
    expect(
      normalizeUrl("https://example.com/evento/?utm_source=x&fbclid=y#section")
    ).toBe("https://example.com/evento");
  });

  it("gera hashes determinísticos em sha256 e saneia HTML sem regex custosa", () => {
    expect(hashString("https://example.com/evento")).toHaveLength(64);
    expect(hashString("https://example.com/evento")).toBe(hashString("https://example.com/evento"));
    expect(
      htmlToText("<p>Oi</p>   <ul><li>Primeiro</li><li>Segundo</li></ul><div>  Fim </div>")
    ).toBe("Oi\n\nPrimeiro\nSegundo\nFim");
  });

  it("faz parse do registro inline de fontes", () => {
    const sources = parseEventSources(`[
      {
        "source_name": "Meetup Fortaleza",
        "source_type": "meetup-search",
        "entry_url": "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
        "enabled": true,
        "fetch_mode": "http"
      }
    ]`);

    expect(sources).toHaveLength(1);
    expect(sources[0].source_type).toBe("meetup-search");
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
        venue: "Hub de Inovacao",
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

  it("classifica corretamente PR, issue e descartes de politica", () => {
    const baseCandidate = ensureEventDefaults(
      {
        title: "Cloud AI Nordeste",
        start_date: "2026-04-10",
        end_date: "2026-04-10",
        kind: "conference",
        format: "in-person",
        city: "Fortaleza",
        state: "Ceara",
        organizer: "Comunidade Cloud",
        venue: "Hub",
        source_url: "https://example.com/evento",
        ticket_url: "https://example.com/evento",
        categories: ["cloud"],
        description: "Evento de cloud, ia e software no Nordeste.",
        source_name: "Source"
      },
      ["cloud"]
    );
    const baseScore = scoreNormalizedEvent(baseCandidate);

    expect(normalizeStateCode("Ceará")).toBe("CE");
    expect(classifyIntakeCandidate(baseCandidate, baseScore, { todayKey: "2026-03-28" }).action).toBe("pr");
    expect(classifyIntakeCandidate({ ...baseCandidate, format: "online" }, baseScore, { todayKey: "2026-03-28" })).toEqual({
      action: "skip",
      reason: "online_only"
    });
    expect(classifyIntakeCandidate({ ...baseCandidate, state: "SP" }, baseScore, { todayKey: "2026-03-28" })).toEqual({
      action: "skip",
      reason: "non_northeast"
    });
    expect(classifyIntakeCandidate({ ...baseCandidate, end_date: "2026-03-01" }, baseScore, { todayKey: "2026-03-28" })).toEqual({
      action: "skip",
      reason: "past"
    });
    expect(classifyIntakeCandidate({ ...baseCandidate, categories: [], description: "Conteudo sem local nem categoria clara" }, {
      ...baseScore,
      isHighConfidence: false,
      missingCategory: true,
      missingLocation: true,
      missingRequired: false,
      blockingAmbiguities: ["location_uncertain"]
    }, { todayKey: "2026-03-28" })).toEqual({
      action: "issue",
      reason: "low_confidence"
    });
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
