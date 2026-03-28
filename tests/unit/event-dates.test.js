import { describe, expect, it } from "vitest";

import eventDates from "../../lib/event-dates.js";

const {
  EVENT_TIME_ZONE,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  getEventBoundaryDateKey,
  isDateOnly,
  isFutureOrCurrentEventByDate,
  isPastEventByDate
} = eventDates;

describe("event dates", () => {
  it("calcula a data de hoje no timezone de Fortaleza", () => {
    expect(getDateKeyInTimeZone(new Date("2026-03-27T02:30:00Z"), EVENT_TIME_ZONE)).toBe(
      "2026-03-26"
    );
    expect(getDateKeyInTimeZone(new Date("2026-03-27T03:30:00Z"), EVENT_TIME_ZONE)).toBe(
      "2026-03-27"
    );
  });

  it("usa end_date como limite principal do evento", () => {
    expect(
      getEventBoundaryDateKey({
        start_date: "2026-04-01",
        end_date: "2026-04-03"
      })
    ).toBe("2026-04-03");
  });

  it("valida datas simples e ignora limites invalidos", () => {
    expect(isDateOnly("2026-04-03")).toBe(true);
    expect(isDateOnly("2026/04/03")).toBe(false);
    expect(getDatePartsInTimeZone(new Date("2026-03-27T03:30:00Z"), EVENT_TIME_ZONE)).toEqual({
      year: "2026",
      month: "03",
      day: "27"
    });
    expect(
      getEventBoundaryDateKey({
        start_date: "nao-e-data",
        end_date: "tambem-nao"
      })
    ).toBe("");
  });

  it("marca como passado somente quando a data final fica antes de hoje", () => {
    const eventData = {
      start_date: "2026-04-01",
      end_date: "2026-04-03"
    };

    expect(isPastEventByDate(eventData, { todayKey: "2026-04-04" })).toBe(true);
    expect(isPastEventByDate(eventData, { todayKey: "2026-04-03" })).toBe(false);
    expect(isFutureOrCurrentEventByDate(eventData, { todayKey: "2026-04-03" })).toBe(true);
  });
});
