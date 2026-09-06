import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TRACKING_PARAMS = new Set([
  "aff",
  "affid",
  "affsrc",
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
]);

function trimUrlPunctuation(value) {
  return String(value || "").replace(/[>,.;]+$/g, "");
}

export function normalizeEventUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(trimUrlPunctuation(value));
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function canonicalEventIdentity(value) {
  const normalized = normalizeEventUrl(value);

  if (!normalized) {
    return "";
  }

  const url = new URL(normalized);
  const host = url.hostname;
  const pathname = url.pathname;

  if (host === "sympla.com.br") {
    const eventId = pathname.match(/\/evento(?:-online)?\/.*\/(\d+)$/i)?.[1];
    if (eventId) {
      return `sympla:event:${eventId}`;
    }
  }

  if (host === "eventbrite.com" || host === "eventbrite.com.br") {
    const eventId =
      pathname.match(/-tickets-(\d+)$/i)?.[1] ||
      pathname.match(/\/(?:e\/)?[^/]*-(\d+)$/i)?.[1] ||
      url.searchParams.get("eid");

    if (eventId) {
      return `eventbrite:event:${eventId}`;
    }
  }

  if (host === "meetup.com") {
    const eventId = pathname.match(/\/events\/(\d+)(?:\/|$)/i)?.[1];
    if (eventId) {
      return `meetup:event:${eventId}`;
    }
  }

  if (host === "gdg.community.dev") {
    const canonicalPath = pathname.replace(/^\/v0(?=\/)/i, "").toLowerCase();
    return `gdg:${canonicalPath}`;
  }

  return normalized;
}

export function extractEventUrls(body = "") {
  const urls = [];

  for (const line of String(body).split("\n")) {
    if (!/^\s*-\s*(?:Fonte|Ticket URL|URL):/i.test(line)) {
      continue;
    }

    for (const match of line.matchAll(/https?:\/\/[^\s)\]]+/g)) {
      const normalized = normalizeEventUrl(match[0]);
      if (normalized) {
        urls.push(normalized);
      }
    }
  }

  return [...new Set(urls)];
}

export function getPullIdentityKeys(pull = {}) {
  return new Set(
    extractEventUrls(pull.body || "")
      .map(canonicalEventIdentity)
      .filter(Boolean)
  );
}

function setsIntersect(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }

  return false;
}

export function findDuplicatePulls(currentPull, pulls = []) {
  const currentKeys = getPullIdentityKeys(currentPull);

  if (!currentKeys.size) {
    return [];
  }

  return pulls
    .filter((pull) => pull.number !== currentPull.number)
    .filter((pull) => String(pull.head?.ref || "").startsWith("event-intake/"))
    .filter((pull) => setsIntersect(currentKeys, getPullIdentityKeys(pull)))
    .sort((left, right) => left.number - right.number);
}

async function githubRequest(pathname, token) {
  const apiUrl = String(process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const response = await fetch(`${apiUrl}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "baiaotech-event-intake-duplicate-guard",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API GET ${pathname} falhou: ${response.status} ${body}`);
  }

  return response.json();
}

async function listOpenPulls(repo, token) {
  const pulls = [];

  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(
      `/repos/${repo}/pulls?state=open&per_page=100&page=${page}`,
      token
    );

    pulls.push(...batch);

    if (batch.length < 100) {
      break;
    }
  }

  return pulls;
}

async function appendStepSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
}

export async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repo || !token) {
    throw new Error("GITHUB_EVENT_PATH, GITHUB_REPOSITORY e GITHUB_TOKEN sao obrigatorios.");
  }

  const event = JSON.parse(await fs.readFile(eventPath, "utf8"));
  const currentPull = event.pull_request;

  if (!currentPull) {
    console.log("Evento nao corresponde a pull request; verificacao ignorada.");
    return;
  }

  if (!String(currentPull.head?.ref || "").startsWith("event-intake/")) {
    console.log("PR fora do fluxo event-intake; verificacao ignorada.");
    return;
  }

  const pulls = await listOpenPulls(repo, token);
  const duplicates = findDuplicatePulls(currentPull, pulls);

  if (!duplicates.length) {
    console.log(`PR #${currentPull.number}: nenhuma duplicata aberta encontrada.`);
    await appendStepSummary([
      "## Event Intake Duplicate Guard",
      "",
      `PR #${currentPull.number}: nenhuma duplicata aberta encontrada.`
    ]);
    return;
  }

  const duplicateLinks = duplicates.map(
    (pull) => `- [#${pull.number}](${pull.html_url}) ${pull.title}`
  );
  const message = `PR #${currentPull.number} duplica ${duplicates.map((pull) => `#${pull.number}`).join(", ")}.`;

  console.error(message);
  await appendStepSummary([
    "## Event Intake Duplicate Guard",
    "",
    message,
    "",
    "PRs com a mesma identidade canonica de evento:",
    ...duplicateLinks,
    "",
    "Feche a duplicata mais recente e mantenha apenas um PR por evento."
  ]);

  process.exitCode = 1;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
