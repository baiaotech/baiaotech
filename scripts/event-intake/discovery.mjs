import { JSDOM } from "jsdom";

import {
  htmlToText,
  inferNortheastLocationFromText,
  looksLikeDoityEventUrl,
  looksLikeEven3EventUrl,
  looksLikeGenericCommunityEventUrl,
  matchesTechnologyKeywords,
  normalizeStateCode,
  normalizeText,
  normalizeUrl,
  toDateOnly
} from "./shared.mjs";

const SEARCH_SOURCE_TYPES = new Set(["sympla-search", "eventbrite-search", "meetup-search"]);
const SEARCH_VARIANT_PRESETS = [
  {
    query: "inteligencia artificial",
    keywords: ["ia", "ai", "machine learning", "inteligencia artificial", "llm", "generative ai"]
  },
  {
    query: "cloud",
    keywords: ["cloud", "aws", "azure", "gcp", "google cloud", "kubernetes", "docker"]
  },
  {
    query: "devops",
    keywords: ["devops", "sre", "platform engineering", "infraestrutura", "observabilidade"]
  },
  {
    query: "frontend",
    keywords: ["frontend", "react", "javascript", "typescript", "vue", "angular"]
  },
  {
    query: "dados",
    keywords: ["dados", "analytics", "data", "engenharia de dados", "big data"]
  },
  {
    query: "seguranca",
    keywords: ["security", "seguranca", "cyber", "owasp", "cybersecurity"]
  },
  {
    query: "programacao",
    keywords: ["programacao", "programming", "software", "backend", "python", "java", "node"]
  }
];
const OUT_OF_SCOPE_LOCATION_TERMS = [
  "chicago",
  "san francisco",
  "new york",
  "london",
  "toronto",
  "seattle",
  "sao paulo",
  "são paulo",
  "rio de janeiro",
  "belo horizonte",
  "curitiba",
  "porto alegre",
  "goiania",
  "goiânia",
  "brasilia",
  "brasília",
  "campinas",
  "osasco",
  "florianopolis",
  "florianópolis",
  "belem",
  "belém",
  "manaus"
];

function getDocument(html, baseUrl) {
  return new JSDOM(html, { url: baseUrl }).window.document;
}

function normalizeCandidateUrl(url, baseUrl = "") {
  return normalizeUrl(url, baseUrl);
}

function collapseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findAnchorContext(anchor) {
  const anchorText = collapseText(anchor.textContent || "");
  const selectors = ["article", "li", "section", "[data-testid]", "[data-event-id]", "div"];

  for (const selector of selectors) {
    const container = anchor.closest(selector);
    const containerText = collapseText(container?.textContent || "");

    if (!containerText || containerText === anchorText) {
      continue;
    }

    if (containerText.length >= anchorText.length && containerText.length <= 1200) {
      return containerText;
    }
  }

  return "";
}

function collectAnchorData(document, baseUrl) {
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => ({
      url: normalizeCandidateUrl(anchor.getAttribute("href"), baseUrl),
      text: String(anchor.textContent || "").trim(),
      title: String(anchor.getAttribute("title") || "").trim(),
      context: findAnchorContext(anchor)
    }))
    .filter((item) => item.url);
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

function decodeEmbeddedJsonString(value) {
  const input = String(value || "");

  if (!input) {
    return "";
  }

  try {
    return JSON.parse(`"${input}"`);
  } catch {
    return input
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"');
  }
}

function buildCandidate(source, eventUrl, discoveryHint, seedData = {}) {
  return {
    source,
    event_url: normalizeUrl(eventUrl),
    discovery_hint: discoveryHint,
    seed_data: {
      title: String(seedData.title || "").trim(),
      description: String(seedData.description || "").trim(),
      start_date: String(seedData.start_date || "").trim(),
      end_date: String(seedData.end_date || "").trim(),
      cover_image: normalizeUrl(seedData.cover_image || "")
    }
  };
}

