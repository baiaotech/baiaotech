import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import fg from "fast-glob";
import matter from "gray-matter";
import { z } from "zod";

const EVENTS_GLOB = "src/content/events/*.md";
const EVENT_SOURCES_PATH = "data/event-sources.json";
const CATEGORIES_PATH = "src/_data/categories.json";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const VALID_EVENT_KINDS = [
  "conference",
  "meetup",
  "hackathon",
  "workshop",
  "summit",
  "other"
];

export const VALID_FORMATS = ["in-person", "online", "hybrid"];

export const VALID_STATE_CODES = [
  "AL",
  "BA",
  "CE",
  "MA",
  "PB",
  "PE",
  "PI",
  "RN",
  "SE",
  "Nacional",
  "Online",
  ""
];

export const EVENT_SOURCE_TYPES = [
  "sympla-organizer",
  "eventbrite-organizer",
  "doity-page",
  "meetup-group",
  "generic-html"
];

export const eventSourceSchema = z.object({
  source_name: z.string().min(2),
  source_type: z.enum(EVENT_SOURCE_TYPES),
  entry_url: z.string().url(),
  enabled: z.boolean().default(true),
  state: z.string().default(""),
  city: z.string().default(""),
  fetch_mode: z.enum(["http", "browser"]).default("http")
});

export const normalizedEventSchema = z.object({
  title: z.string().default(""),
  start_date: z.string().regex(DATE_PATTERN).or(z.literal("")).default(""),
  end_date: z.string().regex(DATE_PATTERN).or(z.literal("")).default(""),
  kind: z.enum(VALID_EVENT_KINDS).default("other"),
  format: z.enum(VALID_FORMATS).default("in-person"),
  city: z.string().default(""),
  state: z.string().default(""),
  organizer: z.string().default(""),
  venue: z.string().default(""),
  ticket_url: z.string().default(""),
  categories: z.array(z.string()).default([]),
  cover_image: z.string().default(""),
  price: z.string().default(""),
  description: z.string().default(""),
  summary: z.string().default(""),
  source_url: z.string().default(""),
  source_name: z.string().default(""),
  ambiguities: z.array(z.string()).default([])
});

export function getRootDir() {
  return process.cwd();
}

function removeTrackingParams(url) {
  const trackedParams = [
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "referrer",
    "source",
    "utm_campaign",
    "utm_content",
    "utm_id",
    "utm_medium",
    "utm_source",
    "utm_term"
  ];

  for (const param of trackedParams) {
    url.searchParams.delete(param);
  }

  return url;
}

