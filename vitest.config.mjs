import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "site.config.js",
        "src/assets/js/site.js",
        "src/assets/js/list-filters.js",
        "src/content/events/events.11tydata.js",
        "src/content/communities/communities.11tydata.js",
        "scripts/import-backend-fixtures.mjs"
      ]
    }
  }
});
