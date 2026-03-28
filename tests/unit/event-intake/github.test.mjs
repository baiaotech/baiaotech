import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/event-intake/github.mjs")).href;
const originalFetch = globalThis.fetch;

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

function makeJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

function makeFetch(routes) {
  return vi.fn(async (url, options = {}) => {
    const method = options.method || "GET";
    const key = `${method} ${String(url)}`;
    const handler = routes.get(key);

    if (!handler) {
      throw new Error(`Rota nao mockada: ${key}`);
    }

    return typeof handler === "function" ? handler(url, options) : handler;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("event intake github client", () => {
  it("sincroniza um arquivo diretamente na branch default do repositorio", async () => {
    globalThis.fetch = makeFetch(
      new Map([
        ["GET https://api.github.com/repos/baiaotech/baiaotech", makeJsonResponse(200, { default_branch: "main" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/contents/data/event-intake-blacklist.ndjson?ref=main", makeJsonResponse(404, { message: "Not Found" })],
        [
          "PUT https://api.github.com/repos/baiaotech/baiaotech/contents/data/event-intake-blacklist.ndjson",
          makeJsonResponse(200, { content: { sha: "sha123" } })
        ]
      ])
    );

    const { syncRepoFileToDefaultBranch } = await importModule();
    const result = await syncRepoFileToDefaultBranch({
      token: "token",
      repo: "baiaotech/baiaotech",
      filePath: "data/event-intake-blacklist.ndjson",
      content: "{\"reason\":\"past\"}\n",
      commitMessage: "chore(event-intake): refresh blacklist"
    });

    expect(result).toEqual({ changed: true, branch: "main" });
  });

  it("cria ou atualiza PR do evento e solicita reviewer", async () => {
    globalThis.fetch = makeFetch(
      new Map([
        ["GET https://api.github.com/repos/baiaotech/baiaotech", makeJsonResponse(200, { default_branch: "main", pushed_at: "2026-03-28T00:00:00Z" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/git/ref/heads/event-intake/build-with-ai-fortaleza-6ef33f22", makeJsonResponse(404, { message: "Not Found" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/git/ref/heads/main", makeJsonResponse(200, { object: { sha: "base123" } })],
        ["POST https://api.github.com/repos/baiaotech/baiaotech/git/refs", makeJsonResponse(201, { object: { sha: "base123" } })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/contents/src/content/events/build-with-ai-fortaleza.md?ref=event-intake%2Fbuild-with-ai-fortaleza-6ef33f22", makeJsonResponse(404, { message: "Not Found" })],
        ["PUT https://api.github.com/repos/baiaotech/baiaotech/contents/src/content/events/build-with-ai-fortaleza.md", makeJsonResponse(200, { content: { sha: "content123" } })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/pulls?state=open&head=baiaotech%3Aevent-intake%2Fbuild-with-ai-fortaleza-6ef33f22", makeJsonResponse(200, [])],
        ["POST https://api.github.com/repos/baiaotech/baiaotech/pulls", makeJsonResponse(201, { number: 42 })],
        ["POST https://api.github.com/repos/baiaotech/baiaotech/pulls/42/requested_reviewers", makeJsonResponse(201, { ok: true })]
      ])
    );

    const { createOrUpdateEventPr } = await importModule();
    const result = await createOrUpdateEventPr({
      token: "token",
      repo: "baiaotech/baiaotech",
      apiUrl: "https://api.github.com///",
      filePath: "src/content/events/build-with-ai-fortaleza.md",
      content: "---\ntitle: \"Build with AI Fortaleza\"\n---\n",
      candidate: {
        title: "Build with AI Fortaleza",
        source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza/"
      },
      prTitle: "feat(events): add Build with AI Fortaleza",
      prBody: "body",
      reviewer: "gabrielldn"
    });

    expect(result).toEqual({
      action: "updated",
      branch: "event-intake/build-with-ai-fortaleza-6ef33f22",
      pr_number: 42
    });
  });

  it("atualiza issue existente por marcador e consegue fecha-la depois", async () => {
    const marker = "<!-- event-intake-source:abc -->";
    globalThis.fetch = makeFetch(
      new Map([
        ["GET https://api.github.com/repos/baiaotech/baiaotech/labels/event-intake", makeJsonResponse(200, { name: "event-intake" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/issues?state=open&labels=event-intake&per_page=100", makeJsonResponse(200, [{ number: 7, body: `x\n${marker}\n`, pull_request: null }])],
        ["PATCH https://api.github.com/repos/baiaotech/baiaotech/issues/7", makeJsonResponse(200, { number: 7 })]
      ])
    );

    const { closeIssueByMarker, upsertIssue } = await importModule();
    const issueResult = await upsertIssue({
      token: "token",
      repo: "baiaotech/baiaotech",
      label: "event-intake",
      title: "Issue",
      body: marker,
      assignee: "gabrielldn",
      marker
    });
    const closed = await closeIssueByMarker({
      token: "token",
      repo: "baiaotech/baiaotech",
      label: "event-intake",
      marker
    });

    expect(issueResult).toEqual({ action: "updated", issue_number: 7 });
    expect(closed).toBe(7);
  });

  it("cria issue quando o marcador nao existe e nao tenta fechar issue ausente", async () => {
    const marker = "<!-- event-intake-source:new -->";
    globalThis.fetch = makeFetch(
      new Map([
        ["GET https://api.github.com/repos/baiaotech/baiaotech/labels/event-intake", makeJsonResponse(404, { message: "Not Found" })],
        ["POST https://api.github.com/repos/baiaotech/baiaotech/labels", makeJsonResponse(201, { name: "event-intake" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/issues?state=open&labels=event-intake&per_page=100", makeJsonResponse(200, [])],
        ["POST https://api.github.com/repos/baiaotech/baiaotech/issues", makeJsonResponse(201, { number: 55 })]
      ])
    );

    const { closeIssueByMarker, upsertIssue } = await importModule();
    const issueResult = await upsertIssue({
      token: "token",
      repo: "baiaotech/baiaotech",
      label: "event-intake",
      title: "Issue",
      body: marker,
      assignee: "gabrielldn",
      marker
    });
    const closed = await closeIssueByMarker({
      token: "token",
      repo: "baiaotech/baiaotech",
      label: "event-intake",
      marker: "<!-- event-intake-source:missing -->"
    });

    expect(issueResult).toEqual({ action: "created", issue_number: 55 });
    expect(closed).toBeNull();
  });

  it("reaproveita branch existente e evita regravar arquivo identico", async () => {
    const content = "---\ntitle: \"Build with AI Fortaleza\"\n---\n";
    const contentBase64 = Buffer.from(content).toString("base64");
    globalThis.fetch = makeFetch(
      new Map([
        ["GET https://api.github.com/repos/baiaotech/baiaotech", makeJsonResponse(200, { default_branch: "main", pushed_at: "2026-03-28T00:00:00Z" })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/git/ref/heads/event-intake/build-with-ai-fortaleza-6ef33f22", makeJsonResponse(200, { object: { sha: "existing123" } })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/git/ref/heads/main", makeJsonResponse(200, { object: { sha: "base123" } })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/contents/src/content/events/build-with-ai-fortaleza.md?ref=event-intake%2Fbuild-with-ai-fortaleza-6ef33f22", makeJsonResponse(200, { sha: "content123", content: contentBase64 })],
        ["GET https://api.github.com/repos/baiaotech/baiaotech/pulls?state=open&head=baiaotech%3Aevent-intake%2Fbuild-with-ai-fortaleza-6ef33f22", makeJsonResponse(200, [{ number: 99 }])],
        ["PATCH https://api.github.com/repos/baiaotech/baiaotech/pulls/99", makeJsonResponse(200, { number: 99 })]
      ])
    );

    const { createOrUpdateEventPr } = await importModule();
    const result = await createOrUpdateEventPr({
      token: "token",
      repo: "baiaotech/baiaotech",
      filePath: "src/content/events/build-with-ai-fortaleza.md",
      content,
      candidate: {
        title: "Build with AI Fortaleza",
        source_url: "https://gdg.community.dev/events/details/build-with-ai-fortaleza/"
      },
      prTitle: "feat(events): add Build with AI Fortaleza",
      prBody: "body"
    });

    expect(result).toEqual({
      action: "noop",
      branch: "event-intake/build-with-ai-fortaleza-6ef33f22",
      pr_number: 99
    });
  });
});
