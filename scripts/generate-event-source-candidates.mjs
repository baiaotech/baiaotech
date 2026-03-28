import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import matter from "gray-matter";

const COMMUNITIES_GLOB = "src/content/communities/*.md";

function classifySource(url) {
  if (/meetup\.com/i.test(url)) {
    return "meetup-group";
  }

  if (/gdg\.community\.dev/i.test(url)) {
    return "gdg-chapter";
  }

  if (/eventbrite\./i.test(url)) {
    return "eventbrite-search";
  }

  if (/sympla\.com\.br/i.test(url)) {
    return "sympla-search";
  }

  if (/doity\.com\.br/i.test(url)) {
    return "doity-search";
  }

  if (/even3\.com\.br/i.test(url)) {
    return "even3-search";
  }

  return "";
}

function explainReason(type, url) {
  if (type === "meetup-group") {
    return "website da comunidade combina com plataforma suportada";
  }

  if (type === "gdg-chapter" && /gdg\.community\.dev/i.test(url)) {
    return "site de chapter GDG com eventos live acessiveis via API publica";
  }

  if (type === "doity-search") {
    return "pagina da Doity detectada para busca ampla na plataforma";
  }

  if (type === "eventbrite-search" || type === "sympla-search" || type === "even3-search") {
    return "fonte candidata para busca regional na plataforma";
  }

  return "fonte identificada a partir das comunidades atuais";
}

export async function collectCandidateSources(cwd = process.cwd()) {
  const communityPaths = await fg(COMMUNITIES_GLOB, { cwd });
  const seen = new Set();
  const candidates = [];

  for (const relativePath of communityPaths) {
    const source = await fs.readFile(path.join(cwd, relativePath), "utf8");
    const document = matter(source);
    const title = document.data.title || path.basename(relativePath, ".md");
    const urls = [document.data.website, document.data.instagram].filter(Boolean);

    for (const candidateUrl of urls) {
      const recommendedType = classifySource(candidateUrl);

      if (!recommendedType) {
        continue;
      }

      const key = `${title}::${candidateUrl}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidates.push({
        source_name: title,
        recommended_type: recommendedType,
        candidate_url: candidateUrl,
        reason: explainReason(recommendedType, candidateUrl)
      });
    }
  }

  return candidates.sort((left, right) => {
    return left.source_name.localeCompare(right.source_name, "pt-BR");
  });
}

export async function main() {
  const cwd = process.cwd();
  const outputPath = path.join(cwd, "data/event-source-candidates.json");
  const candidates = await collectCandidateSources(cwd);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  console.log(`Lista candidata atualizada: ${candidates.length} fonte(s) em data/event-source-candidates.json.`);
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
