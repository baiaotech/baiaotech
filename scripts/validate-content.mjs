import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import fg from "fast-glob";
import matter from "gray-matter";
import { z } from "zod";

const ROOT = process.cwd();
const CATEGORY_PATH = path.join(ROOT, "src/_data/categories.json");
const EVENTS_GLOB = "src/content/events/*.md";
const COMMUNITIES_GLOB = "src/content/communities/*.md";

const validStateCodes = [
  "AL",
  "BA",
  "CE",
  "MA",
  "PB",
  "PE",
  "PI",
  "RN",
  "SE",
  "Nacional",
  "Online",
  ""
];

const validEventKinds = [
  "conference",
  "meetup",
  "hackathon",
  "workshop",
  "summit",
  "other"
];

const validFormats = ["in-person", "online", "hybrid"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const urlPattern = /^https?:\/\/.+/i;
const localAssetPattern = /^\/assets\/.+/i;

const optionalUrl = z
  .string()
  .default("")
  .refine((value) => value === "" || urlPattern.test(value) || localAssetPattern.test(value), {
    message: "deve ser uma URL http(s) valida ou um caminho local em /assets/"
  });

const eventSchema = z.object({
  title: z.string().min(2),
  start_date: z.string().regex(datePattern, "use YYYY-MM-DD"),
  end_date: z.string().regex(datePattern, "use YYYY-MM-DD"),
  kind: z.enum(validEventKinds),
  format: z.enum(validFormats),
  city: z.string().default(""),
  state: z.string().refine((value) => validStateCodes.includes(value), {
    message: "estado invalido"
  }),
  organizer: z.string().min(1),
  venue: z.string().min(1),
  ticket_url: optionalUrl,
  categories: z.array(z.string()).min(1),
  featured: z.boolean().default(false),
  cover_image: optionalUrl,
  price: z.union([z.string(), z.number()]).optional(),
  source_name: z.string().optional(),
  source_url: z.string().regex(urlPattern, "deve ser uma URL http(s) valida").optional(),
  legacy_id: z.number().optional(),
  priority: z.number().optional()
});

const communitySchema = z.object({
  title: z.string().min(2),
  state: z.string().refine((value) => validStateCodes.includes(value), {
    message: "estado invalido"
  }),
  city: z.string().default(""),
  website: optionalUrl,
  instagram: optionalUrl,
  linkedin: optionalUrl,
  telegram: optionalUrl,
  whatsapp: optionalUrl,
  tags: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  cover_image: optionalUrl,
  legacy_id: z.number().optional()
});

function readMarkdown(filePath) {
  return fs.readFile(filePath, "utf8").then((source) => matter(source));
}

function parseDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

function collectZodErrors(error) {
  return error.issues.map((issue) => {
    const pathLabel = issue.path.length ? issue.path.join(".") : "front matter";
    return `${pathLabel}: ${issue.message}`;
  });
}

async function main() {
  const categories = JSON.parse(await fs.readFile(CATEGORY_PATH, "utf8"));
  const categorySlugs = new Set(categories.map((item) => item.slug));

  const [eventPaths, communityPaths] = await Promise.all([
    fg(EVENTS_GLOB, { cwd: ROOT }),
    fg(COMMUNITIES_GLOB, { cwd: ROOT })
  ]);

  const errors = [];

  for (const relativePath of eventPaths) {
    const filePath = path.join(ROOT, relativePath);
    const document = await readMarkdown(filePath);
    const result = eventSchema.safeParse(document.data);

    if (!document.content.trim()) {
      errors.push(`${relativePath}: corpo em Markdown nao pode ficar vazio`);
    }

    if (!result.success) {
      collectZodErrors(result.error).forEach((message) => {
        errors.push(`${relativePath}: ${message}`);
      });
      continue;
    }

    if (parseDate(result.data.end_date) < parseDate(result.data.start_date)) {
      errors.push(`${relativePath}: end_date nao pode ser menor que start_date`);
    }

    if (result.data.source_url && !result.data.source_name) {
      errors.push(`${relativePath}: source_name e obrigatorio quando source_url estiver presente`);
    }

    for (const slug of result.data.categories) {
      if (!categorySlugs.has(slug)) {
        errors.push(`${relativePath}: categoria desconhecida "${slug}"`);
      }
    }
  }

  for (const relativePath of communityPaths) {
    const filePath = path.join(ROOT, relativePath);
    const document = await readMarkdown(filePath);
    const result = communitySchema.safeParse(document.data);

    if (!document.content.trim()) {
      errors.push(`${relativePath}: corpo em Markdown nao pode ficar vazio`);
    }

    if (!result.success) {
      collectZodErrors(result.error).forEach((message) => {
        errors.push(`${relativePath}: ${message}`);
      });
    }
  }

  if (errors.length) {
    console.error("\nValidacao falhou:\n");
    errors.forEach((message) => console.error(`- ${message}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Conteudo validado com sucesso: ${eventPaths.length} eventos e ${communityPaths.length} comunidades.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
