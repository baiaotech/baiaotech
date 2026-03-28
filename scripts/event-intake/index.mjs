import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { getPlaywrightRuntimeEnv } from "../playwright-support.mjs";
import {
  EVENT_BLACKLIST_PATH,
  findBlacklistedEvent,
  isBlacklistableReason,
  loadEventBlacklist,
  saveEventBlacklist,
  upsertBlacklistEntry
} from "./blacklist.mjs";
import {
  createCacheManager,
  DEFAULT_BROWSER_DETAIL_TTL_HOURS,
  DEFAULT_BROWSER_LISTING_TTL_HOURS
} from "./cache.mjs";
import {
  dedupeDiscoveredCandidates,
  discoverCandidatesForSource,
  expandDiscoveryInputsForSource
} from "./discovery.mjs";
import { extractDeterministicEventData } from "./extract.mjs";
import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildIssueTitle,
  buildPrBody,
  buildPrTitle,
  classifyIntakeCandidate,
  evaluateTechRelevanceDeterministic,
  ensureEventDefaults,
  fingerprintTitle,
  findExistingEvent,
  hashString,
  inferDeterministicNortheastLocation,
  loadCategories,
  loadEventSources,
  loadExistingEvents,
  looksLikeGenericDirectoryPage,
  looksLikeMeetupListingUrl,
  normalizedEventSchema,
  normalizeStateCode,
  normalizeUrl,
  scoreNormalizedEvent,
  slugify,
  toDateOnly
} from "./shared.mjs";
import {
  closeIssueByMarker,
  createOrUpdateEventPr,
  listClosedEventIntakeFeedback,
  syncRepoFileToDefaultBranch,
  upsertIssue
} from "./github.mjs";
import { createBucketScheduler } from "./limit.mjs";

const require = createRequire(import.meta.url);
const { EVENT_TIME_ZONE, getDateKeyInTimeZone } = require("../../lib/event-dates.js");

const DEFAULT_MAX_SOURCES = Number(process.env.EVENT_INTAKE_MAX_SOURCES || 200);
const DEFAULT_MAX_UNIQUE_URLS = Number(process.env.EVENT_INTAKE_MAX_UNIQUE_URLS || 150);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const DEFAULT_TOTAL_LIMITS = {
  "discovery-http": 8,
  "discovery-browser": 2,
  "detail-http": 12,
  "detail-browser": 2,
  "gemini": 4
};
const DEFAULT_HOST_LIMITS = {
  "discovery-http": 2,
  "detail-http": 3
};
const DEFAULT_HTTP_TIMEOUT_MS = {
  listing: 20000,
  detail: 30000
};
const BROWSER_FALLBACK_SOURCE_TYPES = new Set([
  "sympla-search",
  "eventbrite-search",
  "doity-search",
  "even3-search"
]);

let browserPromise = null;

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce(
    (options, argument) => {
      if (argument === "--apply") {
        options.apply = true;
      } else if (argument === "--dry-run") {
        options.apply = false;
      } else if (argument === "--cache-bust") {
        options.cacheBust = true;
      } else if (argument.startsWith("--source=")) {
        options.sourceName = argument.slice("--source=".length);
      } else if (argument.startsWith("--source-type=")) {
        options.sourceType = argument.slice("--source-type=".length);
      } else if (argument.startsWith("--max-sources=")) {
        options.maxSources = Number(argument.slice("--max-sources=".length)) || options.maxSources;
      } else if (argument.startsWith("--max-urls=")) {
        options.maxUniqueUrls = Number(argument.slice("--max-urls=".length)) || options.maxUniqueUrls;
      }

      return options;
    },
    {
      apply: false,
      sourceName: "",
      sourceType: "",
      maxSources: DEFAULT_MAX_SOURCES,
      maxUniqueUrls: DEFAULT_MAX_UNIQUE_URLS,
      persistBlacklist: false,
      cacheBust: false
    }
  );
}

async function getBrowser() {
  if (!browserPromise) {
    const runtimeEnv = await getPlaywrightRuntimeEnv();

    if (runtimeEnv.LD_LIBRARY_PATH) {
      process.env.LD_LIBRARY_PATH = runtimeEnv.LD_LIBRARY_PATH;
    }

    browserPromise = chromium.launch({ headless: true });
  }

  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

function createCooldownError(url, cooldown) {
  const error = new Error(`Cooldown ativo para ${cooldown.host || url} ate ${cooldown.cooldownUntil}`);
  error.code = "SOURCE_COOLDOWN";
  error.cooldown = cooldown;
  error.url = url;
  return error;
}

function isCooldownError(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "SOURCE_COOLDOWN");
}

function getHostFromUrl(url) {
  try {
    return new URL(normalizeUrl(url)).host;
  } catch {
    return "";
  }
}

function shouldForceBrowserFallback(source) {
  return BROWSER_FALLBACK_SOURCE_TYPES.has(source?.source_type || "");
}

function getBrowserTtlHours(kind = "detail") {
  return kind === "listing" ? DEFAULT_BROWSER_LISTING_TTL_HOURS : DEFAULT_BROWSER_DETAIL_TTL_HOURS;
}

function getResponseHeader(response, name) {
  return response?.headers?.get?.(name) || "";
}

function getHttpTimeoutMs(kind = "detail") {
  return kind === "listing" ? DEFAULT_HTTP_TIMEOUT_MS.listing : DEFAULT_HTTP_TIMEOUT_MS.detail;
}

