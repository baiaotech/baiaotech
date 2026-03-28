import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import fg from "fast-glob";
import matter from "gray-matter";
import { z } from "zod";

const EVENTS_GLOB = "src/content/events/*.md";
const CATEGORIES_PATH = "src/_data/categories.json";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NORTHEAST_STATE_MAP = {
  "AL": "AL",
  "ALAGOAS": "AL",
  "BA": "BA",
  "BAHIA": "BA",
  "CE": "CE",
  "CEARA": "CE",
  "CEARÁ": "CE",
  "MA": "MA",
  "MARANHAO": "MA",
  "MARANHÃO": "MA",
  "PB": "PB",
  "PARAIBA": "PB",
  "PARAÍBA": "PB",
  "PE": "PE",
  "PERNAMBUCO": "PE",
  "PI": "PI",
  "PIAUI": "PI",
  "PIAUÍ": "PI",
  "RN": "RN",
  "RIO GRANDE DO NORTE": "RN",
  "SE": "SE",
  "SERGIPE": "SE"
};
const NORTHEAST_CITY_TO_STATE = {
  "ARACAJU": "SE",
  "CAMPINA GRANDE": "PB",
  "CAXIAS": "MA",
  "FEIRA DE SANTANA": "BA",
  "FORTALEZA": "CE",
  "IMPERATRIZ": "MA",
  "JOAO PESSOA": "PB",
  "JOÃO PESSOA": "PB",
  "JUAZEIRO DO NORTE": "CE",
  "MACEIO": "AL",
  "MACEIÓ": "AL",
  "MOSSORO": "RN",
  "MOSSORÓ": "RN",
  "NATAL": "RN",
  "PARNAIBA": "PI",
  "PARNAÍBA": "PI",
  "PETROLINA": "PE",
  "RECIFE": "PE",
  "SALVADOR": "BA",
  "SANTA RITA": "PB",
  "SAO LUIS": "MA",
  "SÃO LUÍS": "MA",
  "TERESINA": "PI",
  "VITORIA DA CONQUISTA": "BA",
  "VITÓRIA DA CONQUISTA": "BA"
};
const TECHNOLOGY_KEYWORDS = [
  "tech",
  "tecnologia",
  "developer",
  "development",
  "desenvolvimento",
  "software",
  "programacao",
  "programação",
  "programming",
  "cloud",
  "devops",
  "frontend",
  "backend",
  "fullstack",
  "full stack",
  "data",
  "dados",
  "analytics",
  "ai",
  "ia",
  "inteligencia artificial",
  "inteligência artificial",
  "machine learning",
  "cyber",
  "security",
  "seguranca",
  "segurança",
  "product",
  "produto",
  "design",
  "ux",
  "ui",
  "aws",
  "google",
  "gdg",
  "kubernetes",
  "platform engineering",
  "sre",
  "meetup tech",
  "hackathon"
];
const DIRECT_TECH_KEYWORDS = [
  "software",
  "programacao",
  "programação",
  "programming",
  "developer",
  "developers",
  "desenvolvedor",
  "desenvolvedores",
  "engenheiro de software",
  "engenharia de software",
  "frontend",
  "backend",
  "fullstack",
  "full stack",
  "mobile",
  "android",
  "ios",
  "flutter",
  "react",
  "angular",
  "vue",
  "javascript",
  "typescript",
  "node",
  "node js",
  "python",
  "java",
  "golang",
  "rust",
  "php",
  "cloud",
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "firebase",
  "kubernetes",
  "docker",
  "devops",
  "sre",
  "platform engineering",
  "data science",
  "big data",
  "engenharia de dados",
  "analytics",
  "dados",
  "machine learning",
  "ai",
  "ia",
  "inteligencia artificial",
  "inteligência artificial",
  "llm",
  "seguranca",
  "segurança",
  "security",
  "cybersecurity",
  "cyber",
  "owasp",
  "opensource",
  "open source",
  "blockchain",
  "web3",
  "hackathon",
  "game dev",
  "desenvolvimento de jogos",
  "games"
];
const ADJACENT_TECH_KEYWORDS = [
  "produto digital",
  "product design",
  "product management",
  "product manager",
  "ux",
  "ui",
  "ux ui",
  "design system",
  "design de produto",
  "agilidade",
  "scrum",
  "kanban",
  "gestao tech",
  "gestao de tecnologia",
  "lideranca tech",
  "tech recruiter",
  "tech recruitment",
  "recrutamento tech",
  "recrutamento para tecnologia",
  "talentos tech"
];
const TECH_AUDIENCE_KEYWORDS = [
  "comunidade tech",
  "comunidade de tecnologia",
  "comunidade de desenvolvedores",
  "desenvolvedor",
  "desenvolvedores",
  "developer",
  "developers",
  "engenheiro de software",
  "engenheiros de software",
  "programador",
  "programadores",
  "profissionais de tecnologia",
  "times de tecnologia",
  "times de software",
  "product manager",
  "product managers",
  "designers de produto",
  "designers digitais",
  "tech recruiter",
  "tech recruiters",
  "recrutadores tech",
  "agilistas de tecnologia"
];
const DIGITAL_CONTEXT_KEYWORDS = [
  "digital",
  "software",
  "aplicativo",
  "app",
  "plataforma",
  "startup",
  "saas",
  "web",
  "mobile",
  "produto digital",
  "sistema",
  "sistemas"
];
const NON_TECH_KEYWORDS = [
  "historia",
  "história",
  "biologia",
  "psicologia",
  "pedagogia",
  "arteterapia",
  "sociologia",
  "gerontologia",
  "neuroaprendizagem",
  "medicina",
  "odontologia",
  "enfermagem",
  "saude",
  "saúde",
  "fisioterapia",
  "fonoaudiologia",
  "direito",
  "matematica",
  "matemática",
  "letras",
  "linguistica",
  "linguística",
  "educacao",
  "educação",
  "educacional",
  "rural",
  "agronomia",
  "zootecnia",
  "veterinaria",
  "veterinária",
  "geografia",
  "quimica",
  "química",
  "fisica",
  "física",
  "bioinformatica",
  "bioinformática",
  "terapia ocupacional",
  "congresso brasileiro de",
  "forum internacional de pedagogia",
  "ensino de historia",
  "ensino de matemática",
  "simposio regional de genero",
  "simpósio regional de gênero"
];
const DIRECT_TECH_TOPICS = [
  ["cloud", ["cloud", "aws", "azure", "gcp", "google cloud", "firebase", "kubernetes", "docker"]],
  ["ia", ["ai", "ia", "machine learning", "inteligencia artificial", "inteligência artificial", "llm"]],
  ["frontend", ["frontend", "react", "angular", "vue", "javascript", "typescript"]],
  ["backend", ["backend", "node", "node js", "python", "java", "golang", "rust", "php"]],
  ["mobile", ["mobile", "android", "ios", "flutter"]],
  ["devops", ["devops", "sre", "platform engineering"]],
  ["seguranca", ["security", "seguranca", "segurança", "cybersecurity", "cyber", "owasp"]],
  ["data-science", ["data science", "big data", "engenharia de dados", "analytics", "dados"]],
  ["blockchain", ["blockchain", "web3"]],
  ["opensource", ["opensource", "open source"]],
  ["games", ["game dev", "desenvolvimento de jogos", "games"]],
  ["ux", ["ux", "design system", "design de produto", "product design"]],
  ["ui", ["ui", "design system"]],
  ["gestao-po-pm-tech-recruiter", ["product management", "product manager", "tech recruiter", "recrutamento tech"]],
  ["agilidade", ["agilidade", "scrum", "kanban"]]
];
const RESERVED_EVEN3_SEGMENTS = new Set([
  "",
  "#organization",
  "como-funciona",
  "conteudos",
  "documentos",
  "empresa",
  "evento",
  "eventos",
  "eventos-com-submissoes",
  "fale-com-nosso-consultor",
  "plataforma"
]);
const RESERVED_GENERIC_SEGMENTS = new Set([
  "",
  "agenda",
  "agendas",
  "article",
  "blog",
  "conteudo",
  "conteudos",
  "evento",
  "eventos",
  "home",
  "index",
  "news",
  "noticia",
  "noticias",
  "post",
  "posts"
]);

