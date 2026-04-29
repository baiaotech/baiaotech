import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildGoogleCalendarUrl,
  buildIcsEvent,
  buildWhatsAppShareUrl,
  getAllDayDateRange
} = require("../../lib/calendar-actions.js");

describe("calendar and share actions", () => {
  it("codifica o texto de compartilhamento do WhatsApp", () => {
    const href = buildWhatsAppShareUrl(
      "Evento C# & JS",
      "https://agenda.baiaotech.org/eventos/evento-csharp/"
    );
    const url = new URL(href);

    expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/");
    expect(href).toContain("Evento%20C%23%20%26%20JS");
    expect(url.searchParams.get("text")).toBe(
      "Evento C# & JS\nhttps://agenda.baiaotech.org/eventos/evento-csharp/"
    );
  });

  it("gera intervalo de dia inteiro para Google Agenda com fim exclusivo", () => {
    const href = buildGoogleCalendarUrl({
      endDate: "2026-06-07",
      location: "Feira de Santana - Bahia",
      startDate: "2026-06-06",
      title: "DevOpsDays Feira de Santana 2026",
      url: "https://agenda.baiaotech.org/eventos/devopsdays-feira-de-santana-2026/"
    });
    const url = new URL(href);

    expect(getAllDayDateRange("2026-06-06", "2026-06-07")).toBe("20260606/20260608");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20260606/20260608");
    expect(url.searchParams.get("ctz")).toBe("America/Sao_Paulo");
  });

  it("escapa campos textuais no arquivo ICS", () => {
    const ics = buildIcsEvent({
      description: "Linha 1\nLinha 2",
      endDate: "2026-06-07",
      location: "Recife, PE",
      slug: "evento-teste",
      startDate: "2026-06-06",
      timestamp: new Date("2026-01-02T03:04:05Z"),
      title: "Evento, A; B\\C",
      url: "https://agenda.baiaotech.org/eventos/evento-teste/"
    });

    expect(ics).toContain("DTSTAMP:20260102T030405Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260606");
    expect(ics).toContain("DTEND;VALUE=DATE:20260608");
    expect(ics).toContain("SUMMARY:Evento\\, A\\; B\\\\C");
    expect(ics).toContain("DESCRIPTION:Linha 1\\nLinha 2");
    expect(ics).toContain("LOCATION:Recife\\, PE");
  });
});
