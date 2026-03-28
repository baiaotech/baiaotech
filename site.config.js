function ensureSlashes(value) {
  if (!value || value === "/") {
    return "/";
  }

  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}

function getPathPrefix() {
  if (process.env.PATH_PREFIX) {
    return ensureSlashes(process.env.PATH_PREFIX);
  }

  if (process.env.SITE_URL) {
    try {
      const siteUrl = new URL(process.env.SITE_URL);
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

  if (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY) {
    const [, repo] = process.env.GITHUB_REPOSITORY.split("/");
    return ensureSlashes(repo);
  }

  return "/";
}

function getSiteUrl(pathPrefix) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }

  if (process.env.GITHUB_REPOSITORY_OWNER && process.env.GITHUB_REPOSITORY) {
    const [, repo] = process.env.GITHUB_REPOSITORY.split("/");
    const suffix = pathPrefix === "/" ? "" : pathPrefix.slice(0, -1);
    return `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io${suffix}`;
  }

  return "http://localhost:8080";
}

function getSiteConfig() {
  const pathPrefix = getPathPrefix();

  return {
    title: "Baião Tech",
    description:
      "Acompanhe eventos e encontre comunidades de tecnologia em um só lugar.",
    locale: "pt-BR",
    pathPrefix,
    siteUrl: getSiteUrl(pathPrefix),
    repoUrl: "https://github.com/baiaotech/baiaotech",
    backendRepo: "baiaotech/BackendBaiaoTech"
  };
}

module.exports = {
  getSiteConfig,
  ensureSlashes
};
