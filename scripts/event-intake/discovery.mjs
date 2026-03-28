import { JSDOM } from "jsdom";

import {
  normalizeUrl,
  unique
} from "./shared.mjs";

function getDocument(html, baseUrl) {
  return new JSDOM(html, { url: baseUrl }).window.document;
}

function collectAnchorUrls(document, baseUrl) {
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => normalizeUrl(anchor.getAttribute("href"), baseUrl))
    .filter(Boolean);
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

function extractUrlsFromJsonLd(document) {
  return collectJsonLdNodes(document)
    .filter((item) => {
      const type = item?.["@type"];
      return type === "Event" || (Array.isArray(type) && type.includes("Event"));
    })
    .map((item) => normalizeUrl(item.url || item.offers?.url || ""))
    .filter(Boolean);
}

function extractMeetupCandidates(document, baseUrl, source) {
  const urls = collectAnchorUrls(document, baseUrl).filter((url) =>
    /meetup\.com\/.+\/events\/\d+/i.test(url)
  );

  return unique(urls).map((url) => ({
    source,
    event_url: url,
    discovery_hint: "meetup-anchor"
  }));
}

function extractEventbriteCandidates(document, baseUrl, source) {
  const urls = collectAnchorUrls(document, baseUrl).filter((url) =>
    /eventbrite\.[^/]+\/e\/.+tickets-/i.test(url)
  );

  return unique(urls).map((url) => ({
    source,
    event_url: url,
    discovery_hint: "eventbrite-anchor"
  }));
}

function extractSymplaCandidates(document, baseUrl, source) {
  const urls = collectAnchorUrls(document, baseUrl).filter((url) =>
    /sympla\.com\.br\/evento\/.+\/\d+/i.test(url)
  );

  return unique(urls).map((url) => ({
    source,
    event_url: url,
    discovery_hint: "sympla-anchor"
  }));
}

function extractGenericAnchorCandidates(document, baseUrl, source) {
  const entryHost = new URL(baseUrl).host;
  const urls = collectAnchorUrls(document, baseUrl).filter((url) => {
    const candidate = new URL(url);
    const sameHost = candidate.host === entryHost;
    const looksLikeEvent = /\/(event|events|evento|agenda|tickets|ingressos)\b/i.test(candidate.pathname);
    return sameHost && looksLikeEvent;
  });

  return unique(urls).map((url) => ({
    source,
    event_url: url,
    discovery_hint: "generic-anchor"
  }));
}

function extractGdgApiUrl(html, source) {
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  if (!nextDataMatch) {
    return "";
  }

  try {
    const nextData = JSON.parse(nextDataMatch[1]);
    const prefetchedData = nextData?.props?.pageProps?.customBlockData?.prefetchedData || {};
    const entry = Object.keys(prefetchedData).find((key) =>
      /api\/event_slim\/for_chapter\/.+status=Live/i.test(key)
    );

    if (!entry) {
      return "";
    }

    const origin = new URL(source.entry_url).origin;
    return entry.replace(/^http:\/\/platform-google:80/i, origin);
  } catch {
    return "";
  }
}

async function extractGdgCandidates(page, source, fetchPage) {
  const apiUrl = extractGdgApiUrl(page.html, source);

  if (!apiUrl) {
    return extractGenericAnchorCandidates(getDocument(page.html, page.final_url), page.final_url, source);
  }

  const apiPage = await fetchPage(apiUrl, { fetch_mode: "http" });
  let payload;

  try {
    payload = JSON.parse(apiPage.html);
  } catch {
    return [];
  }

  return (payload.results || [])
    .map((item) => ({
      source,
      event_url: normalizeUrl(item.cohost_registration_url || item.url || ""),
      discovery_hint: "gdg-api",
      seed_data: {
        title: item.title || "",
        description: item.description_short || item.description || "",
        start_date: item.start_date || "",
        cover_image: item.cropped_banner_url || item.cropped_picture_url || ""
      }
    }))
    .filter((item) => item.event_url);
}

export async function discoverCandidatesForSource(source, page, fetchPage) {
  if (source.source_type === "doity-page") {
    return [
      {
        source,
        event_url: normalizeUrl(source.entry_url),
        discovery_hint: "direct-doity-page"
      }
    ];
  }

  const document = getDocument(page.html, page.final_url);

  if (source.source_type === "meetup-group") {
    return extractMeetupCandidates(document, page.final_url, source);
  }

  if (source.source_type === "eventbrite-organizer") {
    return extractEventbriteCandidates(document, page.final_url, source);
  }

  if (source.source_type === "sympla-organizer") {
    return extractSymplaCandidates(document, page.final_url, source);
  }

  if (/gdg\.community\.dev/i.test(source.entry_url)) {
    return extractGdgCandidates(page, source, fetchPage);
  }

  const generic = [
    ...extractGenericAnchorCandidates(document, page.final_url, source),
    ...extractUrlsFromJsonLd(document).map((url) => ({
      source,
      event_url: url,
      discovery_hint: "json-ld"
    }))
  ];

  return unique(generic.map((item) => item.event_url)).map((url) => {
    return generic.find((item) => item.event_url === url);
  });
}
