import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverCandidatesForSource } from "../../../scripts/event-intake/discovery.mjs";

async function readFixture(name) {
  return fs.readFile(path.resolve("tests/fixtures/event-intake", name), "utf8");
}

describe("event intake discovery", () => {
  it("descobre links de eventos futuros em páginas do Meetup", async () => {
    const html = await readFixture("meetup-group.html");
    const source = {
      source_name: "AWS User Group João Pessoa",
      source_type: "meetup-group",
      entry_url: "https://www.meetup.com/pt-BR/aws-user-group-joao-pessoa/events/"
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
    expect(candidates[0].event_url).toContain("/events/313477743");
  });

  it("usa a API embutida do GDG para descobrir eventos live", async () => {
    const html = await readFixture("gdg-chapter.html");
    const source = {
      source_name: "GDG Fortaleza",
      source_type: "generic-html",
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
