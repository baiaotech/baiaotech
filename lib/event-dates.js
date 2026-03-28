const EVENT_TIME_ZONE = "America/Fortaleza";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnly(value) {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

function getDatePartsInTimeZone(date = new Date(), timeZone = EVENT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});
}

function getDateKeyInTimeZone(date = new Date(), timeZone = EVENT_TIME_ZONE) {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getEventBoundaryDateKey(eventData = {}) {
  const boundary = eventData.end_date || eventData.start_date || "";
  return isDateOnly(boundary) ? boundary : "";
}

function isPastEventByDate(eventData = {}, options = {}) {
  const { now = new Date(), timeZone = EVENT_TIME_ZONE } = options;
  const todayKey = options.todayKey || getDateKeyInTimeZone(now, timeZone);
  const boundaryKey = getEventBoundaryDateKey(eventData);

  return Boolean(boundaryKey) && boundaryKey < todayKey;
}

function isFutureOrCurrentEventByDate(eventData = {}, options = {}) {
  const { now = new Date(), timeZone = EVENT_TIME_ZONE } = options;
  const todayKey = options.todayKey || getDateKeyInTimeZone(now, timeZone);
  const boundaryKey = getEventBoundaryDateKey(eventData);

  return Boolean(boundaryKey) && boundaryKey >= todayKey;
}

module.exports = {
  DATE_ONLY_PATTERN,
  EVENT_TIME_ZONE,
  getDateKeyInTimeZone,
  getDatePartsInTimeZone,
  getEventBoundaryDateKey,
  isDateOnly,
  isFutureOrCurrentEventByDate,
  isPastEventByDate
};