function isRequestTimeoutError(error) {
  return (
    Boolean(error && typeof error === "object") &&
    ("name" in error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function recordHostFailure(performance, entry = {}) {
  const host = String(entry.host || "").trim();

  if (!host) {
    return;
  }

  performance.host_failures[host] = {
    status: Number(entry.status || 0) || 0,
    failure_count: Number(entry.failureCount || 0) || 0,
    cooldown_until: entry.cooldownUntil || "",
    last_failure_at: entry.lastFailureAt || "",
    source_names: [...(entry.sourceNames || [])]
  };
}

async function fetchWithHttp(url, context) {
  const { kind = "detail", cacheManager, performance, sourceName = "" } = context;
  const cached = await cacheManager.readHttpCache(url);
  const headers = {
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    "user-agent": "Mozilla/5.0 (compatible; BaiaoTech Event Intake Bot/2.0)"
  };

  if (cached?.meta?.etag) {
    headers["if-none-match"] = cached.meta.etag;
  }

  if (cached?.meta?.lastModified) {
    headers["if-modified-since"] = cached.meta.lastModified;
  }

  let response;

  try {
    response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(getHttpTimeoutMs(kind))
    });
  } catch (error) {
    if (isRequestTimeoutError(error)) {
      throw new Error(`HTTP timeout ao buscar ${url}`);
    }

    throw error;
  }
  const status = Number(response.status || 200) || 200;

  if (status === 304 && cached) {
    performance.http_cache_hits += 1;
    performance.http_not_modified_304 += 1;
    cacheManager.clearFailure(url);
    return {
      final_url: normalizeUrl(cached.meta?.finalUrl || cached.meta?.final_url || url),
      html: cached.body,
      status,
      from_cache: true,
      cache_kind: "http"
    };
  }

  if (!response.ok) {
    if (status === 403 || status === 429 || status >= 500) {
      const failure = cacheManager.recordFailure({ url, sourceName, status });
      recordHostFailure(performance, failure);
    }

    throw new Error(`HTTP ${status} ao buscar ${url}`);
  }

  performance.http_cache_misses += 1;
  const html = await response.text();
  await cacheManager.writeHttpCache({
    url,
    kind,
    status,
    contentType: getResponseHeader(response, "content-type"),
    etag: getResponseHeader(response, "etag"),
    lastModified: getResponseHeader(response, "last-modified"),
    body: html,
    finalUrl: response.url || url
  });
  cacheManager.clearFailure(url);

  return {
    final_url: normalizeUrl(response.url || url),
    html,
    status,
    from_cache: false,
    cache_kind: "http"
  };
}

async function fetchWithBrowser(url, context) {
  const { kind = "detail", cacheManager, performance, sourceName = "" } = context;
  const ttlHours = getBrowserTtlHours(kind);
  const cached = await cacheManager.readBrowserCache(url, ttlHours);

  if (cached) {
    performance.browser_cache_hits += 1;
    return {
      final_url: normalizeUrl(cached.meta?.finalUrl || cached.meta?.final_url || url),
      html: cached.body,
      status: 200,
      from_cache: true,
      cache_kind: "browser"
    };
  }

  performance.browser_cache_misses += 1;
  const browser = await getBrowser();
  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent: "Mozilla/5.0 (compatible; BaiaoTech Event Intake Bot/2.0)"
  });

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const status = Number(response?.status?.() || 200) || 200;

    if (status === 403 || status === 429 || status >= 500) {
      const failure = cacheManager.recordFailure({ url, sourceName, status });
      recordHostFailure(performance, failure);
      throw new Error(`HTTP ${status} ao buscar ${url}`);
    }

    await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
    const html = await page.content();
    const finalUrl = page.url();
    await cacheManager.writeBrowserCache({
      url,
      kind,
      ttlHours,
      body: html,
      finalUrl
    });
    cacheManager.clearFailure(url);

    return {
      final_url: normalizeUrl(finalUrl),
      html,
      status,
      from_cache: false,
      cache_kind: "browser"
    };
  } finally {
    await page.close();
  }
}

async function fetchPage(url, source, context) {
  const { phase = "detail", kind = "detail", cacheManager, scheduler, performance } = context;
  const requestUrl = String(url || "").trim();
  const normalizedUrl = normalizeUrl(requestUrl);
  const cooldown = cacheManager.getCooldown(normalizedUrl);

  if (cooldown) {
    performance.source_cooldown_skips += 1;
    recordHostFailure(performance, cooldown);
    throw createCooldownError(normalizedUrl, cooldown);
  }

  const host = cacheManager.getHostKey(normalizedUrl) || getHostFromUrl(normalizedUrl);
  const preferBrowser = (source?.fetch_mode || "http") === "browser";
  const browserBucket = phase === "discovery" ? "discovery-browser" : "detail-browser";
  const httpBucket = phase === "discovery" ? "discovery-http" : "detail-http";
  const requestContext = {
    kind,
    cacheManager,
    performance,
    sourceName: source?.source_name || ""
  };

  if (preferBrowser) {
    return scheduler.schedule({ bucket: browserBucket, host }, () =>
      fetchWithBrowser(requestUrl, requestContext)
    );
  }

  try {
    return await scheduler.schedule({ bucket: httpBucket, host }, () =>
      fetchWithHttp(requestUrl, requestContext)
    );
  } catch (error) {
    if (shouldForceBrowserFallback(source) && !isCooldownError(error)) {
      return scheduler.schedule({ bucket: browserBucket, host }, () =>
        fetchWithBrowser(requestUrl, requestContext)
      );
    }

    throw error;
  }
}

function eventSchemaForGemini(categorySlugs) {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      start_date: { type: "string" },
      end_date: { type: "string" },
      kind: { type: "string", enum: ["conference", "meetup", "hackathon", "workshop", "summit", "other"] },
      format: { type: "string", enum: ["in-person", "online", "hybrid"] },
      city: { type: "string" },
      state: { type: "string" },
      organizer: { type: "string" },
      venue: { type: "string" },
      ticket_url: { type: "string" },
      categories: {
        type: "array",
        items: { type: "string", enum: categorySlugs }
      },
      cover_image: { type: "string" },
      price: { type: "string" },
      description: { type: "string" },
      summary: { type: "string" },
      source_url: { type: "string" },
      source_name: { type: "string" },
      tech_relevance: { type: "string", enum: ["direct", "adjacent", "non_tech"] },
      tech_audience: { type: "string", enum: ["tech", "mixed", "non_tech"] },
      tech_topics: {
        type: "array",
        items: { type: "string" }
      },
      tech_evidence: {
        type: "array",
        items: { type: "string" }
      },
      rejection_reason: { type: "string" },
      ambiguities: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: [
      "title",
      "start_date",
      "end_date",
      "kind",
      "format",
      "city",
      "state",
      "organizer",
      "venue",
      "ticket_url",
      "categories",
      "cover_image",
      "price",
      "description",
      "summary",
      "source_url",
      "source_name",
      "tech_relevance",
      "tech_audience",
      "tech_topics",
      "tech_evidence",
      "rejection_reason",
      "ambiguities"
    ]
  };
}

