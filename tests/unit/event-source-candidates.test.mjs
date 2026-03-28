import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { collectCandidateSources } from "../../scripts/generate-event-source-candidates.mjs";

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
      "site.md",
      'title: "Comunidade Livre"\nwebsite: "https://example.com"\ninstagram: ""'
    );

    const currentCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const candidates = await collectCandidateSources(tempDir);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].recommended_type).toBe("generic-html");
    } finally {
      process.chdir(currentCwd);
    }
  });
});
