const fs = require("node:fs");
const matter = require("gray-matter");

const {
  isFutureOrCurrentEventByDate
} = require("./lib/event-dates.js");
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

  eleventyConfig.addFilter("absoluteUrl", (path) => {
    return new URL(path, `${site.siteUrl}/`).toString();
  });

  eleventyConfig.addFilter("localAsset", (value) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.startsWith("/assets/") ? value : "";
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
