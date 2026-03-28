import { describe, expect, it } from "vitest";

import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildPrBody,
  buildPrTitle,
  classifyIntakeCandidate,
  evaluateTechRelevanceDeterministic,
  ensureEventDefaults,
  fingerprintTitle,
  findExistingEvent,
  hashString,
  htmlToText,
  inferDeterministicNortheastLocation,
  inferCategoriesFromText,
  inferEventFormat,
  inferEventKind,
  inferNortheastLocationFromText,
  looksLikeGenericDirectoryPage,
  looksLikeMeetupListingUrl,
  looksLikeDoityEventUrl,
  looksLikeEven3EventUrl,
  looksLikeGenericCommunityEventUrl,
  matchesTechnologyKeywords,
  parseLocationParts,
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
    expect(fingerprintTitle("Build With AI Fortaleza")).toBe(fingerprintTitle("build with ai fortaleza"));
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

  it("reconhece localizacao, formato, categorias e URLs de plataformas", () => {
    expect(
      inferNortheastLocationFromText("Workshop presencial em Recife, Pernambuco")
    ).toEqual({
      city: "RECIFE",
      state: "PE",
      matched_text: "RECIFE"
    });
    expect(
      inferNortheastLocationFromText("Comunidade distribuida no Brasil inteiro")
    ).toEqual({
      city: "",
      state: "",
      matched_text: ""
    });

    expect(matchesTechnologyKeywords("Encontro de cloud, dados e IA no Nordeste")).toBe(true);
    expect(matchesTechnologyKeywords("Festival gastronomico na praia")).toBe(false);

    expect(looksLikeEven3EventUrl("https://www.even3.com.br/devops-day-nordeste")).toBe(true);
    expect(looksLikeEven3EventUrl("https://www.even3.com.br/eventos")).toBe(false);
    expect(looksLikeDoityEventUrl("https://doity.com.br/devops-summit")).toBe(true);
    expect(looksLikeDoityEventUrl("https://doity.com.br/eventos")).toBe(false);
    expect(
      looksLikeGenericCommunityEventUrl("/agenda/devops-day", "https://frontendce.com.br")
    ).toBe(true);
    expect(
      looksLikeGenericCommunityEventUrl("/blog/post", "https://frontendce.com.br")
    ).toBe(false);
    expect(looksLikeMeetupListingUrl("https://www.meetup.com/pt-BR/owasp-fortaleza/events")).toBe(true);
    expect(looksLikeMeetupListingUrl("https://www.meetup.com/fortaleza-js/events/313900001")).toBe(false);
    expect(
      looksLikeGenericDirectoryPage({
        title: "OWASP Fortaleza Chapter | Meetup",
        description:
          "Encontre eventos Meetup para fazer mais do que é importante para você. Ou crie seu próprio grupo."
      })
    ).toBe(true);
    expect(
      looksLikeGenericDirectoryPage({
        title: "Build With AI Fortaleza",
        description: "Workshop presencial com foco em IA generativa."
      })
    ).toBe(false);

    expect(inferEventKind("Security Summit Nordeste", "Forum presencial")).toBe("summit");
    expect(inferEventKind("Hackathon Cariri", "CTF e game jam")).toBe("hackathon");
    expect(inferEventFormat("Evento hibrido com transmissao online", "Hub")).toBe("online");
    expect(inferEventFormat("Evento presencial", "Hub central")).toBe("in-person");

    expect(parseLocationParts("Hub de Inovacao - Fortaleza - CE")).toEqual({
      venue: "Hub de Inovacao - Fortaleza - CE",
      city: "Fortaleza",
      state: "CE"
    });
    expect(inferCategoriesFromText("Trilha de React, cloud e UX", ["frontend", "cloud", "ux"])).toEqual(
      expect.arrayContaining(["frontend", "cloud", "ux"])
    );
    expect(
      inferDeterministicNortheastLocation({
        page_title: "Evento em Fortaleza",
        raw_text: "Hub de Inovacao - Fortaleza - CE"
      })
    ).toEqual({
      city: "FORTALEZA",
      state: "CE",
      matched_text: "FORTALEZA"
    });
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

  it("distingue eventos tech claros de eventos academicos fora do escopo", () => {
    const direct = evaluateTechRelevanceDeterministic(
      {
        title: "Build With AI Fortaleza",
        description: "Workshop presencial para desenvolvedores sobre IA generativa, cloud e software.",
        organizer: "GDG Fortaleza"
      },
      {
        source_name: "GDG Fortaleza",
        source_type: "gdg-chapter",
        keywords: ["ai", "cloud"]
      }
    );
    const nonTech = evaluateTechRelevanceDeterministic(
      {
        title: "XVI Fórum Internacional de Pedagogia",
        description: "Congresso acadêmico de pedagogia, educação e práticas docentes.",
        organizer: "Universidade"
      },
      {
        source_name: "Even3 Eventos",
        source_type: "even3-search",
        keywords: ["tecnologia"]
      }
    );
    const adjacent = evaluateTechRelevanceDeterministic(
      {
        title: "Product Design para times digitais",
        description: "Encontro para designers de produto e PMs de plataformas digitais.",
        organizer: "Comunidade de Produto"
      },
      {
        source_name: "Meetup Produto",
        source_type: "meetup-group",
        keywords: ["product design", "ux"]
      }
    );

    expect(direct.tech_relevance).toBe("direct");
    expect(direct.tech_audience).toBe("tech");
    expect(direct.tech_topics).toEqual(expect.arrayContaining(["ia", "cloud"]));
    expect(nonTech.tech_relevance).toBe("non_tech");
    expect(nonTech.rejection_reason).toContain("deny_terms");
    expect(adjacent.tech_relevance).toBe("adjacent");
    expect(adjacent.tech_audience).toBe("tech");
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
        source_name: "Source",
        tech_relevance: "direct",
        tech_audience: "tech",
        tech_topics: ["cloud", "ia"],
        tech_evidence: ["cloud", "ia"]
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
    expect(classifyIntakeCandidate({ ...baseCandidate, tech_relevance: "non_tech", tech_audience: "non_tech" }, baseScore, { todayKey: "2026-03-28" })).toEqual({
      action: "skip",
      reason: "non_tech"
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
        summary: "Resumo curto",
        tech_relevance: "direct",
        tech_audience: "tech",
        tech_topics: ["ia"],
        tech_evidence: ["ia", "cloud"]
      },
      ["ia"]
    );
    const scoreResult = scoreNormalizedEvent(candidate);

    expect(buildBranchName(candidate)).toMatch(/^event-intake\//);
    expect(buildPrTitle(candidate)).toBe("feat(events): add Build with AI Fortaleza");
    expect(buildEventMarkdown(candidate)).toContain('source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza"');
    expect(buildPrBody(candidate, scoreResult)).toContain("event-intake-source:");
    expect(buildPrBody(candidate, scoreResult)).toContain("Relevancia tech");
    expect(buildIssueBody(candidate, scoreResult)).toContain("JSON extraido");
  });
});
