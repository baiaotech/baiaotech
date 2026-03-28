import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const modulePath = pathToFileURL(path.resolve("scripts/import-backend-fixtures.mjs")).href;

async function importModule() {
  return import(`${modulePath}?t=${Date.now()}`);
}

describe("import backend fixtures", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GH_BIN;
  });

  it("exige GH_BIN absoluto quando informado", async () => {
    process.env.GH_BIN = "gh";
    const { resolveGhBinary } = await importModule();
    expect(() => resolveGhBinary(process.env)).toThrow("GH_BIN precisa ser um caminho absoluto.");
  });

  it("resolve o gh por caminho absoluto configurado", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-bin-"));
    const ghPath = path.join(tempDir, "gh");
    fs.writeFileSync(ghPath, "#!/bin/sh\nexit 0\n");
    process.env.GH_BIN = ghPath;

    const { resolveGhBinary } = await importModule();
    expect(resolveGhBinary(process.env)).toBe(ghPath);
  });

  it("falha quando GH_BIN absoluto nao existe", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-home-"));
    const ghPath = path.join(tempDir, "gh");
    process.env.GH_BIN = ghPath;
    const { resolveGhBinary } = await importModule();
    expect(() => resolveGhBinary(process.env)).toThrow(`GH_BIN nao encontrado: ${ghPath}`);
  });

  it("usa o binario resolvido ao buscar json do repositorio", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-bin-"));
    const ghPath = path.join(tempDir, "gh");
    fs.writeFileSync(ghPath, "#!/bin/sh\nexit 0\n");
    process.env.GH_BIN = ghPath;

    vi.doMock("node:child_process", () => ({
      execFileSync: vi.fn(() => Buffer.from(JSON.stringify({ ok: true })).toString("base64"))
    }));

    const importedModule = await importModule();
    const childProcess = await import("node:child_process");

    expect(
      importedModule.fetchRepoJson("baiaotech/BackendBaiaoTech", "fixture.json", "main", process.env)
    ).toEqual({ ok: true });
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      ghPath,
      ["api", "repos/baiaotech/BackendBaiaoTech/contents/fixture.json?ref=main", "--jq", ".content"],
      { encoding: "utf8" }
    );
  });

  it("normaliza texto, gera slug unico e decodifica conteudo", async () => {
    const importedModule = await importModule();
    const usedSlugs = new Set(["baiao-tech"]);
    const encoded = Buffer.from(JSON.stringify({ name: "Baião Tech" })).toString("base64");

    expect(importedModule.normalizeText("Baião Tech!")).toBe("Baiao Tech");
    expect(importedModule.slugify("Baião Tech")).toBe("baiao-tech");
    expect(importedModule.uniqueSlug("baiao-tech", usedSlugs)).toBe("baiao-tech-2");
    expect(importedModule.decodeContent(encoded)).toBe('{"name":"Baião Tech"}');
  });

  it("interpreta formatos, locais e front matter", async () => {
    const importedModule = await importModule();

    expect(importedModule.inferEventFormat("Evento online", "")).toBe("online");
    expect(importedModule.inferEventFormat("Centro de Convencoes", "formato hybrid")).toBe("hybrid");
    expect(importedModule.inferEventKind("Security Leaders", "forum executivo")).toBe("summit");
    expect(importedModule.inferEventKind("Frontend Day", "")).toBe("conference");
    expect(importedModule.parseEventLocation("Centro - Recife - PE", "in-person")).toEqual({
      venue: "Centro - Recife - PE",
      city: "Recife",
      state: "PE"
    });
    expect(importedModule.parseEventLocation("", "online")).toEqual({
      venue: "Online",
      city: "Online",
      state: "Online"
    });
    expect(importedModule.normalizeUrl("null")).toBe("");
    expect(importedModule.yamlValue(["python", "cloud"], 2)).toContain('- "python"');
    expect(
      importedModule.toFrontMatter({
        title: "Comunidade",
        featured: false
      })
    ).toContain('title: "Comunidade"');
  });

  it("infere cidade e tags de comunidade", async () => {
    const importedModule = await importModule();

    expect(importedModule.inferCommunityCity("Pyladies Recife", "grupo em Recife")).toBe("Recife");
    expect(importedModule.inferCommunityTags("React Ladies", "comunidade women in tech", "https://react.dev")).toEqual(
      expect.arrayContaining(["frontend", "diversidade"])
    );
    expect(importedModule.toDateOnly("2026-08-21T12:00:00Z")).toBe("2026-08-21");
  });
});
