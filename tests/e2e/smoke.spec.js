const { expect, test } = require("@playwright/test");
const {
  expectResultsCountMatches,
  expectVisibleCardTitlesToContain,
  expectVisibleCardsToMatchDataset,
  getFirstVisibleCardTitle,
  pickFirstNonEmptyOption
} = require("./helpers/listing");

test("home renderiza navegacao principal e CTAs", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Baião Tech"
    })
  ).toBeVisible();
  await expect(page.getByText(/Próximo evento/i)).toBeVisible();

  const headerMetrics = await page.locator(".site-header").evaluate((header) => {
    const rect = header.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth
    };
  });
  expect(headerMetrics.left).toBe(0);
  expect(headerMetrics.right).toBeGreaterThanOrEqual(headerMetrics.viewport - 1);

  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Eventos" }).click();
  await expect(page).toHaveURL(/\/eventos\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Encontre o próximo evento/i
    })
  ).toBeVisible();

  await page.goto("/");
  await page.locator(".hero-home__actions").getByRole("link", { name: "Ver comunidades" }).click();
  await expect(page).toHaveURL(/\/comunidades\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Encontre comunidades tech por estado, cidade ou tema\./i
    })
  ).toBeVisible();
});

test("home mantém conteúdo essencial visível sem JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Baião Tech" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver eventos" })).toBeVisible();

  await context.close();
});

test.describe("navegacao mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre o menu hamburguer e navega", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: "Abrir menu" });
    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Comunidades" }).click();

    await expect(page).toHaveURL(/\/comunidades\/$/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

test("eventos desktop filtra por busca e abre detalhes", async ({ page }) => {
  await page.goto("/eventos/");

  const root = page.locator("[data-list-root]");
  await page.locator(".listing-shell").scrollIntoViewIfNeeded();

  const filterPanelMetrics = await page.locator(".filter-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      overflowY: getComputedStyle(panel).overflowY,
      viewport: window.innerHeight
    };
  });
  expect(filterPanelMetrics.bottom).toBeLessThanOrEqual(filterPanelMetrics.viewport + 1);
  expect(filterPanelMetrics.overflowY).toBe("auto");

  const initialVisible = await expectResultsCountMatches(root);
  expect(initialVisible).toBeGreaterThan(0);

  const firstTitle = await getFirstVisibleCardTitle(root);
  await page.locator("[data-filter-search]").fill(firstTitle);
  await expect(page.locator("[data-results-count]")).toHaveText("1");

  const filteredVisible = await expectResultsCountMatches(root);
  expect(filteredVisible).toBeGreaterThan(0);
  expect(filteredVisible).toBeLessThanOrEqual(initialVisible);
  await expectVisibleCardTitlesToContain(root, firstTitle);

  await root.locator("[data-card]:not([hidden]) .text-link", { hasText: "Detalhes" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();

  const detailImage = page.locator(".detail-intro__media img");
  await expect(detailImage).toBeVisible();
  await expect.poll(async () => detailImage.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  const detailLayout = await page.evaluate(() => {
    const title = document.querySelector(".detail-intro h1");
    const media = document.querySelector(".detail-intro__media");
    const titleRect = title.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();

    return {
      overlaps:
        titleRect.right > mediaRect.left &&
        titleRect.left < mediaRect.right &&
        titleRect.bottom > mediaRect.top &&
        titleRect.top < mediaRect.bottom
    };
  });
  expect(detailLayout.overlaps).toBe(false);

  const eventShareHref = await page.getByRole("link", { name: "Compartilhar no WhatsApp" }).getAttribute("href");
  const eventShareUrl = new URL(eventShareHref);
  expect(`${eventShareUrl.origin}${eventShareUrl.pathname}`).toBe("https://wa.me/");
  expect(eventShareUrl.searchParams.get("text")).toContain(firstTitle);

  const googleAgendaHref = await page.getByRole("link", { name: "Adicionar ao Google Agenda" }).getAttribute("href");
  const googleAgendaUrl = new URL(googleAgendaHref);
  expect(googleAgendaUrl.origin).toBe("https://calendar.google.com");
  expect(googleAgendaUrl.searchParams.get("action")).toBe("TEMPLATE");
  expect(googleAgendaUrl.searchParams.get("dates")).toMatch(/^\d{8}\/\d{8}$/);

  const icsHref = await page.getByRole("link", { name: "Baixar .ics" }).getAttribute("href");
  expect(icsHref).toMatch(/\/eventos\/[^/]+\/agenda\.ics$/);
  const icsResponse = await page.request.get(new URL(icsHref, page.url()).toString());
  expect(icsResponse.ok()).toBe(true);
  expect(await icsResponse.text()).toContain("BEGIN:VCALENDAR");
});

test.describe("eventos mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre o painel de filtros, aplica estado e fecha o drawer", async ({ page }) => {
    await page.goto("/eventos/");

    const root = page.locator("[data-list-root]");
    const toggle = page.locator("[data-filter-toggle]");
    const stateSelect = page.locator('[data-filter-key="state"]');
    const stateOption = await pickFirstNonEmptyOption(stateSelect);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    await stateSelect.selectOption(stateOption.value);
    await page.getByRole("button", { name: "Aplicar filtros" }).click();

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(root).not.toHaveClass(/filters-open/);
    await expectResultsCountMatches(root);
    await expectVisibleCardsToMatchDataset(root, "state", stateOption.value);
  });
});

