import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { collectCandidateSources } from "../../scripts/generate-event-source-candidates.mjs";

const modulePath = pathToFileURL(path.resolve("scripts/generate-event-source-candidates.mjs")).href;

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

async function writeCommunity(tempDir, fileName, frontMatter) {
  const targetPath = path.join(tempDir, "src/content/communities", fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `---\n${frontMatter}\n---\n\nDescricao.\n`, "utf8");
}

describe("event source candidates", () => {
  it("gera candidatos apenas para plataformas suportadas", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-sources-"));
    await writeCommunity(
      tempDir,
      "gdg.md",
      'title: "GDG Fortaleza"\nwebsite: "https://gdg.community.dev/gdg-fortaleza/"\ninstagram: ""'
    );
    await writeCommunity(
      tempDir,
      "meetup.md",
      'title: "WordPress Fortaleza"\nwebsite: "https://www.meetup.com/pt-BR/wpfortaleza/"\ninstagram: ""'
    );
    await writeCommunity(
      tempDir,
      "sympla.md",
      'title: "Evento Sympla"\nwebsite: "https://www.sympla.com.br/eventos?s=tecnologia&c=Fortaleza%2C%20CE"\ninstagram: ""'
    );
    await writeCommunity(
      tempDir,
      "site.md",
      'title: "Comunidade Livre"\nwebsite: "https://example.com"\ninstagram: ""'
    );

    const currentCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const candidates = await collectCandidateSources(tempDir);
      expect(candidates).toHaveLength(3);
      expect(candidates.map((candidate) => candidate.recommended_type)).toEqual(
        expect.arrayContaining(["gdg-chapter", "meetup-group", "sympla-search"])
      );
    } finally {
      process.chdir(currentCwd);
    }
  });

  it("grava o arquivo de candidatos no comando principal", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-sources-"));
    await writeCommunity(
      tempDir,
      "gdg.md",
      'title: "GDG Fortaleza"\nwebsite: "https://gdg.community.dev/gdg-fortaleza/"\ninstagram: ""'
    );

    const currentCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const { main } = await importModule();
      await main();
      const generated = JSON.parse(await fs.readFile(path.join(tempDir, "data/event-source-candidates.json"), "utf8"));
      expect(generated).toHaveLength(1);
      expect(generated[0].candidate_url).toContain("gdg.community.dev");
    } finally {
      process.chdir(currentCwd);
    }
  });
});
