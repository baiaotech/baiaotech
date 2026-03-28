# Baião Tech

Agenda de eventos e diretório de comunidades de tecnologia, construída com Eleventy.

## Stack

- Eleventy para geração estática
- Markdown por item em `src/content/events/` e `src/content/communities/`
- Categorias centralizadas em `src/_data/categories.json`
- GitHub Actions para validação e deploy

## Scripts

- `npm run dev` inicia o servidor local
- `npm run validate` valida o conteúdo em Markdown
- `npm run build` valida e gera o site em `_site`
- `npm run test:unit` roda os testes unitários com Vitest
- `npm run test:coverage` gera cobertura LCOV em `coverage/lcov.info`
- `npm run test:e2e:install` instala o Chromium do Playwright e tenta preparar dependências nativas
- `npm run test:e2e` gera o site e roda a suíte smoke E2E
- `npm run test:e2e:headed` gera o site e roda a suíte smoke em modo visual
- `npm run import:backend` importa os fixtures iniciais de `baiaotech/BackendBaiaoTech`
- `npm run sync:community-covers` baixa as capas de comunidades do WordPress atual para assets locais

## Testes E2E

A suíte E2E usa Playwright contra o site já buildado em `_site`, servido localmente em HTTP simples.

Fluxo recomendado:

- `npm run test:e2e:install`
- `npm run test:e2e`

Para depuração local com browser aberto:

- `npm run test:e2e:headed`

Para abrir o relatório HTML após uma execução:

- `npx playwright show-report output/playwright/report`

Observações de ambiente:

- Em Linux, o instalador tenta usar `npx playwright install --with-deps chromium`
- Se `sudo` não estiver disponível de forma não interativa, o bootstrap cai para `npx playwright install chromium` e prepara bibliotecas locais em `.cache/playwright-linux-libs`
- Artefatos de falha ficam em `output/playwright/`

## Cobertura e SonarCloud

O SonarCloud importa cobertura a partir de `coverage/lcov.info`.

Fluxo recomendado antes de subir mudanças de JavaScript:

- `npm run test:unit`
- `npm run test:coverage`
- `npm run test:e2e`

## Estrutura editorial

- Novo evento: adicionar um arquivo Markdown em `src/content/events/`
- Nova comunidade: adicionar um arquivo Markdown em `src/content/communities/`
- Categorias: editar `src/_data/categories.json`
- Capas de comunidade: usar assets locais em `src/assets/covers/communities/`
- Capas de evento: opcionais; se não houver asset local, o layout continua sem imagem

Modelos de conteúdo:

- `docs/templates/event-template.md`
- `docs/templates/community-template.md`

## Importação inicial

O script `npm run import:backend` usa o `gh` CLI autenticado para buscar:

- `eventos/fixtures/categorias.json`
- `eventos/fixtures/eventos.json`
- `eventos/fixtures/comunidades.json`

Por padrão, a origem é `baiaotech/BackendBaiaoTech@main`.

Variáveis opcionais:

- `BACKEND_REPO`
- `BACKEND_REF`

## GitHub Pages

O deploy usa workflow customizado com GitHub Actions.

- O workflow lê `base_url` e `base_path` diretamente do `actions/configure-pages`
- Em domínio customizado, o build passa a usar automaticamente a origem do domínio e `PATH_PREFIX=/`
- Em project site padrão do GitHub Pages, o build usa automaticamente o subpath do repositório
