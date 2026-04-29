const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value) {
  if (!DATE_ONLY_PATTERN.test(String(value || ""))) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateCompact(value) {
  const date = value instanceof Date ? value : parseDateOnly(value);

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getAllDayEndDate(startDate, endDate) {
  const parsedEnd = parseDateOnly(endDate) || parseDateOnly(startDate);

  if (!parsedEnd) {
    return "";
  }

  return formatDateCompact(addUtcDays(parsedEnd, 1));
}

function getAllDayDateRange(startDate, endDate) {
  const start = formatDateCompact(startDate);
  const end = getAllDayEndDate(startDate, endDate);

  return start && end ? `${start}/${end}` : "";
}

function buildShareText(title, url) {
  return [title, url].filter(Boolean).join("\n");
}

function buildWhatsAppShareUrl(title, url) {
  const text = buildShareText(title, url);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function buildGoogleCalendarUrl({
  description,
  endDate,
  location,
  startDate,
  title,
  url
}) {
  const calendarUrl = new URL("https://calendar.google.com/calendar/render");
  const details = [description, url].filter(Boolean).join("\n\n");

  calendarUrl.searchParams.set("action", "TEMPLATE");
  calendarUrl.searchParams.set("text", title || "");
  calendarUrl.searchParams.set("dates", getAllDayDateRange(startDate, endDate));

  if (details) {
    calendarUrl.searchParams.set("details", details);
  }

  if (location) {
    calendarUrl.searchParams.set("location", location);
  }

  calendarUrl.searchParams.set("ctz", "America/Sao_Paulo");

  return calendarUrl.toString();
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line) {
  const text = String(line);

  if (text.length <= 75) {
    return text;
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    const size = cursor === 0 ? 75 : 74;
    chunks.push(text.slice(cursor, cursor + size));
    cursor += size;
  }

  return chunks.join("\r\n ");
}

function formatIcsTimestamp(date = new Date()) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "T",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
    "Z"
  ].join("");
}

function buildEventIcsPath(path) {
  const pagePath = String(path || "/");
  return `${pagePath.replace(/\/?$/, "/")}agenda.ics`;
}

function buildIcsEvent({
  description,
  endDate,
  location,
  slug,
  startDate,
  timestamp,
  title,
  url
}) {
  const details = [description, url].filter(Boolean).join("\n\n");
  const uidSource = slug || url || title || `${startDate}-${endDate}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Baiao Tech//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uidSource)}@baiaotech`,
    `DTSTAMP:${formatIcsTimestamp(timestamp)}`,
    `DTSTART;VALUE=DATE:${formatDateCompact(startDate)}`,
    `DTEND;VALUE=DATE:${getAllDayEndDate(startDate, endDate)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    details ? `DESCRIPTION:${escapeIcsText(details)}` : "",
    location ? `LOCATION:${escapeIcsText(location)}` : "",
    url ? `URL:${escapeIcsText(url)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].filter((line) => line !== "");

  return lines.map(foldIcsLine).join("\r\n");
}

module.exports = {
  buildEventIcsPath,
  buildGoogleCalendarUrl,
  buildIcsEvent,
  buildWhatsAppShareUrl,
  escapeIcsText,
  getAllDayDateRange
};