function buildGeminiPrompt({ source, deterministic, techAssessment, categorySlugs }) {
  return [
    "Extraia e normalize um evento para o front matter do repo Baião Tech.",
    "Responda apenas em JSON no schema fornecido.",
    "Nao invente dados. Se um campo nao estiver claro, devolva string vazia, array vazio ou registre o problema em ambiguities.",
    "Datas devem estar em YYYY-MM-DD.",
    "Considere apenas eventos do Nordeste do Brasil e marque qualquer incerteza de localidade ou formato em ambiguities.",
    `Categorias permitidas: ${categorySlugs.join(", ")}.`,
    "",
    "Dados determinísticos já extraídos da página:",
    JSON.stringify(deterministic, null, 2),
    "",
    "Sinais determinísticos de relevância tech:",
    JSON.stringify(techAssessment, null, 2),
    "",
    "Contexto da fonte:",
    JSON.stringify(
      {
        source_name: source.source_name,
        source_type: source.source_type,
        entry_url: source.entry_url,
        city: source.city,
        state: source.state,
        keywords: source.keywords || []
      },
      null,
      2
    ),
    "",
    "Regras adicionais:",
    "- description deve ser um corpo curto em Markdown legivel, sem HTML bruto.",
    "- summary deve ter no maximo 280 caracteres.",
    "- ticket_url deve ser a URL do ingresso ou a propria pagina do evento se nao houver outra.",
    "- source_url deve ser a URL canonica da pagina do evento.",
    "- source_name deve manter o nome da fonte curada.",
    "- tech_relevance deve ser direct, adjacent ou non_tech.",
    "- tech_audience deve ser tech, mixed ou non_tech.",
    "- tech_topics deve listar topicos curtos diretamente relacionados a tecnologia.",
    "- tech_evidence deve listar evidencias curtas, preferindo frases ou termos da pagina.",
    "- rejection_reason deve explicar por que o evento nao entra no escopo quando tech_relevance for non_tech.",
    "- se categoria, local ou formato estiverem duvidosos, anote em ambiguities.",
    "- se o evento parecer online ou fora do Nordeste, registre isso em ambiguities.",
    "- Nao classifique como tech eventos de historia, biologia, psicologia, pedagogia, saude, sociologia, letras, educacao geral ou congressos academicos de outras areas so porque usam tecnologia.",
    "- Eventos adjacentes so podem ser adjacent quando forem claramente para publico de tecnologia, como produto digital, UX/UI digital, agilidade em times tech, gestao tech ou recrutamento tech.",
    "- Se o tema principal nao for tecnologia ou carreira em tecnologia, devolva tech_relevance=non_tech."
  ].join("\n");
}

async function normalizeWithGemini({ apiKey, model, source, deterministic, techAssessment, categorySlugs }) {
  if (!apiKey) {
    return {
      ...deterministic,
      ambiguities: ["gemini_api_key_missing"]
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiPrompt({ source, deterministic, techAssessment, categorySlugs }) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: eventSchemaForGemini(categorySlugs)
        }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return {
      ...deterministic,
      ambiguities: [`gemini_request_failed:${response.status}`, text.slice(0, 200)]
    };
  }

  const payload = await response.json();
  const responseText =
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

  try {
    return normalizedEventSchema.parse(JSON.parse(responseText));
  } catch {
    return {
      ...deterministic,
      ambiguities: ["gemini_invalid_json"]
    };
  }
}

function buildEventFilePath(candidate) {
  return `src/content/events/${slugify(candidate.title)}.md`;
}

