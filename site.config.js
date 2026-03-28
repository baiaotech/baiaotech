function trimOuterSlashes(value) {
  const text = String(value || "");
  let start = 0;
  let end = text.length;

  while (start < end && text[start] === "/") {
    start += 1;
  }

  while (end > start && text[end - 1] === "/") {
    end -= 1;
  }

  return text.slice(start, end);
}

function stripTrailingSlash(value) {
  const text = String(value || "");
  let end = text.length;

  while (end > 0 && text[end - 1] === "/") {
    end -= 1;
  }

  return text.slice(0, end);
}

function ensureSlashes(value) {
  if (!value || value === "/") {
    return "/";
  }

  const trimmed = trimOuterSlashes(value);
  return trimmed ? `/${trimmed}/` : "/";
}

function getPathPrefix(env = process.env) {
  if (env.PATH_PREFIX) {
    return ensureSlashes(env.PATH_PREFIX);
  }

  if (env.SITE_URL) {
    try {
      const siteUrl = new URL(env.SITE_URL);
      const hostname = siteUrl.hostname.toLowerCase();
      const isGitHubPagesHost =
        hostname === "github.io" || hostname.endsWith(".github.io");
      if (!isGitHubPagesHost) {
        return "/";
      }
    } catch (e) {
      // If SITE_URL is not a valid URL, fall back to default prefix
      return "/";
    }
  }

  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY) {
    const [, repo] = env.GITHUB_REPOSITORY.split("/");
    return ensureSlashes(repo);
  }

  return "/";
}

function getSiteUrl(pathPrefix, env = process.env) {
  if (env.SITE_URL) {
    return stripTrailingSlash(env.SITE_URL);
  }

  if (env.GITHUB_REPOSITORY_OWNER && env.GITHUB_REPOSITORY) {
    const [, repo] = env.GITHUB_REPOSITORY.split("/");
    const suffix = pathPrefix === "/" ? "" : pathPrefix.slice(0, -1);
    return `https://${env.GITHUB_REPOSITORY_OWNER}.github.io${suffix}`;
  }

  return "http://localhost:8080";
}

function getSiteConfig(env = process.env) {
  const pathPrefix = getPathPrefix(env);

  return {
    title: "Baião Tech",
    description:
      "Acompanhe eventos e encontre comunidades de tecnologia em um só lugar.",
    locale: "pt-BR",
    pathPrefix,
    siteUrl: getSiteUrl(pathPrefix, env),
    repoUrl: "https://github.com/baiaotech/baiaotech",
    backendRepo: "baiaotech/BackendBaiaoTech"
  };
}

module.exports = {
  getSiteConfig,
  ensureSlashes,
  getPathPrefix,
  getSiteUrl,
  stripTrailingSlash,
  trimOuterSlashes
};
