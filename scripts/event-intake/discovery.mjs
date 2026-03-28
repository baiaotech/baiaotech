import { JSDOM } from "jsdom";

import {
  looksLikeDoityEventUrl,
  looksLikeEven3EventUrl,
  looksLikeGenericCommunityEventUrl,
  matchesTechnologyKeywords,
  normalizeUrl
} from "./shared.mjs";

function getDocument(html, baseUrl) {
  return new JSDOM(html, { url: baseUrl }).window.document;
}

function normalizeCandidateUrl(url, baseUrl = "") {
  return normalizeUrl(url, baseUrl);
}

function collectAnchorData(document, baseUrl) {
  return [...document.querySelectorAll("a[href]")]
    .map((anchor) => ({
      url: normalizeCandidateUrl(anchor.getAttribute("href"), baseUrl),
      text: String(anchor.textContent || "").trim(),
      title: String(anchor.getAttribute("title") || "").trim()
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
  const keywords = source.keywords || [];

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

function extractEventUrlsByRegex(html, regex, normalizer = (url) => normalizeUrl(url)) {
  return [...new Set((html.match(regex) || []).map((url) => normalizer(url)).filter(Boolean))];
}

function extractMeetupCandidates(document, baseUrl, source, discoveryHint) {
  const candidates = collectAnchorData(document, baseUrl)
    .filter((item) => /meetup\.com\/.+\/events\/\d+/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, discoveryHint, {
        title: item.text || item.title
      })
    );

  return filterCandidatesByKeywords(dedupeCandidates(candidates), source);
}

function extractEventbriteCandidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => /eventbrite\.[^/]+\/e\/.+tickets-/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "eventbrite-anchor", {
        title: item.text || item.title
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.eventbrite\.[^/]+\/e\/[^"'\\\s<]+tickets-[^"'\\\s<)]+/gi
  ).map((url) => buildCandidate(source, url, "eventbrite-regex"));

  return filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates]), source);
}

function extractSymplaCandidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => /sympla\.com\.br\/evento\/.+\/\d+/i.test(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "sympla-anchor", {
        title: item.text || item.title
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.sympla\.com\.br\/evento\/[^"'\\\s<)]+\/\d+/gi
  ).map((url) => buildCandidate(source, url, "sympla-regex"));

  return filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates]), source);
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
        title: item.text || item.title
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/doity\.com\.br\/[^"'\\\s<)]+/gi,
    toDoityCanonicalEventUrl
  ).map((url) => buildCandidate(source, url, "doity-regex"));

  return filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates]), source);
}

function extractEven3Candidates(document, html, baseUrl, source) {
  const anchorCandidates = collectAnchorData(document, baseUrl)
    .filter((item) => looksLikeEven3EventUrl(item.url))
    .map((item) =>
      buildCandidate(source, item.url, "even3-anchor", {
        title: item.text || item.title
      })
    );

  const regexCandidates = extractEventUrlsByRegex(
    html,
    /https:\/\/www\.even3\.com\.br\/[^"'\\\s<)]+/gi
  )
    .filter((url) => looksLikeEven3EventUrl(url))
    .map((url) => buildCandidate(source, url, "even3-regex"));

  return filterCandidatesByKeywords(dedupeCandidates([...anchorCandidates, ...regexCandidates]), source);
}

function extractGenericCandidates(document, html, baseUrl, source) {
  const candidates = [
    ...collectAnchorData(document, baseUrl)
      .filter((item) => looksLikeGenericCommunityEventUrl(item.url, baseUrl))
      .map((item) =>
        buildCandidate(source, item.url, "generic-anchor", {
          title: item.text || item.title
        })
      ),
    ...extractUrlsFromJsonLd(document).map((url) => buildCandidate(source, url, "json-ld")),
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

  return filterCandidatesByKeywords(dedupeCandidates(candidates), source);
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
