import { buildBranchName, normalizeUrl } from "./shared.mjs";

function getApiBase(apiUrl) {
  const input = String(apiUrl || "https://api.github.com");
  let endIndex = input.length;

  while (endIndex > 0 && input.charCodeAt(endIndex - 1) === 47) {
    endIndex -= 1;
  }

  return endIndex === input.length ? input : input.slice(0, endIndex);
}

async function githubRequest({
  token,
  apiUrl = "https://api.github.com",
  method = "GET",
  path,
  body
}) {
  const response = await fetch(`${getApiBase(apiUrl)}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "baiaotech-event-intake"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} falhou: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function extractTitleFromFeedbackTitle(title = "") {
  const issueMatch = String(title).match(/^Event intake needs review:\s*(.+?)\s*\([0-9a-f]{8}\)$/i);

  if (issueMatch) {
    return issueMatch[1].trim();
  }

  const prMatch = String(title).match(/^feat\(events\): add\s+(.+)$/i);
  return prMatch ? prMatch[1].trim() : String(title || "").trim();
}

function extractCandidateFromFeedbackBody(body = "") {
  const sourceUrlMatch = String(body).match(/- (?:URL|Fonte): .*?\((https?:\/\/[^\s)]+)\)|- URL:\s+(https?:\/\/\S+)/i);
  const ticketUrlMatch = String(body).match(/- Ticket URL:\s+\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/i);
  const jsonBlockMatch = String(body).match(/```json\s*([\s\S]*?)```/i);

  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      return {
        title: parsed.title || "",
        source_name: parsed.source_name || "",
        source_url: normalizeUrl(parsed.source_url || ""),
        ticket_url: normalizeUrl(parsed.ticket_url || ""),
        start_date: parsed.start_date || "",
        end_date: parsed.end_date || ""
      };
    } catch {
      // ignore malformed JSON feedback bodies
    }
  }

  return {
    title: "",
    source_name: "",
    source_url: normalizeUrl(sourceUrlMatch?.[1] || sourceUrlMatch?.[2] || ""),
    ticket_url: normalizeUrl(ticketUrlMatch?.[2] || ticketUrlMatch?.[1] || ""),
    start_date: "",
    end_date: ""
  };
}

export async function listClosedEventIntakeFeedback({
  token,
  repo,
  apiUrl = "https://api.github.com"
}) {
  const [issues, pulls] = await Promise.all([
    githubRequest({
      token,
      apiUrl,
      path: `/repos/${repo}/issues?state=closed&labels=${encodeURIComponent("event-intake")}&per_page=100`
    }),
    githubRequest({
      token,
      apiUrl,
      path: `/repos/${repo}/pulls?state=closed&per_page=100`
    })
  ]);

  const issueFeedback = (issues || [])
    .filter((issue) => !issue.pull_request)
    .map((issue) => {
      const extracted = extractCandidateFromFeedbackBody(issue.body || "");
      return {
        title: extracted.title || extractTitleFromFeedbackTitle(issue.title),
        source_name: extracted.source_name || "",
        source_url: extracted.source_url || "",
        ticket_url: extracted.ticket_url || "",
        start_date: extracted.start_date || "",
        end_date: extracted.end_date || "",
        feedback_url: issue.html_url || issue.url || "",
        details: "closed_issue"
      };
    });

  const pullFeedback = (pulls || [])
    .filter((pull) => String(pull.head?.ref || "").startsWith("event-intake/") && !pull.merged_at)
    .map((pull) => {
      const extracted = extractCandidateFromFeedbackBody(pull.body || "");
      return {
        title: extracted.title || extractTitleFromFeedbackTitle(pull.title),
        source_name: extracted.source_name || "",
        source_url: extracted.source_url || "",
        ticket_url: extracted.ticket_url || "",
        start_date: extracted.start_date || "",
        end_date: extracted.end_date || "",
        feedback_url: pull.html_url || pull.url || "",
        details: "closed_unmerged_pr"
      };
    });

  return [...issueFeedback, ...pullFeedback].filter((entry) => entry.title || entry.source_url || entry.ticket_url);
}

async function requestReviewerIfEligible({
  token,
  repo,
  apiUrl,
  prNumber,
  reviewer,
  prAuthorLogin
}) {
  const normalizedReviewer = String(reviewer || "").trim().toLowerCase();
  const normalizedAuthor = String(prAuthorLogin || "").trim().toLowerCase();

  if (!normalizedReviewer) {
    return { requested: false, skipped: true, reason: "missing_reviewer" };
  }

  if (normalizedReviewer && normalizedReviewer === normalizedAuthor) {
    return { requested: false, skipped: true, reason: "reviewer_is_pr_author" };
  }

  try {
    await githubRequest({
      token,
      apiUrl,
      method: "POST",
      path: `/repos/${repo}/pulls/${prNumber}/requested_reviewers`,
      body: { reviewers: [reviewer] }
    });
    return { requested: true, skipped: false, reason: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Review cannot be requested from pull request author")) {
      return { requested: false, skipped: true, reason: "reviewer_is_pr_author" };
    }

    throw error;
  }
}

function toBase64(value) {
  return Buffer.from(value).toString("base64");
}

async function getRepoInfo({ token, repo, apiUrl }) {
  return githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}`
  });
}