async function ensureOutputDir() {
  const outputDir = path.join(process.cwd(), "output", "event-intake");
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

function createEmptyCounts() {
  return {
    prs: 0,
    issues: 0,
    duplicates: 0,
    blacklisted: 0,
    rejected_by_feedback: 0,
    past: 0,
    non_northeast: 0,
    online_only: 0,
    non_tech: 0,
    not_event_page: 0,
    low_confidence: 0,
    tech_low_confidence: 0,
    errors: 0
  };
}

function createPerformanceMetrics() {
  return {
    http_cache_hits: 0,
    http_cache_misses: 0,
    http_not_modified_304: 0,
    browser_cache_hits: 0,
    browser_cache_misses: 0,
    source_cooldown_skips: 0,
    host_failures: {},
    gemini_requests: 0,
    duration_ms: 0,
    phases: {
      discovery_ms: 0,
      filter_ms: 0,
      detail_ms: 0,
      normalize_ms: 0,
      persist_ms: 0
    }
  };
}

function createReport(options, sources, todayKey) {
  return {
    apply: Boolean(options.apply),
    model: GEMINI_MODEL,
    time_zone: EVENT_TIME_ZONE,
    today_key: todayKey,
    config: {
      source_name: options.sourceName || "",
      source_type: options.sourceType || "",
      max_sources: options.maxSources,
      max_unique_urls: options.maxUniqueUrls,
      cache_bust: Boolean(options.cacheBust)
    },
    sources_total: sources.length,
    sources_processed: [],
    created_prs: [],
    updated_prs: [],
    created_issues: [],
    skipped_duplicates: [],
    skipped_blacklist: [],
    skipped_low_confidence: [],
    skipped_policy: [],
    errors: [],
    performance: createPerformanceMetrics(),
    summary: {
      sources_total: sources.length,
      sources_processed: 0,
      discovered_candidates: 0,
      unique_candidates: 0,
      processed_candidates: 0,
      counts: createEmptyCounts()
    }
  };
}

function addSummaryCount(report, key) {
  report.summary.counts[key] = (report.summary.counts[key] || 0) + 1;
}

function formatPolicyExample(item = {}) {
  const details = [
    item.title ? `titulo: ${item.title}` : "",
    item.source_name ? `fonte: ${item.source_name}` : "",
    item.reason ? `motivo: ${item.reason}` : "",
    item.rejection_reason ? `detalhe: ${item.rejection_reason}` : "",
    (item.tech_evidence || []).length ? `evidencias: ${item.tech_evidence.join(", ")}` : "",
    item.feedback_url ? `feedback: ${item.feedback_url}` : ""
  ].filter(Boolean);

  return `- ${details.join(" | ")}`;
}

async function writeReportArtifacts(report) {
  const outputDir = await ensureOutputDir();
  const jsonPath = path.join(outputDir, "latest.json");
  const markdownPath = path.join(outputDir, "summary.md");
  const perfPath = path.join(outputDir, "perf.json");
  const nonTechExamples = report.skipped_policy.filter((item) => item.reason === "non_tech").slice(0, 10);
  const feedbackExamples = report.skipped_blacklist.filter((item) => item.origin === "review_feedback").slice(0, 10);
  const markdown = [
    "# Event intake summary",
    "",
    `- Apply: ${report.apply ? "yes" : "no"}`,
    `- Modelo: ${report.model}`,
    `- Data de corte: ${report.today_key} (${report.time_zone})`,
    `- Fontes processadas: ${report.summary.sources_processed}/${report.sources_total}`,
    `- Candidatos descobertos: ${report.summary.discovered_candidates}`,
    `- Candidatos unicos: ${report.summary.unique_candidates}`,
    `- Candidatos processados: ${report.summary.processed_candidates}`,
    `- Feedback historico carregado: ${report.feedback_seeded || 0}`,
    "",
    "## Contagens",
    "",
    ...Object.entries(report.summary.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Performance",
    "",
    `- duration_ms: ${report.performance.duration_ms}`,
    ...Object.entries(report.performance.phases).map(([key, value]) => `- ${key}: ${value}`),
    `- http_cache_hits: ${report.performance.http_cache_hits}`,
    `- http_cache_misses: ${report.performance.http_cache_misses}`,
    `- http_not_modified_304: ${report.performance.http_not_modified_304}`,
    `- browser_cache_hits: ${report.performance.browser_cache_hits}`,
    `- browser_cache_misses: ${report.performance.browser_cache_misses}`,
    `- source_cooldown_skips: ${report.performance.source_cooldown_skips}`,
    `- gemini_requests: ${report.performance.gemini_requests}`,
    "",
    "## Fontes",
    "",
    ...report.sources_processed.map((source) => {
      return `- ${source.source_name} [${source.source_type}]: descobertos ${source.discovered_candidates}, unicos ${source.unique_candidates}, processados ${source.processed_candidates}, cooldown ${source.skipped_cooldown || 0}, erros ${source.errors || 0}`;
    }),
    "",
    "## Exemplos rejeitados por non_tech",
    "",
    ...(nonTechExamples.length ? nonTechExamples.map(formatPolicyExample) : ["- nenhum"]),
    "",
    "## Rejeitados por feedback humano",
    "",
    ...(feedbackExamples.length ? feedbackExamples.map(formatPolicyExample) : ["- nenhum"])
  ].join("\n");

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, `${markdown}\n`, "utf8");
  await fs.writeFile(perfPath, `${JSON.stringify(report.performance, null, 2)}\n`, "utf8");

  report.report_path = jsonPath;
  report.summary_path = markdownPath;
  report.performance_path = perfPath;
  return report;
}

function annotateLowConfidence(normalized, scoreResult) {
  return {
    title: normalized.title,
    source_url: normalized.source_url,
    tech_relevance: normalized.tech_relevance,
    tech_audience: normalized.tech_audience,
    tech_topics: normalized.tech_topics,
    tech_evidence: normalized.tech_evidence,
    reasons: [
      ...(scoreResult.missingRequired ? ["missing_required_fields"] : []),
      ...(scoreResult.missingCategory ? ["missing_category"] : []),
      ...(scoreResult.missingLocation ? ["missing_location"] : []),
      ...scoreResult.blockingAmbiguities
    ]
  };
}

function hasConfirmedNortheastLocationEvidence(deterministic = {}, normalized = {}) {
  const location = inferDeterministicNortheastLocation(deterministic);
  const normalizedState = normalizeStateCode(normalized.state || "");

  if (!location.state) {
    return false;
  }

  if (normalizedState && normalizedState !== location.state) {
    return false;
  }

  return true;
}

function looksLikeEventListingCandidate(normalized = {}, deterministic = {}) {
  const url = normalizeUrl(normalized.source_url || normalized.ticket_url || deterministic.source_url || "");

  if (looksLikeMeetupListingUrl(url)) {
    return true;
  }

  return looksLikeGenericDirectoryPage({
    ...deterministic,
    ...normalized
  });
}

function createPastDisposition(candidate, todayKey) {
  const boundaryKey = toDateOnly(candidate.end_date || candidate.start_date || "");

  if (!boundaryKey || !todayKey || boundaryKey >= todayKey) {
    return null;
  }

  return {
    action: "skip",
    reason: "past",
    boundaryKey
  };
}

function createSourceSummary(source) {
  return {
    source_name: source.source_name,
    source_type: source.source_type,
    discovered_candidates: 0,
    unique_candidates: 0,
    processed_candidates: 0,
    skipped_blacklisted: 0,
    skipped_due_to_global_limit: 0,
    skipped_cooldown: 0,
    errors: 0
  };
}

function buildBlacklistLookupKey(candidate = {}) {
  const normalizedSourceUrl = normalizeUrl(candidate.event_url || candidate.source_url || candidate.ticket_url);

  if (normalizedSourceUrl) {
    return hashString(normalizedSourceUrl);
  }

  return hashString(
    [
      String(candidate.title || "").trim().toLowerCase(),
      String(candidate.start_date || "").trim(),
      String(candidate.source_name || "").trim().toLowerCase()
    ].join("::")
  );
}

function buildBlacklistIndex(blacklist) {
  const byUrl = new Map();
  const byKey = new Map();
  const byTitleFingerprint = new Map();

  for (const entry of blacklist?.entries || []) {
    if (entry.source_url) {
      byUrl.set(entry.source_url, entry);
    }

    if (entry.ticket_url) {
      byUrl.set(entry.ticket_url, entry);
    }

    if (entry.key) {
      byKey.set(entry.key, entry);
    }

    if (entry.title_fingerprint) {
      byTitleFingerprint.set(entry.title_fingerprint, entry);
    }
  }

  return { byUrl, byKey, byTitleFingerprint };
}

function findBlacklistedEventIndexed(index, blacklist, candidate = {}) {
  const urls = [candidate.event_url, candidate.source_url, candidate.ticket_url]
    .map((value) => normalizeUrl(value))
    .filter(Boolean);

  for (const url of urls) {
    if (index.byUrl.has(url)) {
      return index.byUrl.get(url);
    }
  }

  const key = buildBlacklistLookupKey(candidate);
  const titleFingerprint = fingerprintTitle(candidate.title);
  return (
    index.byKey.get(key) ||
    (titleFingerprint ? index.byTitleFingerprint.get(titleFingerprint) : null) ||
    findBlacklistedEvent(blacklist, candidate)
  );
}

function updateBlacklistIndex(index, entry = {}) {
  if (entry.source_url) {
    index.byUrl.set(entry.source_url, entry);
  }

  if (entry.ticket_url) {
    index.byUrl.set(entry.ticket_url, entry);
  }

  if (entry.key) {
    index.byKey.set(entry.key, entry);
  }

  if (entry.title_fingerprint) {
    index.byTitleFingerprint.set(entry.title_fingerprint, entry);
  }
}

function buildExistingEventIndex(existingEvents = []) {
  const byUrl = new Map();
  const byDate = new Map();

  for (const event of existingEvents) {
    if (event.source_url) {
      byUrl.set(event.source_url, event);
    }

    if (event.ticket_url) {
      byUrl.set(event.ticket_url, event);
    }

    const bucket = byDate.get(event.start_date) || [];
    bucket.push(event);
    byDate.set(event.start_date, bucket);
  }

  return { byUrl, byDate };
}

function findExistingEventIndexed(index, candidate) {
  const normalizedSourceUrl = normalizeUrl(candidate.source_url || candidate.ticket_url);

  if (normalizedSourceUrl && index.byUrl.has(normalizedSourceUrl)) {
    return {
      match: index.byUrl.get(normalizedSourceUrl),
      reason: "source_url"
    };
  }

  const sameDateEvents = index.byDate.get(candidate.start_date) || [];
  return findExistingEvent(sameDateEvents, candidate);
}

function addExistingEventToIndex(index, candidate, pathValue = "") {
  const event = {
    path: pathValue,
    title: candidate.title || "",
    start_date: candidate.start_date || "",
    end_date: candidate.end_date || "",
    organizer: candidate.organizer || "",
    ticket_url: normalizeUrl(candidate.ticket_url || ""),
    source_url: normalizeUrl(candidate.source_url || ""),
    legacy_id: null
  };

  if (event.source_url) {
    index.byUrl.set(event.source_url, event);
  }

  if (event.ticket_url) {
    index.byUrl.set(event.ticket_url, event);
  }

  const bucket = index.byDate.get(event.start_date) || [];
  bucket.push(event);
  index.byDate.set(event.start_date, bucket);
}

async function measurePhase(performance, key, task) {
  const startedAt = Date.now();

  try {
    return await task();
  } finally {
    performance.phases[key] += Date.now() - startedAt;
  }
}

function normalizeCandidateEventUrl(candidate) {
  return normalizeUrl(candidate.event_url || candidate.source_url || candidate.ticket_url);
}

function sortSourceSummaries(sources, summaryMap) {
  return sources.map((source) => summaryMap.get(source.entry_url) || createSourceSummary(source));
}

async function seedBlacklistFromReviewFeedback({
  blacklist,
  blacklistIndex,
  todayKey,
  report
}) {
  if (!process.env.TOKEN_FOR_CI_EVENTS || !process.env.GITHUB_REPOSITORY) {
    return { blacklist, blacklistIndex, changed: false };
  }

  try {
    const feedbackEntries = await listClosedEventIntakeFeedback({
      token: process.env.TOKEN_FOR_CI_EVENTS,
      repo: process.env.GITHUB_REPOSITORY,
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com"
    });

    let nextBlacklist = blacklist;
    let changed = false;

    for (const entry of feedbackEntries) {
      const update = upsertBlacklistEntry(
        nextBlacklist,
        entry,
        {
          todayKey,
          reason: "non_tech",
          origin: "review_feedback",
          feedbackUrl: entry.feedback_url,
          details: entry.details || "review_feedback"
        }
      );
      nextBlacklist = update.blacklist;
      changed ||= update.changed;
      if (update.entry) {
        updateBlacklistIndex(blacklistIndex, update.entry);
      }
    }

    report.feedback_seeded = feedbackEntries.length;
    return { blacklist: nextBlacklist, blacklistIndex, changed };
  } catch (error) {
    report.errors.push({
      source_name: "review-feedback",
      event_url: "",
      message: error instanceof Error ? error.message : String(error)
    });
    return { blacklist, blacklistIndex, changed: false };
  }
}

export async function runEventIntake(options = {}) {
  const resolvedOptions = {
    apply: Boolean(options.apply),
    sourceName: options.sourceName || "",
    sourceType: options.sourceType || "",
    maxSources: Number(options.maxSources || DEFAULT_MAX_SOURCES) || DEFAULT_MAX_SOURCES,
    maxUniqueUrls: Number(options.maxUniqueUrls || DEFAULT_MAX_UNIQUE_URLS) || DEFAULT_MAX_UNIQUE_URLS,
    persistBlacklist: Boolean(options.persistBlacklist || options.apply),
    cacheBust: Boolean(options.cacheBust)
  };
  const startedAt = Date.now();
  const categories = await loadCategories();
  const categorySlugs = categories.map((item) => item.slug);
  const allSources = await loadEventSources();
  const sources = allSources
    .filter((source) => source.enabled)
    .filter((source) => !resolvedOptions.sourceName || source.source_name === resolvedOptions.sourceName)
    .filter((source) => !resolvedOptions.sourceType || source.source_type === resolvedOptions.sourceType)
    .slice(0, resolvedOptions.maxSources);
  const existingEvents = await loadExistingEvents();
  const existingEventIndex = buildExistingEventIndex(existingEvents);
  let blacklist = await loadEventBlacklist();
  let blacklistIndex = buildBlacklistIndex(blacklist);
  const todayKey = getDateKeyInTimeZone(new Date(), EVENT_TIME_ZONE);
  const report = createReport(resolvedOptions, sources, todayKey);
  const sourceSummaryMap = new Map(sources.map((source) => [source.entry_url, createSourceSummary(source)]));
  const seenNormalizedUrls = new Set();
  let blacklistChanged = false;

  const feedbackSeed = await seedBlacklistFromReviewFeedback({
    blacklist,
    blacklistIndex,
    todayKey,
    report
  });
  blacklist = feedbackSeed.blacklist;
  blacklistIndex = feedbackSeed.blacklistIndex;
  blacklistChanged ||= feedbackSeed.changed;

  const cacheManager = await createCacheManager({
    cwd: process.cwd(),
    cacheBust: resolvedOptions.cacheBust
  });
  const scheduler = createBucketScheduler({
    totalLimits: DEFAULT_TOTAL_LIMITS,
    hostLimits: DEFAULT_HOST_LIMITS,
    defaultTotalLimit: 1,
    defaultHostLimit: 1
  });

  try {
    const discoveryResults = await measurePhase(report.performance, "discovery_ms", async () => {
      return Promise.all(
        sources.map(async (source) => {
          const sourceSummary = sourceSummaryMap.get(source.entry_url);
          const discoveryInputs = expandDiscoveryInputsForSource(source);
          const aggregatedCandidates = [];
          let successfulDiscoveryInputs = 0;

          try {
            for (const discoverySource of discoveryInputs) {
              try {
                const sourcePage = await fetchPage(discoverySource.entry_url, discoverySource, {
                  phase: "discovery",
                  kind: "listing",
                  cacheManager,
                  scheduler,
                  performance: report.performance
                });
                const discoveredCandidates = await discoverCandidatesForSource(
                  discoverySource,
                  sourcePage,
                  (url, nestedSource = {}) =>
                    fetchPage(
                      url,
                      {
                        ...discoverySource,
                        ...nestedSource,
                        source_name: nestedSource.source_name || discoverySource.source_name,
                        source_type: nestedSource.source_type || discoverySource.source_type
                      },
                      {
                        phase: "discovery",
                        kind: "listing",
                        cacheManager,
                        scheduler,
                        performance: report.performance
                        }
                      )
                );
                aggregatedCandidates.push(...discoveredCandidates);
                successfulDiscoveryInputs += 1;
              } catch (error) {
                if (isCooldownError(error)) {
                  sourceSummary.skipped_cooldown += 1;
                  continue;
                }

                sourceSummary.errors += 1;
                addSummaryCount(report, "errors");
                report.errors.push({
                  source_name: discoverySource.source_name,
                  message: error instanceof Error ? error.message : String(error)
                });
              }
            }

            if (!successfulDiscoveryInputs) {
              if (sourceSummary.skipped_cooldown >= discoveryInputs.length) {
                return {
                  source,
                  sourcePage: null,
                  discoveredCandidates: [],
                  skipped: true
                };
              }

              return {
                source,
                sourcePage: null,
                discoveredCandidates: [],
                error: new Error("all_discovery_inputs_failed")
              };
            }

            const mergedCandidates = dedupeDiscoveredCandidates(aggregatedCandidates);
            sourceSummary.discovered_candidates = aggregatedCandidates.length;
            sourceSummary.unique_candidates = new Set(
              mergedCandidates.map((candidate) => normalizeCandidateEventUrl(candidate))
            ).size;
            report.summary.discovered_candidates += aggregatedCandidates.length;

            return {
              source,
              sourcePage: null,
              discoveredCandidates: mergedCandidates
            };
          } catch (error) {
            if (isCooldownError(error)) {
              sourceSummary.skipped_cooldown += 1;
              return {
                source,
                sourcePage: null,
                discoveredCandidates: [],
                skipped: true
              };
            }

            sourceSummary.errors += 1;
            addSummaryCount(report, "errors");
            report.errors.push({
              source_name: source.source_name,
              message: error instanceof Error ? error.message : String(error)
            });

            return {
              source,
              sourcePage: null,
              discoveredCandidates: [],
              error
            };
          }
        })
      );
    });

    report.summary.sources_processed = discoveryResults.filter((result) => !result.error && !result.skipped).length;

    const selectedCandidates = await measurePhase(report.performance, "filter_ms", async () => {
      const globalCandidateUrls = new Set();
      const nextCandidates = [];

      for (const result of discoveryResults) {
        const sourceSummary = sourceSummaryMap.get(result.source.entry_url);

        for (const candidate of result.discoveredCandidates) {
          const eventUrl = normalizeCandidateEventUrl(candidate);

          if (!eventUrl) {
            continue;
          }

          if (globalCandidateUrls.has(eventUrl)) {
            addSummaryCount(report, "duplicates");
            report.skipped_duplicates.push({
              title: candidate.seed_data?.title || eventUrl,
              reason: "same_run_candidate_url",
              matched_path: "",
              source_url: eventUrl
            });
            continue;
          }

          globalCandidateUrls.add(eventUrl);
          report.summary.unique_candidates += 1;

          const blacklisted = findBlacklistedEventIndexed(blacklistIndex, blacklist, candidate);

          if (blacklisted) {
            sourceSummary.skipped_blacklisted += 1;
            addSummaryCount(report, "blacklisted");
            if (blacklisted.origin === "review_feedback") {
              addSummaryCount(report, "rejected_by_feedback");
            }
            report.skipped_blacklist.push({
              title: candidate.seed_data?.title || eventUrl,
              source_name: result.source.source_name,
              source_url: eventUrl,
              reason: blacklisted.reason,
              origin: blacklisted.origin || "policy",
              feedback_url: blacklisted.feedback_url || "",
              rejection_reason: blacklisted.details || "",
              first_seen_on: blacklisted.first_seen_on,
              last_seen_on: blacklisted.last_seen_on
            });
            continue;
          }

          const seededPastDisposition = createPastDisposition(candidate.seed_data || {}, todayKey);

          if (seededPastDisposition) {
            addSummaryCount(report, seededPastDisposition.reason);
            report.skipped_policy.push({
              title: candidate.seed_data?.title || eventUrl,
              source_name: result.source.source_name,
              source_url: eventUrl,
              reason: seededPastDisposition.reason
            });

            const update = upsertBlacklistEntry(
              blacklist,
              {
                title: candidate.seed_data?.title || "",
                source_name: result.source.source_name,
                source_url: eventUrl,
                start_date: toDateOnly(candidate.seed_data?.start_date || ""),
                end_date: toDateOnly(candidate.seed_data?.end_date || "")
              },
              { todayKey, reason: seededPastDisposition.reason, details: "seed_data" }
            );
            blacklist = update.blacklist;
            blacklistChanged ||= update.changed;
            if (update.entry) {
              updateBlacklistIndex(blacklistIndex, update.entry);
            }
            continue;
          }

          if (nextCandidates.length >= resolvedOptions.maxUniqueUrls) {
            sourceSummary.skipped_due_to_global_limit += 1;
            continue;
          }

          sourceSummary.processed_candidates += 1;
          nextCandidates.push({
            source: result.source,
            sourcePage: result.sourcePage,
            candidate: {
              ...candidate,
              event_url: eventUrl
            }
          });
        }
      }

      return nextCandidates;
    });

    const detailResults = await measurePhase(report.performance, "detail_ms", async () => {
      return Promise.all(
        selectedCandidates.map(async (entry) => {
          const sourceSummary = sourceSummaryMap.get(entry.source.entry_url);

          try {
            const sourcePageUrl = normalizeUrl(entry.sourcePage?.final_url || "");
            const eventPage =
              entry.sourcePage && entry.candidate.event_url === sourcePageUrl
                ? entry.sourcePage
                : await fetchPage(entry.candidate.event_url, entry.source, {
                  phase: "detail",
                  kind: "detail",
                  cacheManager,
                  scheduler,
                  performance: report.performance
                });
            const deterministic = extractDeterministicEventData(eventPage, entry.candidate);
            const deterministicPastDisposition = createPastDisposition(deterministic, todayKey);

            if (deterministicPastDisposition) {
              addSummaryCount(report, deterministicPastDisposition.reason);
              report.skipped_policy.push({
                title: deterministic.title || entry.candidate.seed_data?.title || entry.candidate.event_url,
                source_name: entry.source.source_name,
                source_url: deterministic.source_url || entry.candidate.event_url,
                reason: deterministicPastDisposition.reason
              });

              const update = upsertBlacklistEntry(blacklist, deterministic, {
                todayKey,
                reason: deterministicPastDisposition.reason
              });
              blacklist = update.blacklist;
              blacklistChanged ||= update.changed;
              if (update.entry) {
                updateBlacklistIndex(blacklistIndex, update.entry);
              }
              return null;
            }

            const deterministicTechAssessment = evaluateTechRelevanceDeterministic(deterministic, entry.source);

            if (deterministicTechAssessment.should_skip_before_gemini) {
              addSummaryCount(report, "non_tech");
              report.skipped_policy.push({
                title: deterministic.title || entry.candidate.seed_data?.title || entry.candidate.event_url,
                source_name: entry.source.source_name,
                source_url: deterministic.source_url || entry.candidate.event_url,
                reason: "non_tech",
                rejection_reason: deterministicTechAssessment.rejection_reason,
                tech_evidence: deterministicTechAssessment.tech_evidence
              });

              const update = upsertBlacklistEntry(
                blacklist,
                {
                  ...deterministic,
                  source_name: entry.source.source_name
                },
                {
                  todayKey,
                  reason: "non_tech",
                  details: deterministicTechAssessment.rejection_reason,
                  origin: "policy"
                }
              );
              blacklist = update.blacklist;
              blacklistChanged ||= update.changed;
              if (update.entry) {
                updateBlacklistIndex(blacklistIndex, update.entry);
              }
              return null;
            }

            report.summary.processed_candidates += 1;
            return {
              ...entry,
              eventPage,
              deterministic,
              deterministicTechAssessment
            };
          } catch (error) {
            if (isCooldownError(error)) {
              sourceSummary.skipped_cooldown += 1;
              return null;
            }

            sourceSummary.errors += 1;
            addSummaryCount(report, "errors");
            report.errors.push({
              source_name: entry.source.source_name,
              event_url: entry.candidate.event_url,
              message: error instanceof Error ? error.message : String(error)
            });
            return null;
          }
        })
      );
    });

    const normalizedResults = await measurePhase(report.performance, "normalize_ms", async () => {
      return Promise.all(
        detailResults
          .filter(Boolean)
          .map((detail) =>
            scheduler.schedule({ bucket: "gemini", host: "" }, async () => {
              if (process.env.GEMINI_API_KEY) {
                report.performance.gemini_requests += 1;
              }

              const aiNormalized = await normalizeWithGemini({
                apiKey: process.env.GEMINI_API_KEY,
                model: GEMINI_MODEL,
                source: detail.source,
                deterministic: detail.deterministic,
                techAssessment: detail.deterministicTechAssessment,
                categorySlugs
              });
              const normalized = ensureEventDefaults(
                {
                  ...detail.deterministic,
                  ...detail.deterministicTechAssessment,
                  ...aiNormalized,
                  tech_relevance:
                    aiNormalized.tech_relevance || detail.deterministicTechAssessment.tech_relevance,
                  tech_audience:
                    aiNormalized.tech_audience || detail.deterministicTechAssessment.tech_audience,
                  tech_topics:
                    (aiNormalized.tech_topics || []).length
                      ? aiNormalized.tech_topics
                      : detail.deterministicTechAssessment.tech_topics,
                  tech_evidence:
                    (aiNormalized.tech_evidence || []).length
                      ? aiNormalized.tech_evidence
                      : detail.deterministicTechAssessment.tech_evidence,
                  rejection_reason:
                    aiNormalized.rejection_reason || detail.deterministicTechAssessment.rejection_reason,
                  source_url: normalizeUrl(aiNormalized.source_url || detail.deterministic.source_url),
                  ticket_url: normalizeUrl(aiNormalized.ticket_url || detail.deterministic.ticket_url),
                  source_name: detail.source.source_name
                },
                categorySlugs
              );

              return {
                ...detail,
                normalized
              };
            })
          )
      );
    });

    await measurePhase(report.performance, "persist_ms", async () => {
      for (const item of normalizedResults.filter(Boolean)) {
        const normalized = item.normalized;
        const locationConfirmed = hasConfirmedNortheastLocationEvidence(item.deterministic, normalized);
        const listingPageCandidate = looksLikeEventListingCandidate(normalized, item.deterministic);
        const dedupeKey = normalized.source_url || normalized.ticket_url;

        if (!locationConfirmed) {
          addSummaryCount(report, "non_northeast");
          report.skipped_policy.push({
            title: normalized.title,
            source_name: item.source.source_name,
            source_url: normalized.source_url,
            reason: "non_northeast",
            rejection_reason: "location_not_confirmed_in_event_page",
            tech_evidence: normalized.tech_evidence
          });

          const update = upsertBlacklistEntry(blacklist, normalized, {
            todayKey,
            reason: "non_northeast",
            details: "location_not_confirmed_in_event_page",
            origin: "policy"
          });
          blacklist = update.blacklist;
          blacklistChanged ||= update.changed;
          if (update.entry) {
            updateBlacklistIndex(blacklistIndex, update.entry);
          }
          continue;
        }

        if (listingPageCandidate) {
          addSummaryCount(report, "not_event_page");
          report.skipped_policy.push({
            title: normalized.title,
            source_name: item.source.source_name,
            source_url: normalized.source_url,
            reason: "not_event_page",
            rejection_reason: "listing_or_directory_page",
            tech_evidence: normalized.tech_evidence
          });

          const update = upsertBlacklistEntry(blacklist, normalized, {
            todayKey,
            reason: "not_event_page",
            details: "listing_or_directory_page",
            origin: "policy"
          });
          blacklist = update.blacklist;
          blacklistChanged ||= update.changed;
          if (update.entry) {
            updateBlacklistIndex(blacklistIndex, update.entry);
          }
          continue;
        }

        if (dedupeKey && seenNormalizedUrls.has(dedupeKey)) {
          addSummaryCount(report, "duplicates");
          report.skipped_duplicates.push({
            title: normalized.title,
            reason: "same_run_source_url",
            matched_path: "",
            source_url: dedupeKey
          });
          continue;
        }

        const existing = findExistingEventIndexed(existingEventIndex, normalized);

        if (existing) {
          addSummaryCount(report, "duplicates");
          report.skipped_duplicates.push({
            title: normalized.title,
            reason: existing.reason,
            matched_path: existing.match.path,
            source_url: normalized.source_url
          });
          continue;
        }

        if (dedupeKey) {
          seenNormalizedUrls.add(dedupeKey);
        }

        const scoreResult = scoreNormalizedEvent(normalized);
        const disposition = classifyIntakeCandidate(normalized, scoreResult, { todayKey });

        if (disposition.action === "skip") {
          addSummaryCount(report, disposition.reason);
          report.skipped_policy.push({
            title: normalized.title,
            source_name: item.source.source_name,
            source_url: normalized.source_url,
            reason: disposition.reason,
            rejection_reason: normalized.rejection_reason,
            tech_evidence: normalized.tech_evidence
          });

          if (isBlacklistableReason(disposition.reason)) {
            const update = upsertBlacklistEntry(blacklist, normalized, {
              todayKey,
              reason: disposition.reason,
              details: normalized.rejection_reason,
              origin: "policy"
            });
            blacklist = update.blacklist;
            blacklistChanged ||= update.changed;
            if (update.entry) {
              updateBlacklistIndex(blacklistIndex, update.entry);
            }
          }

          continue;
        }

        if (disposition.action === "issue") {
          addSummaryCount(report, "issues");
          addSummaryCount(report, "low_confidence");
          addSummaryCount(report, "tech_low_confidence");
          const issuePayload = annotateLowConfidence(normalized, scoreResult);
          report.skipped_low_confidence.push(issuePayload);

          if (resolvedOptions.apply) {
            const issueMarker = `<!-- event-intake-source:${hashString(
              normalized.source_url || normalized.ticket_url
            )} -->`;
            const issueResult = await upsertIssue({
              token: process.env.TOKEN_FOR_CI_EVENTS,
              repo: process.env.GITHUB_REPOSITORY,
              apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
              label: "event-intake",
              title: buildIssueTitle(normalized),
              body: buildIssueBody(normalized, scoreResult),
              assignee: "gabrielldn",
              marker: issueMarker
            });

            report.created_issues.push({
              title: normalized.title,
              issue_number: issueResult.issue_number,
              action: issueResult.action,
              source_url: normalized.source_url
            });
          } else {
            report.created_issues.push({
              title: normalized.title,
              source_url: normalized.source_url,
              dry_run: true
            });
          }

          addExistingEventToIndex(existingEventIndex, normalized, "");
          continue;
        }

        const markdown = buildEventMarkdown(normalized);
        const filePath = buildEventFilePath(normalized);

        addSummaryCount(report, "prs");

        if (!resolvedOptions.apply) {
          report.created_prs.push({
            title: normalized.title,
            branch: buildBranchName(normalized),
            file_path: filePath,
            dry_run: true
          });
          addExistingEventToIndex(existingEventIndex, normalized, filePath);
          continue;
        }

        const prResult = await createOrUpdateEventPr({
          token: process.env.TOKEN_FOR_CI_EVENTS,
          repo: process.env.GITHUB_REPOSITORY,
          apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
          filePath,
          content: markdown,
          candidate: normalized,
          prTitle: buildPrTitle(normalized),
          prBody: buildPrBody(normalized, scoreResult),
          reviewer: "gabrielldn"
        });

        await closeIssueByMarker({
          token: process.env.TOKEN_FOR_CI_EVENTS,
          repo: process.env.GITHUB_REPOSITORY,
          apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
          label: "event-intake",
          marker: `<!-- event-intake-source:${hashString(
            normalized.source_url || normalized.ticket_url
          )} -->`
        });

        if (prResult.action === "updated") {
          report.updated_prs.push({
            title: normalized.title,
            pr_number: prResult.pr_number,
            branch: prResult.branch
          });
        } else {
          report.created_prs.push({
            title: normalized.title,
            pr_number: prResult.pr_number,
            branch: prResult.branch
          });
        }

        addExistingEventToIndex(existingEventIndex, normalized, filePath);
      }
    });
  } finally {
    await cacheManager.persistHealth();
    report.performance.host_failures = cacheManager.getSourceHealthSnapshot().hosts || {};
    await closeBrowser();
  }

  report.sources_processed = sortSourceSummaries(sources, sourceSummaryMap);

  if (resolvedOptions.persistBlacklist && blacklistChanged) {
    report.blacklist_path = await saveEventBlacklist(blacklist);
    report.blacklist_changed = true;

    if (resolvedOptions.apply && process.env.TOKEN_FOR_CI_EVENTS && process.env.GITHUB_REPOSITORY) {
      const blacklistContent = await fs.readFile(report.blacklist_path, "utf8");
      report.blacklist_sync = await syncRepoFileToDefaultBranch({
        token: process.env.TOKEN_FOR_CI_EVENTS,
        repo: process.env.GITHUB_REPOSITORY,
        apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
        filePath: EVENT_BLACKLIST_PATH,
        content: blacklistContent,
        commitMessage: "chore(event-intake): refresh blacklist"
      });
    }
  } else {
    report.blacklist_path = path.join(process.cwd(), EVENT_BLACKLIST_PATH);
    report.blacklist_changed = false;
  }

  report.performance.duration_ms = Date.now() - startedAt;
  await writeReportArtifacts(report);
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.apply && !process.env.TOKEN_FOR_CI_EVENTS) {
    throw new Error("TOKEN_FOR_CI_EVENTS precisa estar definido para executar em modo apply.");
  }

  const report = await runEventIntake(options);
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length) {
    console.warn(
      `Event intake finalizou com ${report.errors.length} erro(s) recuperavel(is). Consulte output/event-intake/latest.json para detalhes.`
    );
  }
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