export const VALID_EVENT_KINDS = [
  "conference",
  "meetup",
  "hackathon",
  "workshop",
  "summit",
  "other"
];

export const VALID_FORMATS = ["in-person", "online", "hybrid"];
export const NORTHEAST_STATE_CODES = ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"];

export const VALID_STATE_CODES = [
  ...NORTHEAST_STATE_CODES,
  "Nacional",
  "Online",
  ""
];

export const EVENT_SOURCE_TYPES = [
  "sympla-search",
  "eventbrite-search",
  "meetup-search",
  "meetup-group",
  "doity-search",
  "even3-search",
  "gdg-chapter",
  "generic-html"
];

export const eventSourceSchema = z.object({
  source_name: z.string().min(2),
  source_type: z.enum(EVENT_SOURCE_TYPES),
  entry_url: z.string().url(),
  enabled: z.boolean().default(true),
  state: z.string().default(""),
  city: z.string().default(""),
  fetch_mode: z.enum(["http", "browser"]).default("http"),
  keywords: z.array(z.string()).default([])
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
  tech_relevance: z.enum(["direct", "adjacent", "non_tech"]).or(z.literal("")).default(""),
  tech_audience: z.enum(["tech", "mixed", "non_tech"]).or(z.literal("")).default(""),
  tech_topics: z.array(z.string()).default([]),
  tech_evidence: z.array(z.string()).default([]),
  rejection_reason: z.string().default(""),
  ambiguities: z.array(z.string()).default([])
});