async function getRef({ token, repo, apiUrl, branchName }) {
  return githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}/git/ref/heads/${branchName}`
  });
}

async function ensureBranch({ token, repo, apiUrl, branchName, baseSha }) {
  const ref = await getRef({ token, repo, apiUrl, branchName });

  if (ref) {
    return ref.object.sha;
  }

  const created = await githubRequest({
    token,
    apiUrl,
    method: "POST",
    path: `/repos/${repo}/git/refs`,
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    }
  });

  return created.object.sha;
}

async function getFileOnBranch({ token, repo, apiUrl, path: filePath, branchName }) {
  return githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branchName)}`
  });
}

async function upsertFileOnBranch({
  token,
  repo,
  apiUrl,
  filePath,
  branchName,
  content,
  commitMessage
}) {
  const existing = await getFileOnBranch({
    token,
    repo,
    apiUrl,
    path: filePath,
    branchName
  });

  const currentContent = existing?.content
    ? Buffer.from(existing.content, "base64").toString("utf8")
    : "";

  if (currentContent === content) {
    return {
      changed: false,
      file: existing
    };
  }

  const updated = await githubRequest({
    token,
    apiUrl,
    method: "PUT",
    path: `/repos/${repo}/contents/${filePath}`,
    body: {
      message: commitMessage,
      content: toBase64(content),
      branch: branchName,
      sha: existing?.sha
    }
  });

  return {
    changed: true,
    file: updated.content
  };
}

export async function syncRepoFileToDefaultBranch({
  token,
  repo,
  apiUrl = "https://api.github.com",
  filePath,
  content,
  commitMessage
}) {
  const repoInfo = await getRepoInfo({ token, repo, apiUrl });
  const branchName = repoInfo.default_branch;

  const result = await upsertFileOnBranch({
    token,
    repo,
    apiUrl,
    filePath,
    branchName,
    content,
    commitMessage
  });

  return {
    changed: result.changed,
    branch: branchName
  };
}

async function findOpenPullForBranch({ token, repo, apiUrl, owner, branchName }) {
  const pulls = await githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branchName}`)}`
  });

  return pulls?.[0] || null;
}