function dedupeCandidates(candidates) {
  const merged = new Map();

  for (const candidate of candidates) {
    if (!candidate?.event_url) {
      continue;
    }

    const current = merged.get(candidate.event_url);

    if (!current) {
      merged.set(candidate.event_url, candidate);
      continue;
    }

    const currentRichness = `${current.seed_data?.title || ""}${current.seed_data?.description || ""}`.length;
    const candidateRichness = `${candidate.seed_data?.title || ""}${candidate.seed_data?.description || ""}`.length;

    if (candidateRichness > currentRichness) {
      merged.set(candidate.event_url, {
        ...candidate,
        seed_data: {
          ...current.seed_data,
          ...candidate.seed_data
        }
      });
    }
  }

  return [...merged.values()];
}

function filterCandidatesByKeywords(candidates, source) {
  const keywords = source.required_keywords || source.keywords || [];

  if (!keywords.length) {
    return candidates;
  }

  const filtered = candidates.filter((candidate) => {
    const candidateText = [
      candidate.seed_data?.title || "",
      candidate.seed_data?.description || ""
    ]
      .filter(Boolean)
      .join("\n");

    if (!candidateText.trim()) {
      return true;
    }

    return matchesTechnologyKeywords(candidateText, keywords);
  });

  return filtered.length ? filtered : candidates;
}

function mentionsOutOfScopeLocation(text, source) {
  const normalizedText = normalizeText(text);
  const sourceCity = normalizeText(source.city || "");
  const sourceState = normalizeText(source.state || "");

  return OUT_OF_SCOPE_LOCATION_TERMS.some((term) => {
    const normalizedTerm = normalizeText(term);

    if (!normalizedTerm || !normalizedText.includes(normalizedTerm)) {
      return false;
    }

    if (sourceCity && normalizedTerm === sourceCity) {
      return false;
    }

    if (sourceState && normalizedTerm === sourceState) {
      return false;
    }

    return true;
  });
}

function filterCandidatesByLocation(candidates, source) {
  if (!source.state && !source.city) {
    return candidates;
  }

  const sourceState = normalizeStateCode(source.state || "");
  const sourceCity = normalizeText(source.city || "");
  const isCityScopedSearch = SEARCH_SOURCE_TYPES.has(source.source_type || "") && Boolean(source.city);

  const filtered = candidates.filter((candidate) => {
    const candidateText = [
      candidate.seed_data?.title || "",
      candidate.seed_data?.description || ""
    ]
      .filter(Boolean)
      .join("\n");

    if (!candidateText.trim()) {
      return true;
    }

    if (mentionsOutOfScopeLocation(candidateText, source)) {
      return false;
    }

    const inferredLocation = inferNortheastLocationFromText(candidateText);
    const inferredState = normalizeStateCode(inferredLocation.state || "");
    const inferredCity = normalizeText(inferredLocation.city || "");

    if (sourceState && inferredState && inferredState !== sourceState) {
      return false;
    }

    if (isCityScopedSearch && sourceCity && inferredCity && inferredCity !== sourceCity) {
      return false;
    }

    return true;
  });

  return filtered.length ? filtered : candidates;
}

function extractEventUrlsByRegex(html, regex, normalizer = (url) => normalizeUrl(url)) {
  return [...new Set((html.match(regex) || []).map((url) => normalizer(url)).filter(Boolean))];
}

function normalizeJsonLdImage(image) {
  if (Array.isArray(image)) {
    return normalizeUrl(image[0] || "");
  }

  if (typeof image === "object" && image) {
    return normalizeUrl(image.url || image.contentUrl || "");
  }

  return normalizeUrl(image || "");
}

function buildLocationTextFromJsonLd(item = {}) {
  const location = item.location || {};

  if (typeof location === "string") {
    return location;
  }

  const address = location.address || {};
  const values = [
    location.name,
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.addressCountry
  ];

  return values.filter(Boolean).join(" · ");
}

