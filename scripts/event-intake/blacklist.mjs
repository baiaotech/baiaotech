import fs from "node:fs/promises";
import path from "node:path";

import { fingerprintTitle, getRootDir, hashString, normalizeUrl } from "./shared.mjs";

export const EVENT_BLACKLIST_PATH = "data/event-intake-blacklist.ndjson";
export const LEGACY_EVENT_BLACKLIST_PATH = "data/event-intake-blacklist.json";
export const BLACKLISTABLE_REASONS = ["past", "online_only", "non_northeast", "non_tech", "not_event_page"];

export function createEmptyBlacklist() {
  return {
    version: 1,
    updated_at: "",
    entries: []
  };
}

function normalizeEntryUrl(value) {
  return normalizeUrl(value || "");
}

function normalizeBlacklistEntry(entry = {}) {
  return {
    key: String(entry.key || "").trim(),
    title: String(entry.title || "").trim(),
    title_fingerprint: String(entry.title_fingerprint || fingerprintTitle(entry.title || "")).trim(),
    source_name: String(entry.source_name || "").trim(),
    source_url: normalizeEntryUrl(entry.source_url),
    ticket_url: normalizeEntryUrl(entry.ticket_url),
    reason: String(entry.reason || "").trim(),
    details: String(entry.details || "").trim(),
    origin: String(entry.origin || "policy").trim(),
    feedback_url: normalizeEntryUrl(entry.feedback_url),
    state: String(entry.state || "").trim(),
    city: String(entry.city || "").trim(),
    format: String(entry.format || "").trim(),
    start_date: String(entry.start_date || "").trim(),
    end_date: String(entry.end_date || "").trim(),
    first_seen_on: String(entry.first_seen_on || "").trim(),
    last_seen_on: String(entry.last_seen_on || "").trim(),
    hit_count: Number(entry.hit_count || 0) || 0
  };
}

function buildEntryKey(entry = {}) {
  const sourceUrl = normalizeEntryUrl(entry.source_url || entry.ticket_url);

  if (sourceUrl) {
    return hashString(sourceUrl);
  }

  return hashString(
    [
      String(entry.title || "").trim().toLowerCase(),
      String(entry.start_date || "").trim(),
      String(entry.source_name || "").trim().toLowerCase()
    ].join("::")
  );
}

function sortEntries(entries = []) {
  return [...entries].sort((left, right) => {
    return (
      (left.origin || "").localeCompare(right.origin || "", "pt-BR") ||
      left.reason.localeCompare(right.reason, "pt-BR") ||
      (left.source_name || "").localeCompare(right.source_name || "", "pt-BR") ||
      (left.title || "").localeCompare(right.title || "", "pt-BR") ||
      (left.source_url || "").localeCompare(right.source_url || "", "pt-BR")
    );
  });
}

export async function loadEventBlacklist(cwd = getRootDir()) {
  const targetPath = path.join(cwd, EVENT_BLACKLIST_PATH);

  try {
    const source = await fs.readFile(targetPath, "utf8");
    return {
      version: 1,
      updated_at: "",
      entries: sortEntries(
        source
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => normalizeBlacklistEntry(JSON.parse(line)))
      )
    };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }

    try {
      const legacyPath = path.join(cwd, LEGACY_EVENT_BLACKLIST_PATH);
      const source = await fs.readFile(legacyPath, "utf8");
      const parsed = JSON.parse(source);
      const entries = Array.isArray(parsed.entries) ? parsed.entries.map(normalizeBlacklistEntry) : [];

      return {
        version: Number(parsed.version || 1) || 1,
        updated_at: String(parsed.updated_at || "").trim(),
        entries: sortEntries(entries)
      };
    } catch (legacyError) {
      if (legacyError && typeof legacyError === "object" && "code" in legacyError && legacyError.code === "ENOENT") {
        return createEmptyBlacklist();
      }

      throw legacyError;
    }
  }
}

export async function saveEventBlacklist(blacklist, cwd = getRootDir()) {
  const targetPath = path.join(cwd, EVENT_BLACKLIST_PATH);
  const normalizedEntries = sortEntries((blacklist?.entries || []).map(normalizeBlacklistEntry));
  const contents = normalizedEntries.map((entry) => JSON.stringify(entry)).join("\n");

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents ? `${contents}\n` : "", "utf8");
  return targetPath;
}

