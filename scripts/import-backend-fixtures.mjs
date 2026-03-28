import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const BACKEND_REPO = process.env.BACKEND_REPO || "baiaotech/BackendBaiaoTech";
const BACKEND_REF = process.env.BACKEND_REF || "main";

const CATEGORY_SOURCE = "eventos/fixtures/categorias.json";
const EVENTS_SOURCE = "eventos/fixtures/eventos.json";
const COMMUNITIES_SOURCE = "eventos/fixtures/comunidades.json";

const EVENTS_DIR = path.join(ROOT, "src/content/events");
const COMMUNITIES_DIR = path.join(ROOT, "src/content/communities");
const CATEGORIES_PATH = path.join(ROOT, "src/_data/categories.json");

const CITY_HINTS = [
  "Maceió",
  "Salvador",
  "Feira de Santana",
  "Fortaleza",
  "Juazeiro do Norte",
  "São Luís",
  "Imperatriz",
  "João Pessoa",
  "Campina Grande",
  "Recife",
  "Caruaru",
  "Teresina",
  "Parnaíba",
  "Natal",
  "Mossoró",
  "Aracaju"
];

function normalizeText(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function uniqueSlug(base, existing) {
  let candidate = base;
  let counter = 2;

  while (existing.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  existing.add(candidate);
  return candidate;
}

function decodeContent(content) {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function resolveGhBinary(env = process.env) {
  if (env.GH_BIN) {
    if (!path.isAbsolute(env.GH_BIN)) {
      throw new Error("GH_BIN precisa ser um caminho absoluto.");
    }

    if (existsSync(env.GH_BIN)) {
      return env.GH_BIN;
    }

    throw new Error(`GH_BIN nao encontrado: ${env.GH_BIN}`);
  }

  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\GitHub CLI\\gh.exe",
          "C:\\Program Files (x86)\\GitHub CLI\\gh.exe"
        ]
      : [
          "/usr/bin/gh",
          "/usr/local/bin/gh",
          env.HOME ? path.join(env.HOME, ".local", "bin", "gh") : ""
        ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Nao foi possivel localizar o binario do GitHub CLI. Defina GH_BIN com um caminho absoluto.");
}

function fetchRepoJson(repo, filepath, ref, env = process.env) {
  const ghBinary = resolveGhBinary(env);
  const output = execFileSync(
    ghBinary,
    [
      "api",
      `repos/${repo}/contents/${filepath}?ref=${ref}`,
      "--jq",
      ".content"
    ],
    { encoding: "utf8" }
  );

  return JSON.parse(decodeContent(output));
}

function toDateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function normalizeUrl(value) {
  if (!value || value === "null") {
    return "";
  }

  return String(value).trim();
}

function parseEventLocation(value, fallbackFormat) {
  const text = String(value || "").trim();

  if (!text || fallbackFormat === "online") {
    return {
      venue: text || "Online",
      city: "Online",
      state: "Online"
    };
  }

  const normalized = text.replace(/[–—]/g, "-");
  const parts = normalized
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  const state = parts.at(-1);
  const city = parts.at(-2);

  if (state && /^[A-Z]{2}$/.test(state) && city) {
    const normalizedCity = city
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .at(-1);

    return {
      venue: text,
      city: normalizedCity || city,
      state
    };
  }

  return {
    venue: text,
    city: "",
    state: ""
  };
}

function inferEventFormat(location, description) {
  const combined = `${location || ""} ${description || ""}`.toLowerCase();

  if (combined.includes("online") || combined.includes("remoto") || combined.includes("virtual")) {
    return "online";
  }

  if (combined.includes("hibrid") || combined.includes("hybrid")) {
    return "hybrid";
  }

  return "in-person";
}

function inferEventKind(title, description) {
  const combined = `${title || ""} ${description || ""}`.toLowerCase();

  if (
    combined.includes("hackathon") ||
    combined.includes("game jam") ||
    combined.includes("ctf")
  ) {
    return "hackathon";
  }

  if (
    combined.includes("meetup") ||
    combined.includes("encontro") ||
    combined.includes("user group")
  ) {
    return "meetup";
  }

  if (
    combined.includes("workshop") ||
    combined.includes("bootcamp") ||
    combined.includes("masterclass")
  ) {
    return "workshop";
  }

  if (
    combined.includes("summit") ||
    combined.includes("forum") ||
    combined.includes("leaders")
  ) {
    return "summit";
  }

  if (combined.includes("conference") || combined.includes("conf") || combined.includes("day")) {
    return "conference";
  }

  return "other";
}

function inferCommunityCity(title, description) {
  const combined = normalizeText(`${title || ""} ${description || ""}`).toLowerCase();

  for (const city of CITY_HINTS) {
    if (combined.includes(normalizeText(city).toLowerCase())) {
      return city;
    }
  }

  return "";
}

function inferCommunityTags(title, description, website) {
  const combined = normalizeText(`${title || ""} ${website || ""}`).toLowerCase();
  const tags = new Set();

  const rules = [
    [/python|pyladies|grupy|pug/, ["python"]],
    [/gdg|google|android|firebase/, ["google"]],
    [/react|front end|frontend/, ["frontend"]],
    [/php/, ["php"]],
    [/java/, ["java"]],
    [/owasp|security|infosec|hack/, ["seguranca"]],
    [/cloud|kubernetes|cncf/, ["cloud"]],
    [/startup|valley|inovacao|empreendedor/, ["startups", "inovacao"]],
    [/games|game dev|indie game|pong/, ["games"]],
    [/ux|designer|design/, ["ux"]],
    [/software livre|open source|open-source|codigo aberto/, ["open-source"]],
    [/women|ladies|girls/, ["diversidade"]]
  ];

  for (const [pattern, values] of rules) {
    if (pattern.test(combined)) {
      values.forEach((value) => tags.add(value));
    }
  }

  return [...tags];
}

function yamlValue(value, indent = 0) {
  const padding = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) {
      return "[]";
    }

    return `\n${value.map((item) => `${padding}- ${yamlValue(item, indent + 2)}`).join("\n")}`;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (!value) {
    return '""';
  }

  return JSON.stringify(String(value));
}

function toFrontMatter(data) {
  const lines = ["---"];

  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${yamlValue(value, 2)}`);
  }

  lines.push("---");
  return `${lines.join("\n")}\n`;
}

async function clearGeneratedMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => fs.rm(path.join(dir, entry.name)))
  );
}

async function writeMarkdown(dir, slug, frontMatter, content) {
  const body = (content || "").replace(/\r\n/g, "\n").trim();
  const filePath = path.join(dir, `${slug}.md`);
  const output = `${toFrontMatter(frontMatter)}\n${body}\n`;
  await fs.writeFile(filePath, output, "utf8");
}

async function main() {
  console.log(`Importando fixtures de ${BACKEND_REPO}@${BACKEND_REF}...`);

  const [categoriesFixture, eventsFixture, communitiesFixture] = await Promise.all([
    fetchRepoJson(BACKEND_REPO, CATEGORY_SOURCE, BACKEND_REF),
    fetchRepoJson(BACKEND_REPO, EVENTS_SOURCE, BACKEND_REF),
    fetchRepoJson(BACKEND_REPO, COMMUNITIES_SOURCE, BACKEND_REF)
  ]);

  const categories = categoriesFixture
    .map((item) => ({
      id: item.pk,
      name: item.fields.nome,
      slug: slugify(item.fields.slug || item.fields.nome),
      description: item.fields.descricao || "",
      color: item.fields.cor || "#6B7280",
      order: item.fields.ordem || 999
    }))
    .sort((a, b) => a.order - b.order);

  const categoryById = new Map(categories.map((item) => [item.id, item]));

  await fs.writeFile(CATEGORIES_PATH, `${JSON.stringify(categories, null, 2)}\n`, "utf8");
  await clearGeneratedMarkdown(EVENTS_DIR);
  await clearGeneratedMarkdown(COMMUNITIES_DIR);

  const usedEventSlugs = new Set();
  const usedCommunitySlugs = new Set();

  for (const item of eventsFixture) {
    const fields = item.fields;
    const format = inferEventFormat(fields.local, fields.descricao);
    const location = parseEventLocation(fields.local, format);
    const slug = uniqueSlug(slugify(fields.titulo), usedEventSlugs);

    await writeMarkdown(
      EVENTS_DIR,
      slug,
      {
        title: fields.titulo,
        start_date: toDateOnly(fields.data_inicio),
        end_date: toDateOnly(fields.data_fim || fields.data_inicio),
        kind: inferEventKind(fields.titulo, fields.descricao),
        format,
        city: location.city,
        state: location.state,
        organizer: fields.organizacao || "",
        venue: location.venue,
        ticket_url: normalizeUrl(fields.link_compra),
        categories: (fields.categorias || [])
          .map((id) => categoryById.get(id)?.slug)
          .filter(Boolean),
        featured: Boolean(fields.is_featured),
        cover_image: normalizeUrl(fields.cover_photo_url),
        price: fields.valor || "",
        legacy_id: item.pk,
        priority: fields.priority_level || 0
      },
      fields.descricao
    );
  }

  for (const item of communitiesFixture) {
    const fields = item.fields;
    const slug = uniqueSlug(slugify(fields.nome), usedCommunitySlugs);

    await writeMarkdown(
      COMMUNITIES_DIR,
      slug,
      {
        title: fields.nome,
        state: fields.estado || "Nacional",
        city: inferCommunityCity(fields.nome, fields.descricao),
        website: normalizeUrl(fields.url_site),
        instagram: normalizeUrl(fields.url_insta),
        linkedin: normalizeUrl(fields.url_linkedin),
        telegram: normalizeUrl(fields.url_telegram),
        whatsapp: normalizeUrl(fields.url_whatsapp),
        tags: inferCommunityTags(fields.nome, fields.descricao, fields.url_site),
        featured: false,
        cover_image: normalizeUrl(fields.cover_photo_url),
        legacy_id: item.pk
      },
      fields.descricao
    );
  }

  console.log(
    `Importacao concluida: ${eventsFixture.length} eventos, ${communitiesFixture.length} comunidades e ${categories.length} categorias.`
  );
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error("\nFalha ao importar fixtures do backend.\n");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export {
  decodeContent,
  fetchRepoJson,
  inferCommunityCity,
  inferCommunityTags,
  inferEventFormat,
  inferEventKind,
  main,
  normalizeText,
  normalizeUrl,
  parseEventLocation,
  resolveGhBinary,
  slugify,
  toFrontMatter,
  uniqueSlug,
  yamlValue
};
