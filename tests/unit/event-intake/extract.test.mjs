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
  it.each([
    ["array", (event) => [{ "@type": "Organization", name: "Nao e o evento" }, event]],
    ["grafo", (event) => ({ "@graph": [{ "@type": "WebPage" }, event] })]
  ])("encontra eventos em JSON-LD de %s e ignora blocos invalidos", (_, wrap) => {
    const event = {
      "@type": ["BusinessEvent", "Event"],
      name: "  Cloud Recife 2027  ",
      startDate: "2027-03-10T18:00:00-03:00",
      endDate: "2027-03-11T18:00:00-03:00",
      description: "<p>Conferencia de <strong>cloud</strong>.</p>",
      image: ["https://example.com/capa.png", "https://example.com/outra.png"],
      organizer: { name: "Comunidade Cloud" },
      location: [{ name: "Porto Digital", address: { addressLocality: "Recife", addressRegion: "Pernambuco" } }],
      offers: { url: "https://example.com/inscricao?utm_source=site", price: "25.00" }
    };
    const extracted = extractDeterministicEventData({
      final_url: "https://example.com/evento",
      html: `<script type="application/ld+json">{invalid</script>
        <script type="application/ld+json">null</script>
        <script type="application/ld+json">${JSON.stringify(wrap(event))}</script>`
    }, makeCandidate("https://example.com/evento", "Fonte oficial"));

    expect(extracted).toMatchObject({
      title: "Cloud Recife 2027",
      start_date: "2027-03-10",
      end_date: "2027-03-11",
      description: "Conferencia de cloud.",
      city: "Recife",
      state: "PE",
      venue: "Porto Digital",
      organizer: "Comunidade Cloud",
      ticket_url: "https://example.com/inscricao",
      cover_image: "https://example.com/capa.png",
      price: "25.00",
      source_name: "Fonte oficial"
    });
  });

  it("usa metadados da pagina quando o JSON-LD nao contem um evento", () => {
    const extracted = extractDeterministicEventData({
      final_url: "https://example.com/evento",
      html: `<title>Titulo da pagina</title>
        <meta property="og:title" content="Workshop de software em Fortaleza">
        <meta name="description" content="Programacao presencial em Fortaleza - CE.">
        <meta name="author" content="Comunidade Cearense">
        <meta property="og:image" content="https://example.com/capa.png">
        <script type="application/ld+json">{"@type":"Organization","name":"Organizacao"}</script>
        <main><h1>Titulo secundario</h1></main>`
    }, makeCandidate("https://example.com/evento", "Fonte"));

    expect(extracted).toMatchObject({
      title: "Workshop de software em Fortaleza",
      description: "Programacao presencial em Fortaleza - CE.",
      organizer: "Comunidade Cearense",
      city: "FORTALEZA",
      state: "CE",
      cover_image: "https://example.com/capa.png",
      page_title: "Titulo da pagina",
      page_description: "Programacao presencial em Fortaleza - CE.",
      ticket_url: "https://example.com/evento"
    });
  });

  it.each([
    ["<title>Titulo da aba</title><h1>Titulo principal</h1>", "Titulo principal"],
    ["<title>Titulo da aba</title>", "Titulo da aba"],
    ["", "Titulo da descoberta"]
  ])("preserva a ordem de fallback do titulo em %s", (html, title) => {
    const candidate = makeCandidate("https://example.com/evento", "Fonte");
    candidate.seed_data = {
      title: "Titulo da descoberta",
      description: "Workshop de cloud em Natal - RN.",
      start_date: "2027-02-10",
      end_date: "2027-02-11",
      cover_image: "https://example.com/capa.png"
    };
    const extracted = extractDeterministicEventData({ html, final_url: candidate.event_url }, candidate);

    expect(extracted).toMatchObject({
      title,
      description: candidate.seed_data.description,
      start_date: "2027-02-10",
      end_date: "2027-02-11",
      cover_image: "https://example.com/capa.png",
      city: "NATAL",
      state: "RN"
    });
  });

  it("mantem dados ausentes vazios sem inventar local ou datas", () => {
    const candidate = makeCandidate("https://example.com/evento", "");
    const extracted = extractDeterministicEventData({ html: "", final_url: candidate.event_url }, candidate);
    expect(extracted).toMatchObject({
      title: "", start_date: "", end_date: "", city: "", state: "", venue: "",
      organizer: "", cover_image: "", description: "", summary: "", raw_text: ""
    });
  });

  it("limita textos longos e usa a URL do proprio evento quando nao ha oferta", () => {
    const description = "Conteudo tecnico de cloud. ".repeat(700);
    const candidate = makeCandidate("https://example.com/fonte", "Fonte");
    const extracted = extractDeterministicEventData({
      final_url: candidate.event_url,
      html: `<script type="application/ld+json">${JSON.stringify({
        "@type": "Event", name: "Conferencia Cloud", description, url: "https://example.com/ingressos"
      })}</script><main>${description}</main>`
    }, candidate);

    expect(extracted.description.length).toBeLessThanOrEqual(6000);
    expect(extracted.summary.length).toBeLessThanOrEqual(320);
    expect(extracted.raw_text.length).toBeLessThanOrEqual(12000);
    expect(extracted.description).toContain("Conteudo tecnico de cloud.");
    expect(extracted.ticket_url).toBe("https://example.com/ingressos");
    expect(extracted.source_url).toBe("https://example.com/fonte");
  });

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
