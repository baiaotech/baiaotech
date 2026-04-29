const fs = require("node:fs");
const matter = require("gray-matter");

const {
  isFutureOrCurrentEventByDate
} = require("./lib/event-dates.js");
const {
  buildEventIcsPath,
  buildGoogleCalendarUrl,
  buildIcsEvent,
  buildWhatsAppShareUrl
} = require("./lib/calendar-actions.js");
const { getSiteConfig } = require("./site.config.js");

const site = getSiteConfig();

const stateNames = {
  AL: "Alagoas",
  BA: "Bahia",
  CE: "Ceara",
  MA: "Maranhao",
  PB: "Paraiba",
  PE: "Pernambuco",
  PI: "Piaui",
  RN: "Rio Grande do Norte",
  SE: "Sergipe",
  Nacional: "Nacional",
  Online: "Online"
};

const kindLabels = {
  conference: "Conferencia",
  meetup: "Meetup",
  hackathon: "Hackathon",
  workshop: "Workshop",
  summit: "Summit",
  other: "Outro"
};

const formatLabels = {
  "in-person": "Presencial",
  online: "Online",
  hybrid: "Hibrido"
};

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }

  return new Date(value);
}

function sortByEventDate(a, b) {
  return parseDate(a.data.start_date) - parseDate(b.data.start_date);
}

function sortByCommunity(a, b) {
  const left = `${a.data.state || ""} ${a.data.title || ""}`;
  const right = `${b.data.state || ""} ${b.data.title || ""}`;
  return left.localeCompare(right, "pt-BR");
}

function isFutureEvent(item) {
  return isFutureOrCurrentEventByDate(item.data);
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function isTagNameChar(char) {
  if (!char) {
    return false;
  }

  const code = char.charCodeAt(0);

  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    char === ":" ||
    char === "-"
  );
}

function isWhitespace(char) {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
}

function readHtmlTag(input, startIndex) {
  if (input[startIndex] !== "<") {
    return null;
  }

  const endIndex = input.indexOf(">", startIndex + 1);

  if (endIndex === -1) {
    return null;
  }

  let cursor = startIndex + 1;

  while (cursor < endIndex && isWhitespace(input[cursor])) {
    cursor += 1;
  }

  const closing = input[cursor] === "/";

  if (closing) {
    cursor += 1;
  }

  while (cursor < endIndex && isWhitespace(input[cursor])) {
    cursor += 1;
  }

  const nameStart = cursor;

  while (cursor < endIndex && isTagNameChar(input[cursor])) {
    cursor += 1;
  }

  return {
    closing,
    endIndex,
    name: input.slice(nameStart, cursor).toLowerCase()
  };
}

function stripHtml(value) {
  const input = String(value || "");
  let output = "";
  let rawTextTag = "";
  let index = 0;

  while (index < input.length) {
    if (rawTextTag) {
      if (input[index] === "<") {
        const tag = readHtmlTag(input, index);

        if (tag?.closing && tag.name === rawTextTag) {
          rawTextTag = "";
          index = tag.endIndex + 1;
          continue;
        }
      }

      index += 1;
      continue;
    }

    if (input[index] === "<") {
      const tag = readHtmlTag(input, index);

      if (tag) {
        if (!tag.closing && (tag.name === "script" || tag.name === "style")) {
          rawTextTag = tag.name;
        }

        output += " ";
        index = tag.endIndex + 1;
        continue;
      }
    }

    output += input[index];
    index += 1;
  }

  return output.replace(/\s+/g, " ").trim();
}

