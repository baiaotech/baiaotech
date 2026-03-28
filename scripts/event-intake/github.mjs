import { buildBranchName } from "./shared.mjs";

function getApiBase(apiUrl) {
  return String(apiUrl || "https://api.github.com").replace(/\/+$/, "");
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
      await githubRequest({
        token,
        apiUrl,
        method: "POST",
        path: `/repos/${repo}/pulls/${existing.number}/requested_reviewers`,
        body: { reviewers: [reviewer] }
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
    await githubRequest({
      token,
      apiUrl,
      method: "POST",
      path: `/repos/${repo}/pulls/${created.number}/requested_reviewers`,
      body: { reviewers: [reviewer] }
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
