import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { extractDeterministicEventData } from "../../../scripts/event-intake/extract.mjs";

async function readFixture(name) {
  return fs.readFile(path.resolve("tests/fixtures/event-intake", name), "utf8");
}

function makeCandidate(eventUrl, sourceName) {
  return {
    event_url: eventUrl,
    source: {
      source_name: sourceName,
      source_type: "generic-html",
      entry_url: eventUrl,
      city: "",
      state: ""
    }
  };
}

describe("event intake deterministic extraction", () => {
  it("extrai dados do Eventbrite", async () => {
    const html = await readFixture("eventbrite-event.html");
    const extracted = extractDeterministicEventData(
      {
        html,
        final_url: "https://www.eventbrite.com.br/e/sap-inside-track-fortaleza-2025-tickets-1344347322029"
      },
      makeCandidate(
        "https://www.eventbrite.com.br/e/sap-inside-track-fortaleza-2025-tickets-1344347322029",
        "SIT Fortaleza"
      )
    );

    expect(extracted.title).toBe("SAP Inside Track Fortaleza 2025");
    expect(extracted.start_date).toBe("2025-10-25");
    expect(extracted.state).toBe("CE");
    expect(extracted.organizer).toBe("SIT Fortaleza");
  });

  it("extrai dados do Doity", async () => {
    const html = await readFixture("doity-event.html");
    const extracted = extractDeterministicEventData(
      {
        html,
        final_url: "https://doity.com.br/ctrl-e-2025"
      },
      makeCandidate("https://doity.com.br/ctrl-e-2025", "CTRL+E")
    );

    expect(extracted.title).toBe("CTRL + E 2025");
    expect(extracted.organizer).toContain("José Aires");
    expect(extracted.city).toBe("Fortaleza");
  });

  it("extrai dados do Sympla", async () => {
    const html = await readFixture("sympla-event.html");
    const extracted = extractDeterministicEventData(
      {
        html,
        final_url: "https://www.sympla.com.br/evento/agile-jampa-2025/3002496"
      },
      makeCandidate("https://www.sympla.com.br/evento/agile-jampa-2025/3002496", "Agile Jampa")
    );

    expect(extracted.title).toBe("Agile Jampa 2025");
    expect(extracted.start_date).toBe("2025-10-25");
    expect(extracted.city).toBe("João Pessoa");
    expect(extracted.ticket_url).toContain("sympla.com.br/evento/agile-jampa-2025/3002496");
  });
});
