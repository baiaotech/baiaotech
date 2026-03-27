import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import matter from "gray-matter";

const ROOT = process.cwd();
const COMMUNITIES_DIR = path.join(ROOT, "src/content/communities");
const OUTPUT_DIR = path.join(ROOT, "src/assets/covers/communities");
const WORDPRESS_ENDPOINT =
  "https://baiaotech.org/wp-json/wp/v2/comunidades?per_page=100&_embed";

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function inferExtension(url, contentType) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();

  if (extension) {
    return extension;
  }

  if (contentType?.includes("image/jpeg")) {
    return ".jpg";
  }

  if (contentType?.includes("image/png")) {
    return ".png";
  }

  if (contentType?.includes("image/webp")) {
    return ".webp";
  }

  if (contentType?.includes("image/svg+xml")) {
    return ".svg";
  }

  return ".img";
}

function getFeaturedMedia(post) {
  return post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "";
}

async function fetchWordpressCommunities() {
  const response = await fetch(WORDPRESS_ENDPOINT, {
    headers: {
      "User-Agent": "baiaotech-community-cover-sync/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar comunidades do WordPress: ${response.status}`);
  }

  return response.json();
}

async function removeSiblingAssets(baseName, keepName) {
  const entries = await fs.readdir(OUTPUT_DIR, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => entry.name.startsWith(`${baseName}.`))
      .filter((entry) => entry.name !== keepName)
      .map((entry) => fs.unlink(path.join(OUTPUT_DIR, entry.name)))
  );
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const wordpressCommunities = await fetchWordpressCommunities();
  const wordpressByTitle = new Map(
    wordpressCommunities.map((item) => [normalizeTitle(item.title?.rendered), item])
  );

  const files = (await fs.readdir(COMMUNITIES_DIR))
    .filter((file) => file.endsWith(".md"))
    .sort();

  let synced = 0;
  let withoutMedia = 0;

  for (const file of files) {
    const filePath = path.join(COMMUNITIES_DIR, file);
    const source = await fs.readFile(filePath, "utf8");
    const document = matter(source);
    const normalizedTitle = normalizeTitle(document.data.title);
    const wordpressEntry = wordpressByTitle.get(normalizedTitle);

    if (!wordpressEntry) {
      throw new Error(`Comunidade sem correspondencia no WordPress: ${document.data.title}`);
    }

    const mediaUrl = getFeaturedMedia(wordpressEntry);
    let localCoverPath = "";

    if (mediaUrl) {
      const mediaResponse = await fetch(mediaUrl, {
        headers: {
          "User-Agent": "baiaotech-community-cover-sync/1.0"
        }
      });

      if (!mediaResponse.ok) {
        throw new Error(
          `Falha ao baixar capa de ${document.data.title}: ${mediaResponse.status}`
        );
      }

      const extension = inferExtension(
        mediaUrl,
        mediaResponse.headers.get("content-type") || ""
      );
      const baseName = path.basename(file, ".md");
      const assetName = `${baseName}${extension}`;
      const assetPath = path.join(OUTPUT_DIR, assetName);
      const buffer = Buffer.from(await mediaResponse.arrayBuffer());

      await removeSiblingAssets(baseName, assetName);
      await fs.writeFile(assetPath, buffer);

      localCoverPath = `/assets/covers/communities/${assetName}`;
      synced += 1;
    } else {
      withoutMedia += 1;
    }

    const updatedData = {
      ...document.data,
      cover_image: localCoverPath
    };

    const updatedSource = matter.stringify(document.content.trimStart(), updatedData);
    await fs.writeFile(filePath, updatedSource);
  }

  console.log(
    `Capas sincronizadas: ${synced} comunidades com imagem, ${withoutMedia} sem imagem.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
