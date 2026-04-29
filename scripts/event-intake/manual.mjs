import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import matter from "gray-matter";

import { createOrUpdateEventPr } from "./github.mjs";
import {
  buildBranchName,
  buildEventMarkdown,
  ensureEventDefaults,
  findExistingEvent,
  inferCategoriesFromText,
  inferEventKind,
  isNortheastState,
  loadCategories,
  loadExistingEvents,
  normalizeStateCode,
  normalizeText,
  normalizeUrl,
  scoreNormalizedEvent,
  slugify,
  unique
} from "./shared.mjs";

const DEFAULT_TODAY_KEY = "2026-04-29";
const OUTPUT_DIR = path.join("output", "event-intake");

const KIND_MAP = new Map([
  ["forum", "summit"],
  ["summit", "summit"],
  ["expo", "conference"],
  ["festival", "conference"],
  ["congress", "conference"],
  ["congresso", "conference"],
  ["symposium", "conference"],
  ["simposio", "conference"],
  ["week", "conference"],
  ["course", "workshop"],
  ["curso", "workshop"],
  ["training", "workshop"],
  ["treinamento", "workshop"],
  ["codelab", "workshop"],
  ["seminar", "workshop"],
  ["seminario", "workshop"],
  ["ideathon", "hackathon"],
  ["networking", "meetup"],
  ["showcase", "other"]
]);

const CATEGORY_MAP = new Map([
  ["ai", ["ia"]],
  ["artificial-intelligence", ["ia"]],
  ["ia-generativa", ["ia"]],
  ["inteligencia-artificial", ["ia"]],
  ["machine-learning", ["ia", "data-science"]],
  ["google", ["cloud"]],
  ["developers", ["backend"]],
  ["developer", ["backend"]],
  ["dev", ["backend"]],
  ["programacao", ["backend"]],
  ["software-engineering", ["backend"]],
  ["engenharia-software", ["backend"]],
  ["swift", ["mobile"]],
  ["apple", ["mobile"]],
  ["android", ["mobile"]],
  ["mobile", ["mobile"]],
  ["security", ["seguranca"]],
  ["ciberseguranca", ["seguranca"]],
  ["cybersecurity", ["seguranca"]],
  ["hacking", ["seguranca"]],
  ["informacao", ["seguranca"]],
  ["infosec", ["seguranca"]],
  ["agile", ["agilidade"]],
  ["agil", ["agilidade"]],
  ["aws", ["cloud"]],
  ["serverless", ["cloud"]],
  ["cloud-computing", ["cloud"]],
  ["infraestrutura", ["cloud"]],
  ["telecom", ["cloud"]],
  ["isp", ["cloud"]],
  ["iot", ["cloud"]],
  ["hardware", ["cloud"]],
  ["data-analytics", ["data-science"]],
  ["bi", ["data-science"]],
  ["business-intelligence", ["data-science"]],
  ["hpc", ["big-data"]],
  ["computacao", ["backend"]],
  ["ti", ["backend"]],
  ["rpa", ["ia"]],
  ["automacao", ["ia"]],
  ["robotica", ["ia"]],
  ["tecnologia", ["outros"]],
  ["womenintech", ["outros"]],
  ["diversidade", ["outros"]],
  ["web3", ["blockchain"]],
  ["indie", ["games"]],
  ["startups", ["inovacao"]],
  ["startup", ["inovacao"]],
  ["inovacao-aberta", ["inovacao"]],
  ["deep-tech", ["inovacao"]],
  ["patentes", ["inovacao"]],
  ["propriedade-intelectual", ["inovacao"]],
  ["gestao-publica", ["inovacao"]],
  ["govtech", ["inovacao"]],
  ["smart-cities", ["inovacao"]],
  ["industria-4-0", ["inovacao"]],
  ["e-commerce", ["outros"]],
  ["varejo", ["outros"]]
]);

const VALID_KINDS = new Set(["conference", "meetup", "hackathon", "workshop", "summit", "other"]);