export function isBlacklistableReason(reason = "") {
  return BLACKLISTABLE_REASONS.includes(String(reason || "").trim());
}

export function findBlacklistedEvent(blacklist, candidate = {}) {
  const urls = [
    candidate.event_url,
    candidate.source_url,
    candidate.ticket_url
  ]
    .map(normalizeEntryUrl)
    .filter(Boolean);

  const lookupKey = buildEntryKey(candidate);
  const titleFingerprint = fingerprintTitle(candidate.title);

  return (blacklist?.entries || []).find((entry) => {
    if (urls.length && urls.some((url) => url === entry.source_url || url === entry.ticket_url)) {
      return true;
    }

    if (Boolean(lookupKey) && entry.key === lookupKey) {
      return true;
    }

    return Boolean(titleFingerprint) && titleFingerprint === entry.title_fingerprint;
  }) || null;
}

export function upsertBlacklistEntry(blacklist, candidate = {}, options = {}) {
  const todayKey = String(options.todayKey || "").trim();
  const reason = String(options.reason || "").trim();
  const details = String(options.details || "").trim();
  const origin = String(options.origin || "policy").trim();
  const feedbackUrl = normalizeEntryUrl(options.feedbackUrl);
  const key = buildEntryKey(candidate);
  const titleFingerprint = fingerprintTitle(candidate.title);

  if (!key) {
    return { blacklist, entry: null, changed: false };
  }

  const nextBlacklist = {
    version: Number(blacklist?.version || 1) || 1,
    updated_at: new Date().toISOString(),
    entries: [...(blacklist?.entries || [])]
  };
  const existingIndex = nextBlacklist.entries.findIndex((entry) => entry.key === key);

  if (existingIndex >= 0) {
    const current = normalizeBlacklistEntry(nextBlacklist.entries[existingIndex]);
    const nextEntry = {
      ...current,
      title: String(candidate.title || current.title || "").trim(),
      title_fingerprint: titleFingerprint || current.title_fingerprint || "",
      source_name: String(candidate.source_name || current.source_name || "").trim(),
      source_url: normalizeEntryUrl(candidate.source_url || current.source_url),
      ticket_url: normalizeEntryUrl(candidate.ticket_url || current.ticket_url),
      reason: reason || current.reason,
      details: details || current.details,
      origin: origin || current.origin || "policy",
      feedback_url: feedbackUrl || current.feedback_url || "",
      state: String(candidate.state || current.state || "").trim(),
      city: String(candidate.city || current.city || "").trim(),
      format: String(candidate.format || current.format || "").trim(),
      start_date: String(candidate.start_date || current.start_date || "").trim(),
      end_date: String(candidate.end_date || current.end_date || "").trim(),
      first_seen_on: current.first_seen_on || todayKey,
      last_seen_on: todayKey || current.last_seen_on,
      hit_count: (Number(current.hit_count || 0) || 0) + 1
    };

    const unchanged = JSON.stringify(current) === JSON.stringify(nextEntry);
    nextBlacklist.entries[existingIndex] = nextEntry;
    nextBlacklist.entries = sortEntries(nextBlacklist.entries);
    return { blacklist: nextBlacklist, entry: nextEntry, changed: !unchanged };
  }

  const newEntry = normalizeBlacklistEntry({
    key,
    title: candidate.title,
    title_fingerprint: titleFingerprint,
    source_name: candidate.source_name,
    source_url: candidate.source_url || candidate.event_url,
    ticket_url: candidate.ticket_url,
    reason,
    details,
    origin,
    feedback_url: feedbackUrl,
    state: candidate.state,
    city: candidate.city,
    format: candidate.format,
    start_date: candidate.start_date,
    end_date: candidate.end_date,
    first_seen_on: todayKey,
    last_seen_on: todayKey,
    hit_count: 1
  });

  nextBlacklist.entries.push(newEntry);
  nextBlacklist.entries = sortEntries(nextBlacklist.entries);
  return { blacklist: nextBlacklist, entry: newEntry, changed: true };
}
