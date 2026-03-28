import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/prune-past-events.mjs")).href;

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

async function writeEvent(tempDir, fileName, frontMatter) {
  const targetPath = path.join(tempDir, "src/content/events", fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(
    targetPath,
    `---\n${frontMatter}\n---\n\nConteudo de teste.\n`,
    "utf8"
  );
}

describe("prune past events", () => {
  it("lista somente arquivos vencidos na data de referencia", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-prune-"));
    await writeEvent(
      tempDir,
      "evento-passado.md",
      'title: "Evento passado"\nstart_date: "2026-03-20"\nend_date: "2026-03-21"'
    );
    await writeEvent(
      tempDir,
      "evento-futuro.md",
      'title: "Evento futuro"\nstart_date: "2026-03-28"\nend_date: "2026-03-29"'
    );

    const { collectPastEventFiles } = await importModule();
    const expiredEvents = await collectPastEventFiles({
      cwd: tempDir,
      todayKey: "2026-03-27"
    });

    expect(expiredEvents).toHaveLength(1);
    expect(expiredEvents[0].relativePath).toBe("src/content/events/evento-passado.md");
  });

  it("remove os arquivos vencidos quando write esta ativo", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-prune-"));
    await writeEvent(
      tempDir,
      "evento-passado.md",
      'title: "Evento passado"\nstart_date: "2026-03-20"\nend_date: "2026-03-21"'
    );

    const { prunePastEventFiles } = await importModule();
    const expiredEvents = await prunePastEventFiles({
      cwd: tempDir,
      todayKey: "2026-03-27",
      write: true
    });

    await expect(
      fs.access(path.join(tempDir, "src/content/events/evento-passado.md"))
    ).rejects.toThrow();
    expect(expiredEvents).toHaveLength(1);
  });

  it("imprime o resumo correto no modo dry-run e no modo write", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "baiaotech-prune-"));
    await writeEvent(
      tempDir,
      "evento-passado.md",
      'title: "Evento passado"\nstart_date: "2026-03-20"\nend_date: "2026-03-21"'
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { main } = await importModule();
    const currentCwd = process.cwd();

    process.chdir(tempDir);
    try {
      await main(["--today=2026-03-27"]);
      await main(["--today=2026-03-27", "--write"]);
    } finally {
      process.chdir(currentCwd);
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      "Eventos expirados encontrados: 1 arquivo(s) com fim antes de 2026-03-27."
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Removendo: 1 arquivo(s) com fim antes de 2026-03-27."
    );
  });
});
