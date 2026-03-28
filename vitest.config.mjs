import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.{js,mjs}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "scripts/event-intake/**/*.mjs",
        "scripts/generate-event-source-candidates.mjs",
        "lib/event-dates.js",
        "site.config.js",
        "src/assets/js/site.js",
        "src/assets/js/list-filters.js",
        "src/content/events/events.11tydata.js",
        "src/content/communities/communities.11tydata.js",
        "scripts/prune-past-events.mjs"
      ]
    }
  }
});
