import { JSDOM } from "jsdom";

import {
  htmlToText,
  inferEventFormat,
  inferEventKind,
  normalizeUrl,
  parseLocationParts,
  toDateOnly,
  truncateText
} from "./shared.mjs";

function getDocument(html, baseUrl) {
  return new JSDOM(html, { url: baseUrl }).window.document;
}

function collectJsonLdNodes(document) {
  const nodes = [];

  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
    try {
      const raw = JSON.parse(script.textContent || "null");
      nodes.push(raw);
    } catch {
      // ignore malformed blocks
    }
  }

  return nodes.flatMap((item) => {
    if (Array.isArray(item)) {
      return item;
    }

    if (item?.["@graph"]) {
      return item["@graph"];
    }

    return [item];
  });
}

function findJsonLdEvent(document) {
  return collectJsonLdNodes(document).find((item) => {
    const type = item?.["@type"];
    return type === "Event" || (Array.isArray(type) && type.includes("Event"));
  });
}

function getMeta(document, name) {
  return (
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ||
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
    ""
  );
}

function extractLocation(eventJsonLd) {
  if (!eventJsonLd?.location) {
    return {
      venue: "",
      city: "",
      state: ""
    };
  }

  const location = Array.isArray(eventJsonLd.location)
    ? eventJsonLd.location[0]
    : eventJsonLd.location;

  const address = location?.address;
  const textCandidate = [
    location?.name || "",
    address?.streetAddress || "",
    address?.addressLocality || "",
    address?.addressRegion || ""
  ]
    .filter(Boolean)
    .join(" - ");

  const parsed = parseLocationParts(textCandidate);

  return {
    venue: location?.name || parsed.venue,
    city: address?.addressLocality || parsed.city,
    state: address?.addressRegion || parsed.state
  };
}

export function extractDeterministicEventData(page, candidate) {
  const document = getDocument(page.html, page.final_url);
  const jsonLdEvent = findJsonLdEvent(document);
  const location = extractLocation(jsonLdEvent);
  const title =
    jsonLdEvent?.name ||
    getMeta(document, "og:title") ||
    document.querySelector("title")?.textContent ||
    candidate.seed_data?.title ||
    "";
  const description =
    htmlToText(jsonLdEvent?.description || "") ||
    htmlToText(getMeta(document, "description")) ||
    htmlToText(candidate.seed_data?.description || "") ||
    htmlToText(document.body?.textContent || "");
  const organizer =
    jsonLdEvent?.organizer?.name ||
    getMeta(document, "author") ||
    candidate.source.source_name ||
    "";
  const coverImage = Array.isArray(jsonLdEvent?.image)
    ? jsonLdEvent.image[0]
    : jsonLdEvent?.image || getMeta(document, "og:image") || candidate.seed_data?.cover_image || "";
  const ticketUrl = normalizeUrl(
    jsonLdEvent?.offers?.url ||
      jsonLdEvent?.url ||
      candidate.event_url
  );
  const sourceUrl = normalizeUrl(candidate.event_url);

  return {
    title: String(title).trim(),
    start_date: toDateOnly(jsonLdEvent?.startDate || candidate.seed_data?.start_date || ""),
    end_date: toDateOnly(jsonLdEvent?.endDate || candidate.seed_data?.end_date || ""),
    kind: inferEventKind(title, description),
    format: inferEventFormat(description, location.venue),
    city: location.city || candidate.source.city || "",
    state: location.state || candidate.source.state || "",
    organizer: String(organizer).trim(),
    venue: location.venue || "",
    ticket_url: ticketUrl,
    categories: [],
    cover_image: normalizeUrl(coverImage),
    price: String(jsonLdEvent?.offers?.price || "").trim(),
    description: truncateText(description, 6000),
    summary: truncateText(description, 320),
    source_url: sourceUrl,
    source_name: candidate.source.source_name,
    page_title: document.querySelector("title")?.textContent || "",
    page_description: getMeta(document, "description"),
    raw_text: truncateText(htmlToText(document.body?.textContent || ""), 12000),
    ambiguities: []
  };
}
