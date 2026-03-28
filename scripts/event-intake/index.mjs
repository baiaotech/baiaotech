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
import { discoverCandidatesForSource } from "./discovery.mjs";
import { extractDeterministicEventData } from "./extract.mjs";
import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildIssueTitle,
  buildPrBody,
  buildPrTitle,
  classifyIntakeCandidate,
  ensureEventDefaults,
  findExistingEvent,
  hashString,
  loadCategories,
  loadEventSources,
  loadExistingEvents,
  normalizedEventSchema,
  normalizeUrl,
  scoreNormalizedEvent,
  slugify,
  toDateOnly
} from "./shared.mjs";
import {
  closeIssueByMarker,
  createOrUpdateEventPr,
  syncRepoFileToDefaultBranch,
  upsertIssue
} from "./github.mjs";

const require = createRequire(import.meta.url);
const { EVENT_TIME_ZONE, getDateKeyInTimeZone } = require("../../lib/event-dates.js");

const DEFAULT_MAX_SOURCES = Number(process.env.EVENT_INTAKE_MAX_SOURCES || 200);
const DEFAULT_MAX_UNIQUE_URLS = Number(process.env.EVENT_INTAKE_MAX_UNIQUE_URLS || 150);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

let browserPromise = null;

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce(
    (options, argument) => {
      if (argument === "--apply") {
        options.apply = true;
      } else if (argument === "--dry-run") {
        options.apply = false;
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
      persistBlacklist: false
    }
  );
}

async function fetchWithHttp(url) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; BaiaoTech Event Intake Bot/2.0)"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao buscar ${url}`);
  }

  return {
    final_url: response.url,
    html: await response.text()
  };
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

async function fetchWithBrowser(url) {
  const browser = await getBrowser();
  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent: "Mozilla/5.0 (compatible; BaiaoTech Event Intake Bot/2.0)"
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
    const html = await page.content();

    return {
      final_url: page.url(),
      html
    };
  } finally {
    await page.close();
  }
}

async function fetchPage(url, source) {
  if ((source?.fetch_mode || "http") === "browser") {
    return fetchWithBrowser(url);
  }

  try {
    return await fetchWithHttp(url);
  } catch (error) {
    if (["sympla-search", "eventbrite-search", "doity-search", "even3-search"].includes(source?.source_type || "")) {
      return fetchWithBrowser(url);
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
      "ambiguities"
    ]
  };
}

function buildGeminiPrompt({ source, deterministic, categorySlugs }) {
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
    "- se categoria, local ou formato estiverem duvidosos, anote em ambiguities.",
    "- se o evento parecer online ou fora do Nordeste, registre isso em ambiguities."
  ].join("\n");
}

async function normalizeWithGemini({ apiKey, model, source, deterministic, categorySlugs }) {
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
            parts: [{ text: buildGeminiPrompt({ source, deterministic, categorySlugs }) }]
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
    past: 0,
    non_northeast: 0,
    online_only: 0,
    non_tech: 0,
    low_confidence: 0,
    errors: 0
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
      max_unique_urls: options.maxUniqueUrls
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

async function writeReportArtifacts(report) {
  const outputDir = await ensureOutputDir();
  const jsonPath = path.join(outputDir, "latest.json");
  const markdownPath = path.join(outputDir, "summary.md");
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
    "",
    "## Contagens",
    "",
    ...Object.entries(report.summary.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Fontes",
    "",
    ...report.sources_processed.map((source) => {
      return `- ${source.source_name} [${source.source_type}]: descobertos ${source.discovered_candidates}, unicos ${source.unique_candidates}, processados ${source.processed_candidates}`;
    })
  ].join("\n");

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, `${markdown}\n`, "utf8");

  report.report_path = jsonPath;
  report.summary_path = markdownPath;
  return report;
}