export function normalizeUrl(value, baseUrl = "") {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, baseUrl || undefined);
    url.hash = "";
    removeTrackingParams(url);

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function hashString(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

export function toDateOnly(value) {
  if (!value) {
    return "";
  }

  if (DATE_PATTERN.test(String(value))) {
    return String(value);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function htmlToText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

export function truncateText(value, maxLength = 12000) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function diceCoefficient(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftBigrams = new Map();
  const rightBigrams = new Map();

  const collect = (input, target) => {
    for (let index = 0; index < input.length - 1; index += 1) {
      const bigram = input.slice(index, index + 2);
      target.set(bigram, (target.get(bigram) || 0) + 1);
    }
  };

  collect(normalizedLeft, leftBigrams);
  collect(normalizedRight, rightBigrams);

  let overlap = 0;

  for (const [bigram, count] of leftBigrams) {
    overlap += Math.min(count, rightBigrams.get(bigram) || 0);
  }

  const total = [...leftBigrams.values()].reduce((sum, count) => sum + count, 0) +
    [...rightBigrams.values()].reduce((sum, count) => sum + count, 0);

  return total ? (2 * overlap) / total : 0;
}

export function inferEventKind(title, description) {
  const combined = normalizeText(`${title || ""} ${description || ""}`);

  if (/hackathon|game jam|ctf/.test(combined)) {
    return "hackathon";
  }

  if (/meetup|encontro|user group/.test(combined)) {
    return "meetup";
  }

  if (/workshop|bootcamp|masterclass/.test(combined)) {
    return "workshop";
  }

  if (/summit|forum|leaders/.test(combined)) {
    return "summit";
  }

  if (/conference|conf| congresso | day /.test(` ${combined} `)) {
    return "conference";
  }

  return "other";
}

export function inferEventFormat(description, location) {
  const combined = normalizeText(`${description || ""} ${location || ""}`);

  if (/online|remoto|virtual/.test(combined)) {
    return "online";
  }

  if (/hibrid|hybrid/.test(combined)) {
    return "hybrid";
  }

  return "in-person";
}

export function parseLocationParts(value) {
  const text = String(value || "").trim();

  if (!text) {
    return {
      venue: "",
      city: "",
      state: ""
    };
  }

  const normalized = text.replace(/[–—]/g, "-");
  const parts = normalized
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);

  const stateCandidate = parts.at(-1) || "";
  const cityCandidate = parts.at(-2) || "";

  if (/^[A-Z]{2}$/.test(stateCandidate)) {
    return {
      venue: text,
      city: cityCandidate.split(",").map((item) => item.trim()).filter(Boolean).at(-1) || cityCandidate,
      state: stateCandidate
    };
  }

  return {
    venue: text,
    city: "",
    state: ""
  };
}

export function inferCategoriesFromText(text, allowedSlugs = []) {
  const slugSet = new Set(allowedSlugs);
  const normalized = normalizeText(text);
  const inferred = [];

  const rules = [
    [/python|pyladies|grupy|pug/, "python"],
    [/gdg|google|android|firebase/, "google"],
    [/react|frontend|front end/, "frontend"],
    [/php/, "php"],
    [/java/, "java"],
    [/seguranca|security|owasp|infosec|cyber/, "seguranca"],
    [/cloud|aws|kubernetes|cncf/, "cloud"],
    [/startup|inovacao|empreendedor/, "inovacao"],
    [/devops|sre|platform engineering/, "devops"],
    [/ia|inteligencia artificial|machine learning|ai /, "ia"],
    [/ux|design/, "ux"],
    [/backend|api|apis/, "backend"],
    [/games|game dev/, "games"]
  ];

  for (const [pattern, slug] of rules) {
    if (pattern.test(normalized) && (!slugSet.size || slugSet.has(slug))) {
      inferred.push(slug);
    }
  }

  return unique(inferred);
}

export async function loadCategories(filePath = path.join(getRootDir(), CATEGORIES_PATH)) {
  const source = await fs.readFile(filePath, "utf8");
  const categories = JSON.parse(source);
  return categories;
}

export async function loadEventSources(filePath = path.join(getRootDir(), EVENT_SOURCES_PATH)) {
  const source = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(source);
  return z.array(eventSourceSchema).parse(parsed);
}

export async function loadExistingEvents(cwd = getRootDir()) {
  const eventPaths = await fg(EVENTS_GLOB, { cwd });
  const events = [];

  for (const relativePath of eventPaths) {
    const source = await fs.readFile(path.join(cwd, relativePath), "utf8");
    const document = matter(source);
    const data = document.data || {};

    events.push({
      path: relativePath,
      title: data.title || "",
      start_date: data.start_date || "",
      end_date: data.end_date || "",
      organizer: data.organizer || "",
      ticket_url: normalizeUrl(data.ticket_url || ""),
      source_url: normalizeUrl(data.source_url || ""),
      legacy_id: data.legacy_id || null
    });
  }

  return events;
}

export function findExistingEvent(existingEvents, candidate) {
  const normalizedSourceUrl = normalizeUrl(candidate.source_url || candidate.ticket_url);

  if (normalizedSourceUrl) {
    const exact = existingEvents.find((event) => {
      return event.source_url === normalizedSourceUrl || event.ticket_url === normalizedSourceUrl;
    });

    if (exact) {
      return {
        match: exact,
        reason: "source_url"
      };
    }
  }

  const titleSimilarityThreshold = 0.92;
  const organizerSimilarityThreshold = 0.85;

  const fuzzy = existingEvents.find((event) => {
    if (event.start_date !== candidate.start_date) {
      return false;
    }

    const titleSimilarity = diceCoefficient(event.title, candidate.title);
    const organizerSimilarity = diceCoefficient(event.organizer, candidate.organizer);

    return (
      titleSimilarity >= titleSimilarityThreshold &&
      organizerSimilarity >= organizerSimilarityThreshold
    );
  });

  if (fuzzy) {
    return {
      match: fuzzy,
      reason: "title_date_organizer"
    };
  }

  return null;
}

export function scoreNormalizedEvent(candidate) {
  const requiredFields = [
    candidate.title,
    candidate.start_date,
    candidate.end_date,
    candidate.organizer,
    candidate.description,
    candidate.source_url || candidate.ticket_url
  ];

  let score = 0;

  if (candidate.title) score += 18;
  if (candidate.start_date) score += 15;
  if (candidate.end_date) score += 10;
  if (candidate.organizer) score += 15;
  if (candidate.description) score += 18;
  if (candidate.source_url || candidate.ticket_url) score += 12;
  if (candidate.categories?.length) score += 5;
  if (candidate.state) score += 4;
  if (candidate.city || candidate.venue) score += 3;

  const blockingAmbiguities = (candidate.ambiguities || []).filter((item) =>
    /category|categor|location|local|format/i.test(item)
  );

  const missingRequired = requiredFields.some((value) => !String(value || "").trim());
  const missingCategory = !(candidate.categories || []).length;
  const missingLocation = !(candidate.city || candidate.state || candidate.venue);

  return {
    score,
    missingRequired,
    blockingAmbiguities,
    missingCategory,
    missingLocation,
    isHighConfidence:
      !missingRequired &&
      !blockingAmbiguities.length &&
      !missingCategory &&
      !missingLocation &&
      score >= 80
  };
}

function yamlValue(value, indent = 0) {
  const padding = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) {
      return "[]";
    }

    return `\n${value.map((item) => `${padding}- ${yamlValue(item, indent + 2)}`).join("\n")}`;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (!value) {
    return '""';
  }

  return JSON.stringify(String(value));
}

export function buildEventMarkdown(candidate) {
  const frontMatter = {
    title: candidate.title,
    start_date: candidate.start_date,
    end_date: candidate.end_date,
    kind: candidate.kind,
    format: candidate.format,
    city: candidate.city || "",
    state: candidate.state || "",
    organizer: candidate.organizer,
    venue: candidate.venue || "",
    ticket_url: candidate.ticket_url || "",
    source_name: candidate.source_name || "",
    source_url: candidate.source_url || "",
    categories: candidate.categories || [],
    featured: false,
    cover_image: candidate.cover_image || "",
    price: candidate.price || ""
  };

  const lines = ["---"];

  for (const [key, value] of Object.entries(frontMatter)) {
    lines.push(`${key}: ${yamlValue(value, 2)}`);
  }

  lines.push("---");

  const description = String(candidate.description || "").trim();
  return `${lines.join("\n")}\n\n${description}\n`;
}

export function buildBranchName(candidate) {
  const slug = slugify(candidate.title || candidate.source_name || "evento");
  const hash = hashString(candidate.source_url || candidate.ticket_url || slug).slice(0, 8);
  return `event-intake/${slug || "evento"}-${hash}`;
}

export function buildPrTitle(candidate) {
  return `feat(events): add ${candidate.title}`;
}

export function buildPrBody(candidate, scoreResult) {
  const ambiguityLines = (candidate.ambiguities || []).length
    ? (candidate.ambiguities || []).map((item) => `- ${item}`).join("\n")
    : "- nenhuma";

  const categoryList = candidate.categories?.length
    ? candidate.categories.map((item) => `\`${item}\``).join(", ")
    : "_nenhuma_";

  return [
    "## Event intake",
    "",
    `- Fonte: [${candidate.source_name || candidate.source_url}](${candidate.source_url})`,
    `- Ticket URL: ${candidate.ticket_url ? `[${candidate.ticket_url}](${candidate.ticket_url})` : "_nao informado_"}`,
    `- Confianca: ${scoreResult.score}/100`,
    `- Datas: ${candidate.start_date} -> ${candidate.end_date}`,
    `- Organizador: ${candidate.organizer}`,
    `- Categorias: ${categoryList}`,
    "",
    "## Resumo",
    "",
    candidate.summary || candidate.description.slice(0, 500),
    "",
    "## Ambiguidades",
    "",
    ambiguityLines,
    "",
    `<!-- event-intake-source:${hashString(candidate.source_url || candidate.ticket_url)} -->`
  ].join("\n");
}

export function buildIssueTitle(candidate) {
  const hash = hashString(candidate.source_url || candidate.ticket_url).slice(0, 8);
  return `Event intake needs review: ${candidate.title || candidate.source_name} (${hash})`;
}

export function buildIssueBody(candidate, scoreResult) {
  const marker = `<!-- event-intake-source:${hashString(candidate.source_url || candidate.ticket_url)} -->`;

  return [
    marker,
    "# Event intake precisa de revisão",
    "",
    `- Fonte: ${candidate.source_name || "_sem nome_"}`,
    `- URL: ${candidate.source_url || candidate.ticket_url || "_sem URL_"}`,
    `- Score: ${scoreResult.score}/100`,
    `- Datas: ${candidate.start_date || "_?"} -> ${candidate.end_date || "_?"}`,
    `- Organizador: ${candidate.organizer || "_?"}`,
    "",
    "## Motivos da baixa confiança",
    "",
    ...(scoreResult.missingRequired ? ["- campos obrigatorios ausentes"] : []),
    ...(scoreResult.blockingAmbiguities.map((item) => `- ${item}`)),
    ...((candidate.ambiguities || []).filter(
      (item) => !scoreResult.blockingAmbiguities.includes(item)
    ).map((item) => `- ${item}`)),
    "",
    "## JSON extraido",
    "",
    "```json",
    JSON.stringify(candidate, null, 2),
    "```"
  ].join("\n");
}

export function ensureEventDefaults(candidate, categorySlugs = []) {
  const normalized = normalizedEventSchema.parse({
    ...candidate,
    categories: unique((candidate.categories || []).filter((item) => categorySlugs.includes(item))),
    state: VALID_STATE_CODES.includes(candidate.state || "") ? candidate.state || "" : "",
    kind: VALID_EVENT_KINDS.includes(candidate.kind) ? candidate.kind : inferEventKind(candidate.title, candidate.description),
    format: VALID_FORMATS.includes(candidate.format)
      ? candidate.format
      : inferEventFormat(candidate.description, candidate.venue)
  });

  if (!normalized.end_date && normalized.start_date) {
    normalized.end_date = normalized.start_date;
  }

  if (!normalized.source_url) {
    normalized.source_url = normalizeUrl(candidate.source_url || candidate.ticket_url || "");
  }

  if (!normalized.ticket_url && normalized.source_url) {
    normalized.ticket_url = normalized.source_url;
  }

  if (!normalized.categories.length) {
    normalized.categories = inferCategoriesFromText(
      `${normalized.title}\n${normalized.description}`,
      categorySlugs
    );
  }

  normalized.description = truncateText(normalized.description, 6000);
  normalized.summary = truncateText(normalized.summary || normalized.description, 400);

  return normalized;
}

export {
  CATEGORIES_PATH,
  DATE_PATTERN,
  EVENT_SOURCES_PATH,
  EVENTS_GLOB
};