function extractJsonLdEventCandidates(document, source, discoveryHint) {
  return collectJsonLdNodes(document)
    .filter((item) => {
      const type = item?.["@type"];
      return type === "Event" || (Array.isArray(type) && type.includes("Event"));
    })
    .map((item) => {
      const locationText = buildLocationTextFromJsonLd(item);
      const description = [
        htmlToText(item.description || ""),
        locationText
      ]
        .filter(Boolean)
        .join("\n");

      return buildCandidate(source, item.url || item.offers?.url || "", discoveryHint, {
        title: String(item.name || "").trim(),
        description,
        start_date: toDateOnly(item.startDate || ""),
        end_date: toDateOnly(item.endDate || ""),
        cover_image: normalizeJsonLdImage(item.image)
      });
    })
    .filter((candidate) => candidate.event_url);
}

function extractSymplaStructuredCandidates(html, source) {
  const candidates = [];
  const pattern =
    /"url":"(https:\\\/\\\/www\.sympla\.com\.br\\\/evento\\\/[^"]+?\\\/\d+)"[\s\S]{0,3200}?"location":\{[\s\S]{0,1200}?"city":"((?:\\.|[^"])*)"[\s\S]{0,400}?"state":"((?:\\.|[^"])*)"[\s\S]{0,2200}?"start_date":"((?:\\.|[^"])*)"/gi;

  for (const match of html.matchAll(pattern)) {
    const fragment = match[0];
    const organizerMatch = fragment.match(/"organizer":\{[\s\S]{0,800}?"name":"((?:\\.|[^"])*)"/i);
    const venueMatch = fragment.match(/"location":\{[\s\S]{0,800}?"name":"((?:\\.|[^"])*)"/i);
    const imageMatch = fragment.match(/"images":\{[\s\S]{0,600}?"original":"((?:\\.|[^"])*)"/i);
    const endDateMatch = fragment.match(/"end_date":"((?:\\.|[^"])*)"/i);
    const city = decodeEmbeddedJsonString(match[2]);
    const state = decodeEmbeddedJsonString(match[3]);
    const organizer = decodeEmbeddedJsonString(organizerMatch?.[1] || "");
    const venue = decodeEmbeddedJsonString(venueMatch?.[1] || "");
    const nameCandidates = [...fragment.matchAll(/"name":"((?:\\.|[^"])*)"/g)]
      .map((nameMatch) => decodeEmbeddedJsonString(nameMatch[1]))
      .filter(Boolean);
    const eventTitle =
      nameCandidates.find((name) => name !== organizer && name !== venue) ||
      nameCandidates.at(0) ||
      "";

    candidates.push(
      buildCandidate(source, decodeEmbeddedJsonString(match[1]), "sympla-structured", {
        title: eventTitle,
        description: [venue, city && state ? `${city}, ${state}` : "", organizer].filter(Boolean).join("\n"),
        start_date: toDateOnly(decodeEmbeddedJsonString(match[4])),
        end_date: toDateOnly(decodeEmbeddedJsonString(endDateMatch?.[1] || "")),
        cover_image: decodeEmbeddedJsonString(imageMatch?.[1] || "")
      })
    );
  }

  return candidates;
}

function extractMeetupCandidates(document, baseUrl, source, discoveryHint) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => /meetup\.com\/.+\/events\/\d+/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, discoveryHint, {
        title: item.text || item.title,
        description: item.context
      })
    );

  const jsonLdCandidates = extractJsonLdEventCandidates(document, source, `${discoveryHint}-jsonld`);

  return filterCandidatesByLocation(
    filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...jsonLdCandidates]), source),
    source
  );
}

function extractEventbriteCandidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => /eventbrite\.[^/]+\/e\/.+tickets-/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "eventbrite-anchor", {
        title: item.text || item.title,
        description: item.context
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.eventbrite\.[^/]+\/e\/[^"'\\\s<]+tickets-[^"'\\\s<)]+/gi
  ).map((url) => buildCandidate(source, url, "eventbrite-regex"));

  const jsonLdCandidates = extractJsonLdEventCandidates(document, source, "eventbrite-jsonld");

  return filterCandidatesByLocation(
    filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates, ...jsonLdCandidates]), source),
    source
  );
}

function extractSymplaCandidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => /sympla\.com\.br\/evento\/.+\/\d+/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "sympla-anchor", {
        title: item.text || item.title,
        description: item.context
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.sympla\.com\.br\/evento\/[^"'\\\s<)]+\/\d+/gi
  ).map((url) => buildCandidate(source, url, "sympla-regex"));

  const structuredCandidates = extractSymplaStructuredCandidates(html, source);

  return filterCandidatesByLocation(
    filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates, ...structuredCandidates]), source),
    source
  );
}

function toDoityCanonicalEventUrl(url) {
  try {
    const parsed = new URL(url);
    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0] || "";
    return firstSegment ? `${parsed.origin}/${firstSegment}` : "";
  } catch {
    return "";
  }
}

function extractDoityCandidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => looksLikeDoityEventUrl(item.url))
    .map((item) =>
      buildCandidate(source, toDoityCanonicalEventUrl(item.url), "doity-anchor", {
        title: item.text || item.title,
        description: item.context
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/doity\.com\.br\/[^"'\\\s<)]+/gi,
    toDoityCanonicalEventUrl
  ).map((url) => buildCandidate(source, url, "doity-regex"));

  const jsonLdCandidates = extractJsonLdEventCandidates(document, source, "doity-jsonld").map((candidate) => ({
    ...candidate,
    event_url: toDoityCanonicalEventUrl(candidate.event_url)
  }));

  return filterCandidatesByLocation(
    filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates, ...jsonLdCandidates]), source),
    source
  );
}

function extractEven3Candidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => looksLikeEven3EventUrl(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "even3-anchor", {
        title: item.text || item.title,
        description: item.context
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.even3\.com\.br\/[^"'\\\s<)]+/gi
  )
    .filter((url) => looksLikeEven3EventUrl(url))
    .map((url) => buildCandidate(source, url, "even3-regex"));

  const jsonLdCandidates = extractJsonLdEventCandidates(document, source, "even3-jsonld");

  return filterCandidatesByLocation(
    filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates, ...jsonLdCandidates]), source),
    source
  );
}

function extractGenericCandidates(document, html, baseUrl, source) {
  const candidates = [
    ...collectAnchorData(document, baseUrl)
      .filter((item) => looksLikeGenericCommunityEventUrl(item.url, baseUrl))
      .map((item) =>
        buildCandidate(source, item.url, "generic-anchor", {
          title: item.text || item.title,
          description: item.context
        })
      ),
    ...extractJsonLdEventCandidates(document, source, "json-ld"),
    ...extractEventUrlsByRegex(
      html,
      /https:\/\/(?:www\.)?(?:sympla\.com\.br\/evento\/[^"'\\\s<)]+\/\d+|www\.eventbrite\.[^/]+\/e\/[^"'\\\s<)]+tickets-[^"'\\\s<)]+|www\.meetup\.com\/[^"'\\\s<)]+\/events\/\d+|doity\.com\.br\/[^"'\\\s<)]+|www\.even3\.com\.br\/[^"'\\\s<)]+)/gi
    )
      .filter((url) => {
        return (
          /sympla\.com\.br\/evento\//i.test(url) ||
          /eventbrite\.[^/]+\/e\//i.test(url) ||
          /meetup\.com\/.+\/events\/\d+/i.test(url) ||
          looksLikeDoityEventUrl(url) ||
          looksLikeEven3EventUrl(url)
        );
      })
      .map((url) => buildCandidate(source, url, "generic-regex"))
  ];

  return filterCandidatesByLocation(filterCandidatesByKeywords(dedupeCandidates(candidates), source), source);
}

