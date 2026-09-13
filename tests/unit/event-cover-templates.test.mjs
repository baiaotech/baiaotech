import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const configureEleventy = require("../../.eleventy.js");
const { getSiteConfig } = require("../../site.config.js");
// Use the same Nunjucks dependency as Eleventy, without adding a dependency.
const requireEleventy = createRequire(require.resolve("@11ty/eleventy"));
const nunjucks = requireEleventy("nunjucks");
const includesDirectory = fileURLToPath(new URL("../../src/_includes/", import.meta.url));
const symplaCover = "https://images.sympla.com.br/6a98789871beb-lg.png";

let fixtureDirectory;
let inputPath;

beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "baiaotech-event-cover-"));
  inputPath = join(fixtureDirectory, "event.md");
  writeFileSync(inputPath, "---\ncategories:\n  - inovacao\n---\nEvento de teste.\n");
});

afterAll(() => {
  if (fixtureDirectory) {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

function renderEvent(coverImage) {
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(includesDirectory, { noCache: true }),
    { autoescape: true }
  );
  configureEleventy({
    addCollection() {},
    addFilter(name, fn) {
      env.addFilter(name, fn);
    },
    addPassthroughCopy() {},
    addShortcode() {}
  });
  env.addFilter("url", (value) => value);

  const data = {
    title: "Hackathon Startup Piauí",
    start_date: "2026-09-16",
    end_date: "2026-09-17",
    kind: "hackathon",
    format: "in-person",
    city: "Floriano",
    state: "PI",
    organizer: "Startup Piauí",
    venue: "Local a definir",
    cover_image: coverImage,
    page: { inputPath, url: "/eventos/teste-capa/" }
  };
  const categoriesBySlug = { inovacao: { name: "Inovação" } };
  const card = env.render("partials/event-card.njk", {
    event: { data, url: data.page.url },
    categoriesBySlug
  });
  const detail = env.render("layouts/event.njk", {
    ...data,
    site: getSiteConfig(),
    categoriesBySlug,
    content: "<p>Evento de teste de renderização.</p>"
  });
  const jsonLd = detail.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(jsonLd).not.toBeNull();

  return { card, detail, eventSchema: JSON.parse(jsonLd[1]), env };
}

describe("event cover template rendering", () => {
  it.each([
    ["HTTPS da Sympla", symplaCover],
    ["asset local", "/assets/test-event-cover.png"]
  ])("usa a capa %s no card, detalhe e JSON-LD", (_label, cover) => {
    const { card, detail, eventSchema, env } = renderEvent(cover);
    const displayedCover = env.getFilter("displayImage")(cover);
    const absoluteCover = env.getFilter("absoluteImage")(cover);

    expect(card).toContain(`src="${displayedCover}"`);
    expect(detail).toContain(`src="${displayedCover}"`);
    expect(detail).toContain('alt="Capa do evento Hackathon Startup Piauí"');
    expect(eventSchema.image).toBe(absoluteCover);
    expect(detail).toContain(`<meta property="og:image" content="${absoluteCover}">`);
  });

  it.each([
    undefined,
    null,
    "",
    "http://example.org/cover.png",
    "//example.org/cover.png",
    "javascript:alert(1)"
  ])("mantém fallback para capa ausente ou insegura: %s", (cover) => {
    const { card, detail, eventSchema, env } = renderEvent(cover);

    expect(card).toContain(`src="${env.getFilter("eventArtworkThumb")(inputPath)}"`);
    expect(detail).toContain(`src="${env.getFilter("eventArtwork")(inputPath)}"`);
    expect(detail).toContain('alt="Ilustração editorial de Hackathon Startup Piauí"');
    expect(eventSchema.image).toBe(env.getFilter("eventArtworkAbsolute")(inputPath));
  });
});
