import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverCandidatesForSource } from "../../../scripts/event-intake/discovery.mjs";

async function readFixture(name) {
  return fs.readFile(path.resolve("tests/fixtures/event-intake", name), "utf8");
}

describe("event intake discovery", () => {
  it("descobre links de eventos futuros em páginas do Meetup e filtra por keywords", async () => {
    const html = await readFixture("meetup-search.html");
    const source = {
      source_name: "Meetup Fortaleza",
      source_type: "meetup-search",
      entry_url: "https://www.meetup.com/find/?keywords=tecnologia&location=Fortaleza,%20BR",
      keywords: ["cloud", "ia", "frontend", "devops"]
    };

    const candidates = await discoverCandidatesForSource(
      source,
      {
        html,
        final_url: source.entry_url
      },
      async () => {
        throw new Error("fetchPage nao deveria ser chamado para Meetup");
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].event_url).toContain("/events/313900001");
  });

  it("descobre eventos do Sympla a partir de URLs embutidas no HTML", async () => {
    const html = await readFixture("sympla-search.html");
    const source = {
      source_name: "Sympla Fortaleza",
      source_type: "sympla-search",
      entry_url: "https://www.sympla.com.br/eventos?s=tecnologia&c=Fortaleza%2C%20CE",
      keywords: ["frontend", "ia", "cloud"]
    };

    const candidates = await discoverCandidatesForSource(
      source,
      {
        html,
        final_url: source.entry_url
      },
      async () => {
        throw new Error("fetchPage nao deveria ser chamado para Sympla");
      }
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0].event_url).toContain("/evento/frontend-and-ai-fortaleza/3300012");
  });

  it("descobre eventos do Eventbrite a partir dos cards renderizados", async () => {
    const html = await readFixture("eventbrite-search.html");
    const source = {
      source_name: "Eventbrite Recife",
      source_type: "eventbrite-search",
      entry_url: "https://www.eventbrite.com.br/d/brazil--recife/tecnologia/",
      keywords: ["devops", "software", "cloud"]
    };

    const candidates = await discoverCandidatesForSource(
      source,
      {
        html,
        final_url: source.entry_url
      },
      async () => {
        throw new Error("fetchPage nao deveria ser chamado para Eventbrite");
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].event_url).toContain("devops-day-recife");
  });

  it("descobre candidatos de Doity e Even3 usando parsers dedicados", async () => {
    const doityHtml = await readFixture("doity-search.html");
    const even3Html = await readFixture("even3-search.html");

    const doityCandidates = await discoverCandidatesForSource(
      {
        source_name: "Doity Eventos",
        source_type: "doity-search",
        entry_url: "https://doity.com.br/eventos",
        keywords: ["tech", "software", "devops"]
      },
      {
        html: doityHtml,
        final_url: "https://doity.com.br/eventos"
      },
      async () => {
        throw new Error("fetchPage nao deveria ser chamado para Doity");
      }
    );

    const even3Candidates = await discoverCandidatesForSource(
      {
        source_name: "Even3 Eventos",
        source_type: "even3-search",
        entry_url: "https://www.even3.com.br/eventos?todos=true",
        keywords: ["cloud", "ai", "devsecops"]
      },
      {
        html: even3Html,
        final_url: "https://www.even3.com.br/eventos?todos=true"
      },
      async () => {
        throw new Error("fetchPage nao deveria ser chamado para Even3");
      }
    );

    expect(doityCandidates).toHaveLength(1);
    expect(doityCandidates[0].event_url).toBe("https://doity.com.br/tech-leaders-fortaleza");
    expect(even3Candidates).toHaveLength(2);
    expect(even3Candidates.some((candidate) => candidate.event_url.includes("devsecops-recife-2026"))).toBe(true);
  });

  it("usa a API embutida do GDG para descobrir eventos live", async () => {
    const html = await readFixture("gdg-chapter.html");
    const source = {
      source_name: "GDG Fortaleza",
      source_type: "gdg-chapter",
      entry_url: "https://gdg.community.dev/gdg-fortaleza/"
    };

    const candidates = await discoverCandidatesForSource(
      source,
      {
        html,
        final_url: source.entry_url
      },
      async (url) => {
        expect(url).toContain("/api/event_slim/for_chapter/857/");
        return {
          final_url: url,
          html: JSON.stringify({
            results: [
              {
                title: "Build with AI Fortaleza",
                start_date: "2026-04-10T18:00:00Z",
                cohost_registration_url:
                  "https://gdg.community.dev/events/details/google-gdg-fortaleza-presents-build-with-ai-fortaleza/"
              }
            ]
          })
        };
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].event_url).toContain("build-with-ai-fortaleza");
    expect(candidates[0].seed_data.title).toBe("Build with AI Fortaleza");
  });
});