function sourceKeywordsMatchVariant(source, variant) {
  const normalizedSourceKeywords = (source.keywords || []).map((keyword) => normalizeText(keyword));
  return variant.keywords.some((keyword) => normalizedSourceKeywords.includes(normalizeText(keyword)));
}

function buildSearchVariantUrl(source, query) {
  const entryUrl = normalizeUrl(source.entry_url);

  if (!entryUrl || !query) {
    return "";
  }

  if (source.source_type === "sympla-search") {
    const url = new URL(entryUrl);
    url.searchParams.set("s", query);
    return url.toString();
  }

  if (source.source_type === "meetup-search") {
    const url = new URL(entryUrl);
    url.searchParams.set("keywords", query);
    return url.toString();
  }

  if (source.source_type === "eventbrite-search") {
    const url = new URL(entryUrl);
    const segments = url.pathname.split("/").filter(Boolean);

    if (!segments.length) {
      return "";
    }

    const querySlug = normalizeText(query).replace(/\s+/g, "-");
    segments[segments.length - 1] = querySlug;
    url.pathname = `/${segments.join("/")}/`;
    return url.toString();
  }

  return "";
}

export function expandDiscoveryInputsForSource(source) {
  const inputs = [{ ...source }];

  if (!SEARCH_SOURCE_TYPES.has(source.source_type || "") || !source.city) {
    return inputs;
  }

  const variantPresets = SEARCH_VARIANT_PRESETS.filter((variant) => sourceKeywordsMatchVariant(source, variant))
    .slice(0, source.source_type === "meetup-search" ? 2 : 4);

  for (const variant of variantPresets) {
    const variantUrl = buildSearchVariantUrl(source, variant.query);

    if (!variantUrl || variantUrl === source.entry_url) {
      continue;
    }

    inputs.push({
      ...source,
      source_name: `${source.source_name} · ${variant.query}`,
      entry_url: variantUrl,
      required_keywords: variant.keywords
    });
  }

  const uniqueInputs = new Map(inputs.map((input) => [input.entry_url, input]));
  return [...uniqueInputs.values()];
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
    return extractGenericCandidates(getDocument(page.html, page.final_url), page.html, page.final_url, source);
  }

  const apiPage = await fetchPage(apiUrl, { fetch_mode: "http" });
  let payload;

  try {
    payload = JSON.parse(apiPage.html);
  } catch {
    return [];
  }

  return dedupeCandidates(
    (payload.results || [])
      .map((item) =>
        buildCandidate(source, item.cohost_registration_url || item.url || "", "gdg-api", {
          title: item.title || "",
          description: item.description_short || item.description || "",
          start_date: item.start_date || "",
          cover_image: item.cropped_banner_url || item.cropped_picture_url || ""
        })
      )
      .filter((item) => item.event_url)
  );
}

export async function discoverCandidatesForSource(source, page, fetchPage) {
  const document = getDocument(page.html, page.final_url);

  if (source.source_type === "meetup-group") {
    return extractMeetupCandidates(document, page.final_url, source, "meetup-group-anchor");
  }

  if (source.source_type === "meetup-search") {
    return extractMeetupCandidates(document, page.final_url, source, "meetup-search-anchor");
  }

  if (source.source_type === "eventbrite-search") {
    return extractEventbriteCandidates(document, page.html, page.final_url, source);
  }

  if (source.source_type === "sympla-search") {
    return extractSymplaCandidates(document, page.html, page.final_url, source);
  }

  if (source.source_type === "doity-search") {
    return extractDoityCandidates(document, page.html, page.final_url, source);
  }

  if (source.source_type === "even3-search") {
    return extractEven3Candidates(document, page.html, page.final_url, source);
  }

  if (source.source_type === "gdg-chapter" || /gdg\.community\.dev/i.test(source.entry_url)) {
    return extractGdgCandidates(page, source, fetchPage);
  }

  return extractGenericCandidates(document, page.html, page.final_url, source);
}

export function dedupeDiscoveredCandidates(candidates) {
  return dedupeCandidates(candidates);
}
