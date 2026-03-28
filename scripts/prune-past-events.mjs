import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import matter from "gray-matter";

import eventDates from "../lib/event-dates.js";

const { EVENT_TIME_ZONE, getDateKeyInTimeZone, getEventBoundaryDateKey, isPastEventByDate } =
  eventDates;

const EVENTS_GLOB = "src/content/events/*.md";

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce(
    (options, argument) => {
      if (argument === "--write") {
        options.write = true;
      } else if (argument === "--dry-run") {
        options.write = false;
      } else if (argument.startsWith("--today=")) {
        options.todayKey = argument.slice("--today=".length);
      }

      return options;
    },
    { write: false, todayKey: "" }
  );
}

export async function collectPastEventFiles({
  cwd = process.cwd(),
  glob = EVENTS_GLOB,
  todayKey = getDateKeyInTimeZone(new Date(), EVENT_TIME_ZONE)
} = {}) {
  const eventPaths = await fg(glob, { cwd });
  const expiredEvents = [];

  for (const relativePath of eventPaths) {
    const filePath = path.join(cwd, relativePath);
    const source = await fs.readFile(filePath, "utf8");
    const document = matter(source);

    if (!isPastEventByDate(document.data, { todayKey, timeZone: EVENT_TIME_ZONE })) {
      continue;
    }

    expiredEvents.push({
      filePath,
      relativePath,
      title: document.data.title || path.basename(relativePath),
      endDate: getEventBoundaryDateKey(document.data)
    });
  }

  return expiredEvents.sort((left, right) => {
    return left.endDate.localeCompare(right.endDate) || left.relativePath.localeCompare(right.relativePath);
  });
}

export async function prunePastEventFiles(options = {}) {
  const expiredEvents = await collectPastEventFiles(options);

  if (options.write) {
    await Promise.all(expiredEvents.map((event) => fs.unlink(event.filePath)));
  }

  return expiredEvents;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const todayKey = options.todayKey || getDateKeyInTimeZone(new Date(), EVENT_TIME_ZONE);
  const expiredEvents = await prunePastEventFiles({ write: options.write, todayKey });

  if (!expiredEvents.length) {
    console.log(
      `Nenhum evento expirado para remover em ${todayKey} (${EVENT_TIME_ZONE}).`
    );
    return;
  }

  const actionLabel = options.write ? "Removendo" : "Eventos expirados encontrados";
  console.log(`${actionLabel}: ${expiredEvents.length} arquivo(s) com fim antes de ${todayKey}.`);

  for (const event of expiredEvents) {
    console.log(`- ${event.endDate} ${event.title} -> ${event.relativePath}`);
  }

  if (!options.write) {
    console.log("Use --write para apagar esses arquivos.");
  }
}

const isCliEntry =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
