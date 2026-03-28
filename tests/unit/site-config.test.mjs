import { afterEach, describe, expect, it } from "vitest";
import siteConfig from "../../site.config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("site.config", () => {
  it("normaliza barras sem regex com backtracking", () => {
    expect(siteConfig.trimOuterSlashes("///baiaotech///")).toBe("baiaotech");
    expect(siteConfig.ensureSlashes("///baiaotech///")).toBe("/baiaotech/");
    expect(siteConfig.ensureSlashes("/")).toBe("/");
    expect(siteConfig.stripTrailingSlash("https://example.com///")).toBe("https://example.com");
  });

  it("prioriza PATH_PREFIX e trata SITE_URL com fallback seguro", () => {
    expect(siteConfig.getPathPrefix({ PATH_PREFIX: "agenda" })).toBe("/agenda/");
    expect(siteConfig.getPathPrefix({ SITE_URL: "https://baiaotech.github.io/baiaotech" })).toBe("/");
    expect(siteConfig.getPathPrefix({ SITE_URL: "::::" })).toBe("/");
  });

  it("deduz prefixo a partir do repositorio em GitHub Actions", () => {
    expect(
      siteConfig.getPathPrefix({
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "baiaotech/baiaotech"
      })
    ).toBe("/baiaotech/");
  });

  it("calcula a URL do site com os fallbacks corretos", () => {
    expect(siteConfig.getSiteUrl("/", { SITE_URL: "https://example.com/" })).toBe("https://example.com");
    expect(
      siteConfig.getSiteUrl("/baiaotech/", {
        GITHUB_REPOSITORY_OWNER: "baiaotech",
        GITHUB_REPOSITORY: "baiaotech/baiaotech"
      })
    ).toBe("https://baiaotech.github.io/baiaotech");
    expect(siteConfig.getSiteUrl("/", {})).toBe("http://localhost:8080");
  });

  it("monta a configuracao final com base no ambiente", () => {
    const config = siteConfig.getSiteConfig({
      PATH_PREFIX: "/portal/",
      SITE_URL: "https://example.com/portal/"
    });

    expect(config.pathPrefix).toBe("/portal/");
    expect(config.siteUrl).toBe("https://example.com/portal");
    expect(config.title).toBe("Baião Tech");
  });
});
