import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { discoverCandidatesForSource } from "./discovery.mjs";
import { extractDeterministicEventData } from "./extract.mjs";
import {
  buildBranchName,
  buildEventMarkdown,
  buildIssueBody,
  buildIssueTitle,
  buildPrBody,
  buildPrTitle,
  ensureEventDefaults,
  findExistingEvent,
  hashString,
  loadCategories,
  loadEventSources,
  loadExistingEvents,
  normalizedEventSchema,
  normalizeUrl,
  scoreNormalizedEvent,
  slugify
} from "./shared.mjs";
import { closeIssueByMarker, createOrUpdateEventPr, upsertIssue } from "./github.mjs";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce(
    (options, argument) => {
      if (argument === "--apply") {
        options.apply = true;
      } else if (argument === "--dry-run") {
        options.apply = false;
      } else if (argument.startsWith("--source=")) {
        options.sourceName = argument.slice("--source=".length);
      } else if (argument.startsWith("--max-sources=")) {
        options.maxSources = Number(argument.slice("--max-sources=".length)) || options.maxSources;
      } else if (argument.startsWith("--max-candidates=")) {
        options.maxCandidates = Number(argument.slice("--max-candidates=".length)) || options.maxCandidates;
      }

      return options;
    },
    {
      apply: false,
      sourceName: "",
      maxSources: Number(process.env.EVENT_INTAKE_MAX_SOURCES || 10),
      maxCandidates: Number(process.env.EVENT_INTAKE_MAX_CANDIDATES_PER_SOURCE || 3)
    }
  );
}

async function fetchWithHttp(url) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; BaiãoTech Event Intake Bot/1.0)"
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

async function fetchWithBrowser(url) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      locale: "pt-BR",
      userAgent: "Mozilla/5.0 (compatible; BaiãoTech Event Intake Bot/1.0)"
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    const html = await page.content();

    return {
      final_url: page.url(),
      html
    };
  } finally {
    await browser.close();
  }
}

async function fetchPage(url, source) {
  if ((source?.fetch_mode || "http") === "browser") {
    return fetchWithBrowser(url);
  }

  return fetchWithHttp(url);
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
        state: source.state
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
    "- se categoria, local ou formato estiverem duvidosos, anote em ambiguities."
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

async function writeReport(report) {
  const outputDir = await ensureOutputDir();
  const outputPath = path.join(outputDir, "latest.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function runEventIntake(options = {}) {
  const categories = await loadCategories();
  const categorySlugs = categories.map((item) => item.slug);
  const sources = (await loadEventSources())
    .filter((source) => source.enabled)
    .filter((source) => !options.sourceName || source.source_name === options.sourceName)
    .slice(0, options.maxSources);
  const existingEvents = await loadExistingEvents();
  const report = {
    apply: Boolean(options.apply),
    model: GEMINI_MODEL,
    sources_processed: [],
    created_prs: [],
    updated_prs: [],
    created_issues: [],
    skipped_duplicates: [],
    skipped_low_confidence: [],
    errors: []
  };
  const processedSourceUrls = new Set();

  for (const source of sources) {
    try {
      const sourcePage = await fetchPage(source.entry_url, source);
      const candidates = await discoverCandidatesForSource(source, sourcePage, fetchPage);
      const limitedCandidates = candidates.slice(0, options.maxCandidates);

      report.sources_processed.push({
        source_name: source.source_name,
        discovered_candidates: candidates.length,
        processed_candidates: limitedCandidates.length
      });

      for (const candidate of limitedCandidates) {
        try {
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

          if (dedupeKey && processedSourceUrls.has(dedupeKey)) {
            report.skipped_duplicates.push({
              title: normalized.title,
              reason: "same_run_source_url",
              matched_path: "",
              source_url: dedupeKey
            });
            continue;
          }

          const existing = findExistingEvent(existingEvents, normalized);
          const scoreResult = scoreNormalizedEvent(normalized);

          if (existing) {
            report.skipped_duplicates.push({
              title: normalized.title,
              reason: existing.reason,
              matched_path: existing.match.path,
              source_url: normalized.source_url
            });
            continue;
          }

          if (dedupeKey) {
            processedSourceUrls.add(dedupeKey);
          }

          if (!scoreResult.isHighConfidence) {
            const issueMarker = `<!-- event-intake-source:${hashString(
              normalized.source_url || normalized.ticket_url
            )} -->`;

            if (options.apply) {
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
              report.skipped_low_confidence.push({
                title: normalized.title,
                source_url: normalized.source_url,
                reasons: [
                  ...(scoreResult.missingRequired ? ["missing_required_fields"] : []),
                  ...(scoreResult.missingCategory ? ["missing_category"] : []),
                  ...(scoreResult.missingLocation ? ["missing_location"] : []),
                  ...scoreResult.blockingAmbiguities
                ]
              });
            }

            continue;
          }

          const markdown = buildEventMarkdown(normalized);
          const filePath = buildEventFilePath(normalized);

          if (!options.apply) {
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
          report.errors.push({
            source_name: source.source_name,
            event_url: candidate.event_url,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } catch (error) {
      report.errors.push({
        source_name: source.source_name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  report.report_path = await writeReport(report);
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