function summarizeText(value, maxLength = 156) {
  const text = stripHtml(value);

  if (text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 80 ? lastSpace : slice.length).trim()}...`;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch (e) {
    return false;
  }
}

function getPrefixedAsset(value) {
  if (typeof value !== "string" || !value.startsWith("/assets/")) {
    return "";
  }

  if (site.pathPrefix === "/") {
    return value;
  }

  return `${site.pathPrefix.slice(0, -1)}${value}`;
}

function getDisplayImage(value) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.startsWith("/assets/")) {
    return getPrefixedAsset(value);
  }

  return isHttpsUrl(value) ? value : "";
}

function getAbsoluteImage(value) {
  if (typeof value !== "string") {
    return "";
  }

  if (value.startsWith("/assets/")) {
    return new URL(value, `${site.siteUrl}/`).toString();
  }

  return isHttpsUrl(value) ? value : "";
}

function getAbsoluteUrl(path) {
  return new URL(path, `${site.siteUrl}/`).toString();
}

function getLocationLabel(venue, city, state) {
  const territory = [city, stateNames[state] || state].filter(Boolean).join(", ");
  return [venue, territory].filter(Boolean).join(" - ");
}

const eventFrontMatterCache = new Map();

function getEventFrontMatter(inputPath) {
  if (!inputPath) {
    return {};
  }

  if (!eventFrontMatterCache.has(inputPath)) {
    const source = fs.readFileSync(inputPath, "utf8");
    eventFrontMatterCache.set(inputPath, matter(source).data);
  }

  return eventFrontMatterCache.get(inputPath);
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.addCollection("eventsSorted", (collectionApi) => {
    return collectionApi.getFilteredByGlob("src/content/events/*.md").sort(sortByEventDate);
  });

  eleventyConfig.addCollection("eventsFuture", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/events/*.md")
      .filter(isFutureEvent)
      .sort(sortByEventDate);
  });

  eleventyConfig.addCollection("eventsPast", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/events/*.md")
      .filter((item) => !isFutureEvent(item))
      .sort((a, b) => sortByEventDate(b, a));
  });

  eleventyConfig.addCollection("communitiesSorted", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/communities/*.md")
      .sort(sortByCommunity);
  });

  eleventyConfig.addCollection("featuredCommunities", (collectionApi) => {
    const communities = collectionApi
      .getFilteredByGlob("src/content/communities/*.md")
      .sort(sortByCommunity);
    const featured = communities.filter((item) => item.data.featured);
    return (featured.length ? featured : communities).slice(0, 6);
  });

  eleventyConfig.addCollection("sitemapPages", (collectionApi) => {
    return collectionApi
      .getAll()
      .filter((item) => item.url && !item.data.excludeFromSitemap)
      .sort((a, b) => a.url.localeCompare(b.url, "pt-BR"));
  });

  eleventyConfig.addFilter("readableDate", (value) => {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(parseDate(value));
  });

  eleventyConfig.addFilter("eventDateRange", (start, end) => {
    if (!start) {
      return "";
    }

    const startDate = parseDate(start);
    const endDate = parseDate(end || start);

    const formatter = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    if (startDate.toDateString() === endDate.toDateString()) {
      return formatter.format(startDate);
    }

    const sameMonth =
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getFullYear() === endDate.getFullYear();

    if (sameMonth) {
      return `${new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit"
      }).format(startDate)}–${formatter.format(endDate)}`;
    }

    return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
  });

  eleventyConfig.addFilter("stateName", (value) => {
    return stateNames[value] || value || "";
  });

  eleventyConfig.addFilter("dayNumber", (value) => {
    const date = parseDate(value);
    return date
      ? new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit"
        }).format(date)
      : "";
  });

  eleventyConfig.addFilter("monthShort", (value) => {
    const date = parseDate(value);
    return date
      ? new Intl.DateTimeFormat("pt-BR", {
          month: "short"
        }).format(date)
      : "";
  });

  eleventyConfig.addFilter("eventMonths", (items) => {
    const seen = new Set();

    return items.reduce((months, item) => {
      const date = parseDate(item.data.start_date);

      if (!date) {
        return months;
      }

      const value = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`;

      if (seen.has(value)) {
        return months;
      }

      seen.add(value);
      months.push({
        value,
        label: formatMonthLabel(date)
      });

      return months;
    }, []);
  });

  eleventyConfig.addFilter("uniqueStates", (items) => {
    return [...new Set(items.map((item) => item.data.state).filter(Boolean))].sort(
      (a, b) => (stateNames[a] || a).localeCompare(stateNames[b] || b, "pt-BR")
    );
  });

  eleventyConfig.addFilter("priceLabel", (value) => {
    if (value === undefined || value === null || value === "") {
      return "";
    }

    const numeric = Number(value);

    if (!Number.isNaN(numeric) && numeric === 0) {
      return "Gratuito";
    }

    if (!Number.isNaN(numeric)) {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
      }).format(numeric);
    }

    return String(value);
  });

  eleventyConfig.addFilter("isFutureDate", (value) => {
    return isFutureOrCurrentEventByDate({ end_date: value });
  });

  eleventyConfig.addFilter("kindLabel", (value) => kindLabels[value] || value || "");

  eleventyConfig.addFilter(
    "formatLabel",
    (value) => formatLabels[value] || value || ""
  );

  eleventyConfig.addFilter("absoluteUrl", getAbsoluteUrl);

  eleventyConfig.addFilter("whatsAppShareUrl", (path, title) => {
    return buildWhatsAppShareUrl(title, getAbsoluteUrl(path));
  });

  eleventyConfig.addFilter(
    "googleCalendarUrl",
    (path, title, startDate, endDate, description, venue, city, state) => {
      return buildGoogleCalendarUrl({
        description,
        endDate,
        location: getLocationLabel(venue, city, state),
        startDate,
        title,
        url: getAbsoluteUrl(path)
      });
    }
  );

  eleventyConfig.addFilter("eventIcsPath", buildEventIcsPath);

  eleventyConfig.addFilter("eventIcs", (event) => {
    return buildIcsEvent({
      description: summarizeText(event.templateContent),
      endDate: event.data.end_date,
      location: getLocationLabel(event.data.venue, event.data.city, event.data.state),
      slug: event.fileSlug,
      startDate: event.data.start_date,
      title: event.data.title,
      url: getAbsoluteUrl(event.url)
    });
  });

  eleventyConfig.addFilter("localAsset", (value) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.startsWith("/assets/") ? value : "";
  });

  eleventyConfig.addFilter("displayImage", getDisplayImage);

  eleventyConfig.addFilter("absoluteImage", (value) => {
    return getAbsoluteImage(value) || getAbsoluteImage(site.socialImage);
  });

  eleventyConfig.addFilter("plainText", stripHtml);

  eleventyConfig.addFilter("summaryText", summarizeText);

  eleventyConfig.addFilter("jsonify", (value) => {
    return JSON.stringify(value);
  });

  eleventyConfig.addFilter("eventCategorySlugs", (inputPath) => {
    const frontMatter = getEventFrontMatter(inputPath);
    return Array.isArray(frontMatter.categories) ? frontMatter.categories : [];
  });

  eleventyConfig.addFilter("eventCategoryLabels", (inputPath, categoriesBySlug) => {
    const categorySlugs = getEventFrontMatter(inputPath).categories;

    if (!Array.isArray(categorySlugs)) {
      return [];
    }

    return categorySlugs.map((slug) => categoriesBySlug?.[slug]?.name || slug);
  });

  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    pathPrefix: site.pathPrefix
  };
};