function annotateLowConfidence(normalized, scoreResult) {
  return {
    title: normalized.title,
    source_url: normalized.source_url,
    reasons: [
      ...(scoreResult.missingRequired ? ["missing_required_fields"] : []),
      ...(scoreResult.missingCategory ? ["missing_category"] : []),
      ...(scoreResult.missingLocation ? ["missing_location"] : []),
      ...scoreResult.blockingAmbiguities
    ]
  };
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

export async function runEventIntake(options = {}) {
  const resolvedOptions = {
    apply: Boolean(options.apply),
    sourceName: options.sourceName || "",
    sourceType: options.sourceType || "",
    maxSources: Number(options.maxSources || DEFAULT_MAX_SOURCES) || DEFAULT_MAX_SOURCES,
    maxUniqueUrls: Number(options.maxUniqueUrls || DEFAULT_MAX_UNIQUE_URLS) || DEFAULT_MAX_UNIQUE_URLS,
    persistBlacklist: Boolean(options.persistBlacklist || options.apply)
  };
  const categories = await loadCategories();
  const categorySlugs = categories.map((item) => item.slug);
  const allSources = await loadEventSources();
  const sources = allSources
    .filter((source) => source.enabled)
    .filter((source) => !resolvedOptions.sourceName || source.source_name === resolvedOptions.sourceName)
    .filter((source) => !resolvedOptions.sourceType || source.source_type === resolvedOptions.sourceType)
    .slice(0, resolvedOptions.maxSources);
  const existingEvents = await loadExistingEvents();
  let blacklist = await loadEventBlacklist();
  const todayKey = getDateKeyInTimeZone(new Date(), EVENT_TIME_ZONE);
  const report = createReport(resolvedOptions, sources, todayKey);
  const seenCandidateUrls = new Set();
  const seenNormalizedUrls = new Set();
  let blacklistChanged = false;

  try {
    for (const source of sources) {
      if (report.summary.processed_candidates >= resolvedOptions.maxUniqueUrls) {
        break;
      }

      try {
        const sourcePage = await fetchPage(source.entry_url, source);
        const discoveredCandidates = await discoverCandidatesForSource(source, sourcePage, fetchPage);
        report.summary.sources_processed += 1;
        report.summary.discovered_candidates += discoveredCandidates.length;

        const uniqueCandidates = discoveredCandidates.filter((candidate) => {
          if (!candidate.event_url || seenCandidateUrls.has(candidate.event_url)) {
            return false;
          }

          seenCandidateUrls.add(candidate.event_url);
          return true;
        });

        const eligibleCandidates = [];

        for (const candidate of uniqueCandidates) {
          const blacklisted = findBlacklistedEvent(blacklist, candidate);

          if (blacklisted) {
            addSummaryCount(report, "blacklisted");
            report.skipped_blacklist.push({
              title: candidate.seed_data?.title || candidate.event_url,
              source_name: source.source_name,
              source_url: candidate.event_url,
              reason: blacklisted.reason,
              first_seen_on: blacklisted.first_seen_on,
              last_seen_on: blacklisted.last_seen_on
            });
            continue;
          }

          eligibleCandidates.push(candidate);
        }

        const availableSlots = Math.max(0, resolvedOptions.maxUniqueUrls - report.summary.processed_candidates);
        const selectedCandidates = eligibleCandidates.slice(0, availableSlots);
        report.summary.unique_candidates += uniqueCandidates.length;
        report.sources_processed.push({
          source_name: source.source_name,
          source_type: source.source_type,
          discovered_candidates: discoveredCandidates.length,
          unique_candidates: uniqueCandidates.length,
          processed_candidates: selectedCandidates.length,
          skipped_blacklisted: uniqueCandidates.length - eligibleCandidates.length,
          skipped_due_to_global_limit: Math.max(0, eligibleCandidates.length - selectedCandidates.length)
        });

        for (const candidate of selectedCandidates) {
          try {
            const seededPastDisposition = createPastDisposition(candidate.seed_data || {}, todayKey);

            if (seededPastDisposition) {
              addSummaryCount(report, seededPastDisposition.reason);
              report.skipped_policy.push({
                title: candidate.seed_data?.title || candidate.event_url,
                source_name: source.source_name,
                source_url: candidate.event_url,
                reason: seededPastDisposition.reason
              });

              const update = upsertBlacklistEntry(
                blacklist,
                {
                  title: candidate.seed_data?.title || "",
                  source_name: source.source_name,
                  source_url: candidate.event_url,
                  start_date: toDateOnly(candidate.seed_data?.start_date || ""),
                  end_date: toDateOnly(candidate.seed_data?.end_date || "")
                },
                { todayKey, reason: seededPastDisposition.reason, details: "seed_data" }
              );
              blacklist = update.blacklist;
              blacklistChanged ||= update.changed;
              continue;
            }

            report.summary.processed_candidates += 1;
            const eventPage =
              candidate.event_url === normalizeUrl(sourcePage.final_url)
                ? sourcePage
                : await fetchPage(candidate.event_url, source);
            const deterministic = extractDeterministicEventData(eventPage, candidate);
            const aiNormalized = await normalizeWithGemini({
              apiKey: process.env.GEMINI_API_KEY,
              model: GEMINI_MODEL,
              source,
              deterministic,
              categorySlugs
            });
            const normalized = ensureEventDefaults(
              {
                ...deterministic,
                ...aiNormalized,
                source_url: normalizeUrl(aiNormalized.source_url || deterministic.source_url),
                ticket_url: normalizeUrl(aiNormalized.ticket_url || deterministic.ticket_url),
                source_name: source.source_name
              },
              categorySlugs
            );
            const dedupeKey = normalized.source_url || normalized.ticket_url;

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

            const existing = findExistingEvent(existingEvents, normalized);

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
                source_name: source.source_name,
                source_url: normalized.source_url,
                reason: disposition.reason
              });

              if (isBlacklistableReason(disposition.reason)) {
                const update = upsertBlacklistEntry(blacklist, normalized, {
                  todayKey,
                  reason: disposition.reason
                });
                blacklist = update.blacklist;
                blacklistChanged ||= update.changed;
              }

              continue;
            }

            if (disposition.action === "issue") {
              addSummaryCount(report, "issues");
              addSummaryCount(report, "low_confidence");
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
          } catch (error) {
            addSummaryCount(report, "errors");
            report.errors.push({
              source_name: source.source_name,
              event_url: candidate.event_url,
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }
      } catch (error) {
        addSummaryCount(report, "errors");
        report.errors.push({
          source_name: source.source_name,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } finally {
    await closeBrowser();
  }

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
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