function normalizeToken(value) {
  return normalizeText(value).replace(/[_\s]+/g, "-").replace(/-+/g, "-");
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function compact(value) {
  return String(value || "").trim();
}

function isPlaceholderUrl(value) {
  const text = compact(value);
  return !text || text === "https://..." || text.includes("...");
}

function urlHostName(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseManualEventsMarkdown(source) {
  const parts = String(source || "").split(/^---\s*$/m);
  const events = [];

  for (let index = 1; index < parts.length; index += 2) {
    const yaml = parts[index] || "";
    const body = parts[index + 1] || "";

    try {
      const document = matter(`---\n${yaml.trim()}\n---\n${body}`);
      if (!document.data?.title) {
        continue;
      }

      events.push({
        index: events.length + 1,
        ...document.data,
        description: compact(document.data.description || document.content)
      });
    } catch {
      events.push({
        index: events.length + 1,
        title: "",
        description: "",
        manual_rejection_reason: "invalid_front_matter"
      });
    }
  }

  return events;
}

export function parseManualEventsJson(source) {
  const parsed = JSON.parse(String(source || "[]"));
  const events = Array.isArray(parsed) ? parsed : parsed.events;

  if (!Array.isArray(events)) {
    throw new Error("manual_events_json deve ser um array ou um objeto com a propriedade events.");
  }

  return events.map((event, index) => ({
    index: index + 1,
    ...event
  }));
}

export function normalizeManualKind(kind, title = "", description = "") {
  const token = normalizeToken(kind);

  if (VALID_KINDS.has(token)) {
    return token;
  }

  return KIND_MAP.get(token) || inferEventKind(title, description);
}

export function normalizeManualCategories(categories, text, categorySlugs) {
  const allowed = new Set(categorySlugs);
  const mapped = [];

  for (const category of toStringArray(categories)) {
    const token = normalizeToken(category);

    if (allowed.has(token)) {
      mapped.push(token);
      continue;
    }

    for (const slug of CATEGORY_MAP.get(token) || []) {
      if (allowed.has(slug)) {
        mapped.push(slug);
      }
    }
  }

  if (!mapped.length) {
    mapped.push(...inferCategoriesFromText(text, categorySlugs));
  }

  return unique(mapped);
}

export function normalizeManualEvent(rawEvent, options = {}) {
  const categorySlugs = options.categorySlugs || [];
  const description = compact(rawEvent.description || rawEvent.body || rawEvent.content);
  const sourceUrl = normalizeUrl(rawEvent.source_url || rawEvent.ticket_url || "");
  const ticketUrl = normalizeUrl(rawEvent.ticket_url || rawEvent.source_url || "");
  const title = compact(rawEvent.title);
  const state = normalizeStateCode(rawEvent.state || "");
  const categories = normalizeManualCategories(
    rawEvent.categories,
    `${title}\n${description}`,
    categorySlugs
  );

  const candidate = ensureEventDefaults({
    title,
    start_date: compact(rawEvent.start_date),
    end_date: compact(rawEvent.end_date || rawEvent.start_date),
    kind: normalizeManualKind(rawEvent.kind, title, description),
    format: compact(rawEvent.format || "in-person"),
    city: compact(rawEvent.city),
    state,
    organizer: compact(rawEvent.organizer),
    venue: compact(rawEvent.venue),
    ticket_url: ticketUrl,
    source_name: compact(rawEvent.source_name || urlHostName(sourceUrl || ticketUrl)),
    source_url: sourceUrl || ticketUrl,
    categories,
    featured: false,
    cover_image: normalizeUrl(rawEvent.cover_image || ""),
    price: compact(rawEvent.price),
    description,
    summary: compact(rawEvent.summary || description),
    tech_relevance: compact(rawEvent.tech_relevance || "direct"),
    tech_audience: compact(rawEvent.tech_audience || "tech"),
    tech_topics: toStringArray(rawEvent.tech_topics).length ? toStringArray(rawEvent.tech_topics) : categories,
    tech_evidence: toStringArray(rawEvent.tech_evidence),
    rejection_reason: compact(rawEvent.rejection_reason),
    ambiguities: toStringArray(rawEvent.ambiguities),
    legacy_id: rawEvent.legacy_id,
    priority: rawEvent.priority
  }, categorySlugs);

  return {
    ...candidate,
    target_path: compact(rawEvent.target_path),
    change_type: compact(rawEvent.change_type || (rawEvent.target_path ? "update" : "add"))
  };
}

export function validateManualEvent(candidate, rawEvent = {}, options = {}) {
  const todayKey = options.todayKey || DEFAULT_TODAY_KEY;
  const issues = [];
  const sourceInput = rawEvent.source_url || rawEvent.ticket_url || candidate.source_url || candidate.ticket_url;
  const endDate = candidate.end_date || candidate.start_date;

  for (const [field, value] of [
    ["title", candidate.title],
    ["start_date", candidate.start_date],
    ["end_date", candidate.end_date],
    ["organizer", candidate.organizer],
    ["venue", candidate.venue],
    ["description", candidate.description]
  ]) {
    if (!compact(value)) {
      issues.push(`missing_${field}`);
    }
  }

  if (isPlaceholderUrl(sourceInput)) {
    issues.push("placeholder_url");
  } else if (!candidate.source_url && !candidate.ticket_url) {
    issues.push("invalid_url");
  }

  if (!candidate.categories.length) {
    issues.push("missing_categories");
  }

  if (endDate && todayKey && endDate < todayKey) {
    issues.push("past_event");
  }

  if (candidate.format === "online") {
    issues.push("online_only");
  }

  if (!candidate.state || !isNortheastState(candidate.state)) {
    issues.push("non_northeast_or_missing_state");
  }

  if (candidate.tech_relevance !== "direct" || candidate.tech_audience !== "tech") {
    issues.push("not_direct_tech");
  }

  return issues;
}

function eventFilePath(candidate) {
  return `src/content/events/${slugify(candidate.title)}.md`;
}

function findExistingBySlug(existingEvents, candidate) {
  const expectedPath = eventFilePath(candidate);
  return existingEvents.find((event) => event.path === expectedPath) || null;
}

function buildManualPrBody(candidate, scoreResult, operation) {
  const categoryList = candidate.categories.length
    ? candidate.categories.map((item) => `\`${item}\``).join(", ")
    : "_nenhuma_";

  return [
    "## Event intake manual",
    "",
    `- Acao: ${operation.change_type === "update" ? "corrigir evento existente" : "adicionar evento"}`,
    `- Fonte: [${candidate.source_name || candidate.source_url}](${candidate.source_url})`,
    `- Ticket URL: ${candidate.ticket_url ? `[${candidate.ticket_url}](${candidate.ticket_url})` : "_nao informado_"}`,
    `- Confianca: ${scoreResult.score}/100`,
    `- Categorias: ${categoryList}`,
    `- Arquivo: \`${operation.file_path}\``,
    "",
    "## Validacao",
    "",
    "- Fonte publica informada no payload manual",
    "- Evento marcado como tech direto",
    "- Schema normalizado para o modelo editorial atual",
    "",
    `<!-- event-intake-source:${candidate.source_url || candidate.ticket_url} -->`
  ].join("\n");
}

export async function buildManualEventOperations(rawEvents, options = {}) {
  const categories = options.categories || await loadCategories();
  const categorySlugs = categories.map((item) => item.slug);
  const existingEvents = options.existingEvents || await loadExistingEvents();
  const todayKey = options.todayKey || DEFAULT_TODAY_KEY;
  const accepted = [];
  const rejected = [];

  for (const rawEvent of rawEvents) {
    let candidate;

    try {
      candidate = normalizeManualEvent(rawEvent, { categorySlugs });
    } catch (error) {
      rejected.push({
        index: rawEvent.index,
        title: rawEvent.title || "",
        reason: "normalization_failed",
        details: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    const validationIssues = validateManualEvent(candidate, rawEvent, { todayKey });
    const scoreResult = scoreNormalizedEvent(candidate);

    if (validationIssues.length || !scoreResult.isHighConfidence) {
      rejected.push({
        index: rawEvent.index,
        title: candidate.title,
        reason: validationIssues[0] || "low_confidence",
        details: validationIssues,
        source_url: candidate.source_url || candidate.ticket_url
      });
      continue;
    }

    const targetPath = candidate.target_path || "";

    if (targetPath) {
      const targetExists = existingEvents.some((event) => event.path === targetPath);
      if (!targetExists) {
        rejected.push({
          index: rawEvent.index,
          title: candidate.title,
          reason: "target_path_not_found",
          details: [targetPath],
          source_url: candidate.source_url || candidate.ticket_url
        });
        continue;
      }
    } else {
      const existing = findExistingEvent(existingEvents, candidate) || findExistingBySlug(existingEvents, candidate);
      if (existing) {
        rejected.push({
          index: rawEvent.index,
          title: candidate.title,
          reason: "duplicate_existing_event",
          matched_path: existing.match?.path || existing.path,
          source_url: candidate.source_url || candidate.ticket_url
        });
        continue;
      }
    }

    accepted.push({
      candidate,
      scoreResult,
      operation: {
        change_type: targetPath ? "update" : "add",
        file_path: targetPath || eventFilePath(candidate)
      }
    });
  }

  return { accepted, rejected };
}

async function readInputEvents(options) {
  if (options.events) {
    return options.events;
  }

  if (options.json) {
    return parseManualEventsJson(options.json);
  }

  if (options.file) {
    const source = await fs.readFile(options.file, "utf8");
    return parseManualEventsMarkdown(source);
  }

  if (process.env.MANUAL_EVENT_INTAKE_JSON) {
    return parseManualEventsJson(process.env.MANUAL_EVENT_INTAKE_JSON);
  }

  if (process.env.MANUAL_EVENT_INTAKE_FILE) {
    const source = await fs.readFile(process.env.MANUAL_EVENT_INTAKE_FILE, "utf8");
    return parseManualEventsMarkdown(source);
  }

  throw new Error("Informe MANUAL_EVENT_INTAKE_JSON ou MANUAL_EVENT_INTAKE_FILE.");
}

function createEmptyReport() {
  return {
    generated_at: new Date().toISOString(),
    summary: {
      candidates: 0,
      accepted: 0,
      rejected: 0,
      created_prs: 0,
      updated_prs: 0,
      noop_prs: 0
    },
    created_prs: [],
    updated_prs: [],
    noop_prs: [],
    rejected: [],
    errors: []
  };
}

async function writeReport(report) {
  const outputDir = path.join(process.cwd(), OUTPUT_DIR);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "manual-latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputDir, "manual-summary.md"),
    [
      "# Manual event intake",
      "",
      `- Candidatos: ${report.summary.candidates}`,
      `- Aceitos: ${report.summary.accepted}`,
      `- Rejeitados: ${report.summary.rejected}`,
      `- PRs criados: ${report.summary.created_prs}`,
      `- PRs atualizados: ${report.summary.updated_prs}`,
      `- PRs sem mudanca: ${report.summary.noop_prs}`
    ].join("\n").concat("\n"),
    "utf8"
  );
}

export async function runManualEventIntake(options = {}) {
  const rawEvents = await readInputEvents(options);
  const report = createEmptyReport();
  report.summary.candidates = rawEvents.length;

  const { accepted, rejected } = await buildManualEventOperations(rawEvents, options);
  report.rejected.push(...rejected);
  report.summary.accepted = accepted.length;
  report.summary.rejected = rejected.length;

  if (options.apply && !process.env.TOKEN_FOR_CI_EVENTS) {
    throw new Error("TOKEN_FOR_CI_EVENTS precisa estar definido para executar intake manual em modo apply.");
  }

  if (options.apply && !process.env.GITHUB_REPOSITORY) {
    throw new Error("GITHUB_REPOSITORY precisa estar definido para executar intake manual em modo apply.");
  }

  for (const item of accepted) {
    const markdown = buildEventMarkdown(item.candidate);
    const prTitle = item.operation.change_type === "update"
      ? `fix(events): update ${item.candidate.title}`
      : `feat(events): add ${item.candidate.title}`;
    const commitMessage = prTitle;

    if (!options.apply) {
      const payload = {
        title: item.candidate.title,
        branch: buildBranchName(item.candidate),
        file_path: item.operation.file_path,
        dry_run: true
      };
      if (item.operation.change_type === "update") {
        report.updated_prs.push(payload);
      } else {
        report.created_prs.push(payload);
      }
      continue;
    }

    const prResult = await createOrUpdateEventPr({
      token: process.env.TOKEN_FOR_CI_EVENTS,
      repo: process.env.GITHUB_REPOSITORY,
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
      filePath: item.operation.file_path,
      content: markdown,
      candidate: item.candidate,
      prTitle,
      prBody: buildManualPrBody(item.candidate, item.scoreResult, item.operation),
      reviewer: "gabrielldn",
      commitMessage
    });

    const payload = {
      title: item.candidate.title,
      pr_number: prResult.pr_number,
      branch: prResult.branch,
      file_path: item.operation.file_path,
      action: prResult.action
    };

    if (prResult.action === "noop") {
      report.noop_prs.push(payload);
    } else if (item.operation.change_type === "update") {
      report.updated_prs.push(payload);
    } else {
      report.created_prs.push(payload);
    }
  }

  report.summary.created_prs = report.created_prs.length;
  report.summary.updated_prs = report.updated_prs.length;
  report.summary.noop_prs = report.noop_prs.length;

  await writeReport(report);
  return report;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    file: "",
    json: "",
    todayKey: DEFAULT_TODAY_KEY
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
    } else if (arg.startsWith("--json=")) {
      options.json = arg.slice("--json=".length);
    } else if (arg.startsWith("--today=")) {
      options.todayKey = arg.slice("--today=".length);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runManualEventIntake(options);
  console.log(
    `Manual event intake: ${report.summary.accepted} aceitos, ${report.summary.rejected} rejeitados, ${report.summary.created_prs} PRs novos, ${report.summary.updated_prs} PRs de correcao.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