export function getRootDir() {
  return process.cwd();
}

function removeTrackingParams(url) {
  const trackedParams = [
    "eventOrigin",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "recId",
    "recSource",
    "ref",
    "referrer",
    "searchId",
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

function trimTrailingSlashes(value) {
  const input = String(value || "");

  if (!input || input === "/") {
    return input;
  }

  let endIndex = input.length;

  while (endIndex > 1 && input.charCodeAt(endIndex - 1) === 47) {
    endIndex -= 1;
  }

  return endIndex === input.length ? input : input.slice(0, endIndex);
}

function stripHtmlTags(value) {
  const input = String(value || "");
  let result = "";
  let insideTag = false;

  for (const char of input) {
    if (char === "<") {
      insideTag = true;
      continue;
    }

    if (char === ">") {
      insideTag = false;
      continue;
    }

    if (!insideTag) {
      result += char;
    }
  }

  return result;
}

function collapseWhitespacePreservingParagraphs(value) {
  const input = String(value || "");
  let result = "";
  let pendingSpace = false;
  let pendingNewlines = 0;

  for (const char of input) {
    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      pendingSpace = false;
      pendingNewlines = Math.min(pendingNewlines + 1, 2);
      continue;
    }

    if (char === " " || char === "\t") {
      if (!pendingNewlines && result) {
        pendingSpace = true;
      }
      continue;
    }

    if (pendingNewlines) {
      result += "\n".repeat(pendingNewlines);
      pendingNewlines = 0;
    } else if (pendingSpace && result && !result.endsWith("\n")) {
      result += " ";
    }

    pendingSpace = false;
    result += char;
  }

  return result.trim();
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
      url.pathname = trimTrailingSlashes(url.pathname);
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeStateCode(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  const state = NORTHEAST_STATE_MAP[normalized.toUpperCase()];
  return state || (/^[A-Z]{2}$/.test(normalized) ? normalized.toUpperCase() : "");
}

export function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function hashString(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function fingerprintTitle(value) {
  const normalized = normalizeText(value);
  return normalized ? hashString(normalized) : "";
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
    collapseWhitespacePreservingParagraphs(
      stripHtmlTags(
        String(value || "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<\/li>/gi, "\n")
      )
    )
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

export function isNortheastState(value) {
  return NORTHEAST_STATE_CODES.includes(normalizeStateCode(value));
}

export function inferNortheastLocationFromText(value) {
  const text = String(value || "");

  if (!text.trim()) {
    return {
      city: "",
      state: "",
      matched_text: ""
    };
  }

  for (const [city, state] of Object.entries(NORTHEAST_CITY_TO_STATE)) {
    const pattern = new RegExp(`\\b${city.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(text)) {
      return {
        city,
        state,
        matched_text: city
      };
    }
  }

  for (const [stateName, stateCode] of Object.entries(NORTHEAST_STATE_MAP)) {
    const pattern = new RegExp(`\\b${stateName.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(text)) {
      return {
        city: "",
        state: stateCode,
        matched_text: stateName
      };
    }
  }

  return {
    city: "",
    state: "",
    matched_text: ""
  };
}

export function inferDeterministicNortheastLocation(candidate = {}) {
  const inferred = inferNortheastLocationFromText(
    [
      candidate.city || "",
      candidate.state || "",
      candidate.venue || "",
      candidate.page_title || "",
      candidate.page_description || "",
      candidate.description || "",
      candidate.summary || "",
      candidate.raw_text || ""
    ]
      .filter(Boolean)
      .join("\n")
  );

  return {
    city: String(candidate.city || inferred.city || "").trim(),
    state: normalizeStateCode(candidate.state || inferred.state || ""),
    matched_text: inferred.matched_text || ""
  };
}

export function looksLikeMeetupListingUrl(value) {
  try {
    const url = new URL(normalizeUrl(value));
    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return /(?:^|\.)meetup\.com$/i.test(url.hostname) && /\/events$/.test(pathname);
  } catch {
    return false;
  }
}

export function looksLikeGenericDirectoryPage(candidate = {}) {
  const combinedText = normalizeText(
    [
      candidate.title || "",
      candidate.page_title || "",
      candidate.description || "",
      candidate.summary || "",
      candidate.raw_text || ""
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (!combinedText) {
    return false;
  }

  return (
    combinedText.includes("encontre eventos meetup") ||
    combinedText.includes("ou crie seu proprio grupo") ||
    combinedText.includes("que compartilham seus interesses")
  );
}

export function matchesTechnologyKeywords(text, keywords = TECHNOLOGY_KEYWORDS) {
  const haystack = normalizeText(text);

  if (!haystack) {
    return false;
  }

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) {
      return false;
    }

    if (normalizedKeyword.includes(" ")) {
      return haystack.includes(normalizedKeyword);
    }

    const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedKeyword)}(\\b|$)`, "i");
    return pattern.test(haystack);
  });
}

export function findKeywordMatches(text, keywords = []) {
  const haystack = normalizeText(text);

  if (!haystack) {
    return [];
  }

  return unique(
    keywords.flatMap((keyword) => {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) {
        return [];
      }

      if (normalizedKeyword.includes(" ")) {
        return haystack.includes(normalizedKeyword) ? [normalizedKeyword] : [];
      }

      const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedKeyword)}(\\b|$)`, "i");
      return pattern.test(haystack) ? [normalizedKeyword] : [];
    })
  );
}

function inferTechTopics(matches = []) {
  return unique(
    DIRECT_TECH_TOPICS.flatMap(([topic, topicMatches]) => {
      return topicMatches.some((term) => matches.includes(normalizeText(term))) ? [topic] : [];
    })
  );
}

export function evaluateTechRelevanceDeterministic(candidate = {}, source = {}) {
  const contentText = [
    candidate.title,
    candidate.summary,
    candidate.description,
    candidate.organizer,
    candidate.venue
  ]
    .filter(Boolean)
    .join("\n");
  const audienceText = [
    contentText,
    source.source_name,
    (source.keywords || []).join(" ")
  ]
    .filter(Boolean)
    .join("\n");
  const strongTechSource = ["meetup-group", "gdg-chapter"].includes(source.source_type || "");
  const directMatches = unique([
    ...findKeywordMatches(contentText, DIRECT_TECH_KEYWORDS),
    ...(strongTechSource
      ? findKeywordMatches((source.keywords || []).join(" "), DIRECT_TECH_KEYWORDS)
      : [])
  ]);
  const adjacentMatches = findKeywordMatches(contentText, ADJACENT_TECH_KEYWORDS);
  const audienceMatches = findKeywordMatches(audienceText, TECH_AUDIENCE_KEYWORDS);
  const digitalContextMatches = findKeywordMatches(audienceText, DIGITAL_CONTEXT_KEYWORDS);
  const denyMatches = findKeywordMatches(contentText, NON_TECH_KEYWORDS);
  const hasDirectMatches = directMatches.length > 0;
  const hasAdjacentMatches = adjacentMatches.length > 0;
  const hasTechAudience = strongTechSource || audienceMatches.length > 0;
  const hasDigitalContext = digitalContextMatches.length > 0;
  const hasExplicitTechAgenda = hasDirectMatches || (hasAdjacentMatches && hasTechAudience && hasDigitalContext);

  let techRelevance = "";
  let techAudience = "non_tech";
  let rejectionReason = "";

  if (hasDirectMatches) {
    techRelevance = "direct";
    techAudience = hasTechAudience ? "tech" : "mixed";
  } else if (hasAdjacentMatches && (hasTechAudience || hasDigitalContext)) {
    techRelevance = "adjacent";
    techAudience = hasTechAudience ? "tech" : "mixed";
  } else {
    techRelevance = "non_tech";
    rejectionReason = hasAdjacentMatches ? "adjacent_without_tech_audience" : "no_explicit_tech_agenda";
  }

  if (denyMatches.length && !hasExplicitTechAgenda) {
    techRelevance = "non_tech";
    techAudience = "non_tech";
    rejectionReason = `deny_terms:${denyMatches.join(", ")}`;
  } else if (denyMatches.length && techRelevance === "adjacent" && techAudience !== "tech") {
    techRelevance = "non_tech";
    techAudience = "non_tech";
    rejectionReason = `ambiguous_non_tech_context:${denyMatches.join(", ")}`;
  }

  return {
    tech_relevance: techRelevance,
    tech_audience: techAudience,
    tech_topics: inferTechTopics([...directMatches, ...adjacentMatches]),
    tech_evidence: unique([...directMatches, ...adjacentMatches, ...audienceMatches]).slice(0, 6),
    rejection_reason: rejectionReason,
    direct_matches: directMatches,
    adjacent_matches: adjacentMatches,
    audience_matches: audienceMatches,
    deny_matches: denyMatches,
    should_skip_before_gemini: techRelevance === "non_tech"
  };
}

export function looksLikeEven3EventUrl(url) {
  try {
    const candidate = new URL(url);
    if (!/even3\.com\.br$/i.test(candidate.host)) {
      return false;
    }

    const segments = candidate.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) {
      return false;
    }

    const [slug] = segments;
    return Boolean(slug && !RESERVED_EVEN3_SEGMENTS.has(slug.toLowerCase()));
  } catch {
    return false;
  }
}

