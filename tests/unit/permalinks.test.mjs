import { describe, expect, it } from "vitest";
import communitiesData from "../../src/content/communities/communities.11tydata.js";
import eventsData from "../../src/content/events/events.11tydata.js";

describe("collection permalinks", () => {
  it("gera permalink de evento com slug da pagina", () => {
    expect(eventsData.permalink({ page: { fileSlug: "meu-evento" } })).toBe("eventos/meu-evento/index.html");
  });

  it("gera permalink de comunidade com slug da pagina", () => {
    expect(communitiesData.permalink({ page: { fileSlug: "minha-comunidade" } })).toBe(
      "comunidades/minha-comunidade/index.html"
    );
  });
});