test("comunidades desktop filtra por busca e abre detalhes", async ({ page }) => {
  await page.goto("/comunidades/");

  const root = page.locator("[data-list-root]");
  const initialVisible = await expectResultsCountMatches(root);
  expect(initialVisible).toBeGreaterThan(0);

  const firstTitle = await getFirstVisibleCardTitle(root);
  await page.locator("[data-filter-search]").fill(firstTitle);
  await expect(page.locator("[data-results-count]")).toHaveText("1");

  const filteredVisible = await expectResultsCountMatches(root);
  expect(filteredVisible).toBeGreaterThan(0);
  expect(filteredVisible).toBeLessThanOrEqual(initialVisible);
  await expectVisibleCardTitlesToContain(root, firstTitle);

  await root.locator("[data-card]:not([hidden]) .text-link", { hasText: "Detalhes" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: firstTitle })).toBeVisible();

  const communityShareHref = await page.getByRole("link", { name: "Compartilhar no WhatsApp" }).getAttribute("href");
  const communityShareUrl = new URL(communityShareHref);
  expect(`${communityShareUrl.origin}${communityShareUrl.pathname}`).toBe("https://wa.me/");
  expect(communityShareUrl.searchParams.get("text")).toContain(firstTitle);
});

test("comunidades desktop aplica filtro de estado real", async ({ page }) => {
  await page.goto("/comunidades/");

  const root = page.locator("[data-list-root]");
  const stateSelect = page.locator('[data-filter-key="state"]');
  const stateOption = await pickFirstNonEmptyOption(stateSelect);

  await stateSelect.selectOption(stateOption.value);

  await expectResultsCountMatches(root);
  await expectVisibleCardsToMatchDataset(root, "state", stateOption.value);
});

test("contribuir desktop mantem layout sem overflow horizontal", async ({ page }) => {
  await page.goto("/como-contribuir/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Como sugerir um evento ou uma comunidade\./i
    })
  ).toBeVisible();
  await expect(page.locator(".contribute-section")).toHaveCount(2);

  const metrics = await page.evaluate(() => {
    const sections = [...document.querySelectorAll(".contribute-section")].map((section) => {
      const rect = section.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width
      };
    });

    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sections
    };
  });

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  for (const section of metrics.sections) {
    expect(section.left).toBeGreaterThanOrEqual(0);
    expect(section.right).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }
});

test.describe("contribuir mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("empilha o conteudo sem estouro horizontal", async ({ page }) => {
    await page.goto("/como-contribuir/");

    await expect(page.locator(".contribute-section")).toHaveCount(2);

    const metrics = await page.evaluate(() => {
      const sections = [...document.querySelectorAll(".contribute-section")].map((section) => {
        const rect = section.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right
        };
      });

      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sections
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    for (const section of metrics.sections) {
      expect(section.left).toBeGreaterThanOrEqual(0);
      expect(section.right).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
  });
});
