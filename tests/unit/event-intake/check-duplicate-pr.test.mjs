import { describe, expect, it } from "vitest";

import {
  canonicalEventIdentity,
  extractEventUrls,
  findDuplicatePulls,
  normalizeEventUrl
} from "../../../scripts/event-intake/check-duplicate-pr.mjs";

function buildPull(number, sourceUrl, ticketUrl = sourceUrl) {
  return {
    number,
    title: `feat(events): add Evento ${number}`,
    html_url: `https://github.com/baiaotech/baiaotech/pull/${number}`,
    head: { ref: `event-intake/evento-${number}` },
    body: [
      "## Event intake",
      "",
      `- Fonte: [Fonte](${sourceUrl})`,
      `- Ticket URL: [${ticketUrl}](${ticketUrl})`
    ].join("\n")
  };
}

describe("event intake duplicate PR guard", () => {
  it("remove parametros de rastreamento e normaliza host e protocolo", () => {
    expect(
      normalizeEventUrl(
        "http://www.example.com/evento/?utm_source=github&aff=search#details"
      )
    ).toBe("https://example.com/evento");
  });

  it("usa o ID estavel do Sympla apesar de mudancas no slug", () => {
    expect(
      canonicalEventIdentity(
        "https://www.sympla.com.br/evento/aiops-ia-generativa/3510235"
      )
    ).toBe(
      canonicalEventIdentity(
        "https://www.sympla.com.br/evento/eptec-talks-aiops-ia-generativa/3510235"
      )
    );
  });

  it("normaliza URLs legadas do GDG com o prefixo v0", () => {
    expect(
      canonicalEventIdentity(
        "https://gdg.community.dev/v0/events/details/google-gdg-natal-presents-gorn-devfest-natal-2026"
      )
    ).toBe(
      canonicalEventIdentity(
        "https://gdg.community.dev/events/details/google-gdg-natal-presents-gorn-devfest-natal-2026"
      )
    );
  });

  it("usa o ID do Eventbrite entre dominios e parametros distintos", () => {
    expect(
      canonicalEventIdentity(
        "https://www.eventbrite.com/e/forum-tech-tickets-1992654975673?aff=ebdssbdestsearch"
      )
    ).toBe(
      canonicalEventIdentity(
        "https://www.eventbrite.com.br/e/forum-tech-tickets-1992654975673"
      )
    );
  });

  it("extrai somente URLs de identidade das linhas de fonte e ingresso", () => {
    expect(
      extractEventUrls(
        [
          "- Fonte: [GDG](https://gdg.community.dev/events/details/evento)",
          "- Ticket URL: [https://tickets.example.com/1](https://tickets.example.com/1)",
          "Texto externo: https://example.com/nao-usar"
        ].join("\n")
      )
    ).toEqual([
      "https://gdg.community.dev/events/details/evento",
      "https://tickets.example.com/1"
    ]);
  });

  it("detecta PRs duplicados por qualquer URL canonica compartilhada", () => {
    const current = buildPull(
      124,
      "https://www.sympla.com.br/evento/eptec-talks-aiops/3510235"
    );
    const duplicate = buildPull(
      123,
      "https://www.sympla.com.br/evento/aiops/3510235"
    );
    const other = buildPull(
      122,
      "https://gdg.community.dev/events/details/devfest-joao-pessoa-2026"
    );

    expect(findDuplicatePulls(current, [current, duplicate, other]).map((pull) => pull.number)).toEqual([123]);
  });
});
