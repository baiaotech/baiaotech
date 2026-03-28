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
- `npm run event-intake` roda o intake de eventos em modo dry-run
- `npm run event-sources:candidates` regenera a lista inicial de fontes candidatas a partir das comunidades atuais
- `npm run events:prune:check` lista quais eventos ja passaram e seriam removidos
- `npm run events:prune` apaga arquivos de eventos com `end_date` anterior a hoje em `America/Fortaleza`
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

## Intake automático de eventos

O repo agora inclui uma trilha de intake automático baseada em fontes confiáveis:

- registro inline de fontes dentro de `.github/workflows/event-intake.yml`
- candidatos derivados das comunidades atuais em `data/event-source-candidates.json` como referência auxiliar
- blacklist versionado em `data/event-intake-blacklist.ndjson`
- pipeline em `scripts/event-intake/`
- workflow agendado em `.github/workflows/event-intake.yml`

Como funciona:

- a descoberta combina buscas regionais em plataformas e seeds curadas de comunidades
- nao existe mais limite por fonte; o intake processa todos os candidatos descobertos em cada fonte e respeita apenas o teto global de URLs unicas por rodada
- o runtime usa cache persistido em `.cache/event-intake/` com `ETag`/`Last-Modified` para HTTP e snapshots com TTL para fontes renderizadas via browser
- hosts que responderem com `403`, `429` ou `5xx` entram em cooldown temporario para reduzir retries inutilmente caros
- o pipeline deduplica contra os eventos ja existentes em `src/content/events/` antes de abrir PR
- eventos rejeitados por politica (`past`, `online_only`, `non_northeast`, `non_tech`) entram no blacklist versionado e deixam de ser reprocessados nas rodadas seguintes
- o intake so aceita eventos cujo tema central seja tecnologia ou carreira em tecnologia; congressos e eventos de outras areas nao entram so por citar tecnologia
- issues `event-intake` fechadas e PRs `event-intake/*` fechadas sem merge alimentam automaticamente o filtro de rejeicao do intake
- o corte de data usa `America/Fortaleza` e descarta eventos cujo `end_date` ou `start_date` ja esteja antes da data atual
- o workflow busca eventos apenas no Nordeste e só cria PR para eventos `in-person` ou `hybrid`
- parsers determinísticos tentam extrair links e metadados antes da IA
- o Gemini 2.5 Flash Lite normaliza o evento para o schema do repo
- alta confiança abre um PR por evento com reviewer `gabrielldn`
- baixa confiança abre uma issue com label `event-intake`

Segredos usados no workflow:

- `GEMINI_API_KEY`
- `TOKEN_FOR_CI_EVENTS`

Para testar manualmente no GitHub:

- execute `Event Intake` via `workflow_dispatch`
- com `apply=false`, o workflow roda em dry-run e publica artefatos em `output/event-intake/`
- com `cache_bust=true`, o workflow ignora o cache persistido daquela rodada manual
- com `apply=true`, alem dos PRs/issues do intake, o workflow pode sincronizar o blacklist `NDJSON` no repo quando houver novos descartes por politica
- o artifact inclui `latest.json`, `summary.md` e `perf.json` com hits de cache, `304`, cooldowns e duracao por fase

Para testar localmente:

- exporte `EVENT_INTAKE_SOURCES_JSON` com um array JSON de fontes
- rode `npm run event-intake`

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

## Limpeza automática de eventos

O repositório tem um workflow agendado em `.github/workflows/prune-past-events.yml`.

- Ele roda diariamente às `03:15 UTC`, equivalente a `00:15` em `America/Fortaleza`
- Remove arquivos em `src/content/events/` cujo `end_date` seja anterior à data atual no timezone `America/Fortaleza`
- Valida e recompila o site antes de criar um commit automático com a limpeza