async function upsertPullRequest({
  token,
  repo,
  apiUrl,
  owner,
  branchName,
  baseBranch,
  title,
  body,
  reviewer
}) {
  const existing = await findOpenPullForBranch({
    token,
    repo,
    apiUrl,
    owner,
    branchName
  });

  if (existing) {
    await githubRequest({
      token,
      apiUrl,
      method: "PATCH",
      path: `/repos/${repo}/pulls/${existing.number}`,
      body: { title, body }
    });

    if (reviewer) {
      await requestReviewerIfEligible({
        token,
        repo,
        apiUrl,
        prNumber: existing.number,
        reviewer,
        prAuthorLogin: existing.user?.login || ""
      });
    }

    return existing.number;
  }

  const created = await githubRequest({
    token,
    apiUrl,
    method: "POST",
    path: `/repos/${repo}/pulls`,
    body: {
      title,
      body,
      head: branchName,
      base: baseBranch
    }
  });

  if (reviewer) {
    await requestReviewerIfEligible({
      token,
      repo,
      apiUrl,
      prNumber: created.number,
      reviewer,
      prAuthorLogin: created.user?.login || ""
    });
  }

  return created.number;
}

export async function ensureLabel({
  token,
  repo,
  apiUrl,
  name,
  color = "0E8A16",
  description = "Intake automatico de eventos"
}) {
  const existing = await githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}/labels/${encodeURIComponent(name)}`
  });

  if (existing) {
    return existing;
  }

  return githubRequest({
    token,
    apiUrl,
    method: "POST",
    path: `/repos/${repo}/labels`,
    body: { name, color, description }
  });
}

async function findIssueByMarker({ token, repo, apiUrl, label, marker }) {
  const issues = await githubRequest({
    token,
    apiUrl,
    path: `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`
  });

  return (issues || []).find((issue) => {
    return !issue.pull_request && String(issue.body || "").includes(marker);
  }) || null;
}

export async function upsertIssue({
  token,
  repo,
  apiUrl,
  label,
  title,
  body,
  assignee,
  marker
}) {
  await ensureLabel({ token, repo, apiUrl, name: label });
  const existing = await findIssueByMarker({ token, repo, apiUrl, label, marker });

  if (existing) {
    await githubRequest({
      token,
      apiUrl,
      method: "PATCH",
      path: `/repos/${repo}/issues/${existing.number}`,
      body: {
        title,
        body,
        assignees: assignee ? [assignee] : undefined
      }
    });

    return {
      action: "updated",
      issue_number: existing.number
    };
  }

  const created = await githubRequest({
    token,
    apiUrl,
    method: "POST",
    path: `/repos/${repo}/issues`,
    body: {
      title,
      body,
      labels: [label],
      assignees: assignee ? [assignee] : undefined
    }
  });

  return {
    action: "created",
    issue_number: created.number
  };
}

export async function closeIssueByMarker({ token, repo, apiUrl, label, marker }) {
  const existing = await findIssueByMarker({ token, repo, apiUrl, label, marker });

  if (!existing) {
    return null;
  }

  await githubRequest({
    token,
    apiUrl,
    method: "PATCH",
    path: `/repos/${repo}/issues/${existing.number}`,
    body: {
      state: "closed"
    }
  });

  return existing.number;
}

export async function createOrUpdateEventPr({
  token,
  repo,
  apiUrl = "https://api.github.com",
  filePath,
  content,
  candidate,
  prTitle,
  prBody,
  reviewer
}) {
  const repoInfo = await getRepoInfo({ token, repo, apiUrl });
  const branchName = buildBranchName(candidate);
  const owner = repo.split("/")[0];

  await ensureBranch({
    token,
    repo,
    apiUrl,
    branchName,
    baseSha: repoInfo.default_branch ? (await getRef({
      token,
      repo,
      apiUrl,
      branchName: repoInfo.default_branch
    })).object.sha : repoInfo.pushed_at
  });

  const result = await upsertFileOnBranch({
    token,
    repo,
    apiUrl,
    filePath,
    branchName,
    content,
    commitMessage: `feat(events): add ${candidate.title}`
  });

  const prNumber = await upsertPullRequest({
    token,
    repo,
    apiUrl,
    owner,
    branchName,
    baseBranch: repoInfo.default_branch,
    title: prTitle,
    body: prBody,
    reviewer
  });

  return {
    action: result.changed ? "updated" : "noop",
    branch: branchName,
    pr_number: prNumber
  };
}