export function looksLikeDoityEventUrl(url) {
  try {
    const candidate = new URL(url);
    if (!/doity\.com\.br$/i.test(candidate.host)) {
      return false;
    }

    const segments = candidate.pathname.split("/").filter(Boolean);
    if (!segments.length || segments.length > 2) {
      return false;
    }

    return !["404", "eventos"].includes((segments[0] || "").toLowerCase());
  } catch {
    return false;
  }
}

export function looksLikeGenericCommunityEventUrl(url, baseUrl = "") {
  const normalized = normalizeUrl(url, baseUrl);

  if (!normalized) {
    return false;
  }

  try {
    const candidate = new URL(normalized);
    const segments = candidate.pathname.split("/").filter(Boolean);
    const lastSegment = (segments.at(-1) || "").toLowerCase();

    if (!segments.length || RESERVED_GENERIC_SEGMENTS.has(lastSegment)) {
      return false;
    }

    if (
      /\/(agenda|evento|eventos|events|ingressos|inscricao|inscricoes|tickets|programacao|programacao-?|workshop|meetup|summit|hackathon|conference|conferencia|congresso|forum|bootcamp)\b/i.test(
        candidate.pathname
      )
    ) {
      return true;
    }

    return /(sympla|eventbrite|meetup|doity|even3|gdg\.community\.dev)/i.test(candidate.host);
  } catch {
    return false;
  }
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

export function parseEventSources(sourceText = "") {
  const parsed = JSON.parse(sourceText);
  return z.array(eventSourceSchema).parse(parsed);
}

export async function loadEventSources(sourceText = process.env.EVENT_INTAKE_SOURCES_JSON || "") {
  const trimmed = String(sourceText || "").trim();

  if (!trimmed) {
    throw new Error("EVENT_INTAKE_SOURCES_JSON precisa estar definido com o registro inline das fontes.");
  }

  return parseEventSources(trimmed);
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

export function classifyIntakeCandidate(candidate, scoreResult, options = {}) {
  const todayKey = String(options.todayKey || "");
  const boundaryKey = candidate.end_date || candidate.start_date || "";
  const state = normalizeStateCode(candidate.state || NORTHEAST_CITY_TO_STATE[candidate.city] || "");
  const format = candidate.format || "";

  if (DATE_PATTERN.test(boundaryKey) && todayKey && boundaryKey < todayKey) {
    return { action: "skip", reason: "past" };
  }

  if (format === "online") {
    return { action: "skip", reason: "online_only" };
  }

  if (state && !isNortheastState(state)) {
    return { action: "skip", reason: "non_northeast" };
  }

  if (
    candidate.tech_relevance === "non_tech" ||
    !candidate.tech_relevance ||
    (candidate.tech_relevance === "adjacent" && candidate.tech_audience !== "tech")
  ) {
    return { action: "skip", reason: "non_tech" };
  }

  if (!scoreResult.isHighConfidence) {
    return { action: "issue", reason: "low_confidence" };
  }

  if (!state) {
    return { action: "issue", reason: "low_confidence" };
  }

  return { action: "pr", reason: "ready" };
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
    `- Relevancia tech: ${candidate.tech_relevance || "_nao classificada_"}`,
    `- Publico tech: ${candidate.tech_audience || "_nao classificado_"}`,
    `- Topicos tech: ${(candidate.tech_topics || []).length ? candidate.tech_topics.map((item) => `\`${item}\``).join(", ") : "_nenhum_"}`,
    `- Evidencias tech: ${(candidate.tech_evidence || []).length ? candidate.tech_evidence.join(", ") : "_nenhuma_"}`,
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
    `- Relevancia tech: ${candidate.tech_relevance || "_nao classificada_"}`,
    `- Publico tech: ${candidate.tech_audience || "_nao classificado_"}`,
    `- Topicos tech: ${(candidate.tech_topics || []).length ? candidate.tech_topics.join(", ") : "_nenhum_"}`,
    `- Evidencias tech: ${(candidate.tech_evidence || []).length ? candidate.tech_evidence.join(", ") : "_nenhuma_"}`,
    "",
    "## Motivos da baixa confiança",
    "",
    ...(scoreResult.missingRequired ? ["- campos obrigatorios ausentes"] : []),
    ...(scoreResult.blockingAmbiguities.map((item) => `- ${item}`)),
    ...((candidate.ambiguities || []).filter(
      (item) => !scoreResult.blockingAmbiguities.includes(item)
    ).map((item) => `- ${item}`)),
    ...(candidate.rejection_reason ? [`- ${candidate.rejection_reason}`] : []),
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
    state: normalizeStateCode(candidate.state || "") || "",
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
  normalized.tech_topics = unique((normalized.tech_topics || []).map((item) => normalizeText(item)).filter(Boolean)).slice(0, 6);
  normalized.tech_evidence = unique((normalized.tech_evidence || []).map((item) => truncateText(item, 120)).filter(Boolean)).slice(0, 6);
  normalized.rejection_reason = truncateText(normalized.rejection_reason || "", 240);

  return normalized;
}

export {
  CATEGORIES_PATH,
  DATE_PATTERN,
  EVENTS_GLOB
};
