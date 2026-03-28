# Baião Tech

Agenda de eventos e diretório de comunidades de tecnologia do Nordeste, gerado com Eleventy e publicado no GitHub Pages.

## Visão geral

- conteúdo editorial em Markdown dentro de `src/content/events/` e `src/content/communities/`
- categorias centralizadas em `src/_data/categories.json`
- validação local e em CI antes do build
- suíte smoke E2E com Playwright contra o site já buildado
- intake automático de eventos com fontes curadas, Gemini e PRs automáticos
- limpeza automática de eventos passados com base em `America/Fortaleza`

## Stack

- Node.js 20+
- Eleventy
- Vitest + cobertura LCOV
- Playwright
- GitHub Actions
- SonarQube Cloud

## Estrutura do projeto

- `src/content/events/`: eventos em Markdown
- `src/content/communities/`: comunidades em Markdown
- `src/_data/categories.json`: taxonomia oficial de categorias dos eventos
- `src/assets/`: CSS, JS, favicon e capas locais
- `scripts/`: validação, intake, prune e automações auxiliares
- `.github/workflows/`: CI, deploy, Sonar, intake e prune
- `docs/templates/`: modelos de front matter para eventos e comunidades

## Scripts

- `npm run dev`: sobe o site local com Eleventy
- `npm run validate`: valida front matter e corpo Markdown
- `npm run build`: valida e gera o site em `_site`
- `npm run build:site`: gera o site sem rodar a validação antes
- `npm run build:e2e`: build isolado para a suíte E2E
- `npm run test:unit`: roda os testes unitários
- `npm run test:coverage`: roda a suíte unitária com LCOV em `coverage/lcov.info`
- `npm run test:e2e:install`: instala o Chromium do Playwright e tenta preparar dependências nativas
- `npm run test:e2e`: roda a suíte smoke contra `_site`
- `npm run test:e2e:headed`: roda a suíte smoke com browser visível
- `npm run event-intake`: roda o intake de eventos em dry-run local
- `npm run event-sources:candidates`: regenera a lista auxiliar de fontes candidatas a partir das comunidades
- `npm run events:prune:check`: mostra quais eventos já expiraram
- `npm run events:prune`: remove eventos com `end_date` anterior à data atual em `America/Fortaleza`
- `npm run import:backend`: importador legado de bootstrap a partir de `BackendBaiaoTech`
- `npm run sync:community-covers`: baixa capas de comunidades para assets locais

## Fluxo local recomendado

Para mudanças de conteúdo:

- `npm run validate`
- `npm run build`

Para mudanças em JS, templates, workflows ou intake:

- `npm run test:unit`
- `npm run test:coverage`
- `npm run test:e2e`

Para abrir o relatório HTML do Playwright:

- `npx playwright show-report output/playwright/report`

## Regras editoriais

### Eventos

Cada arquivo em `src/content/events/` precisa de:

- `title`
- `start_date` e `end_date` em `YYYY-MM-DD`
- `kind`
- `format`
- `city`
- `state`
- `organizer`
- `venue`
- `ticket_url`
- ao menos uma categoria existente em `src/_data/categories.json`
- corpo Markdown não vazio

Campos aceitos e úteis:

- `featured`
- `cover_image`
- `price`
- `source_name`
- `source_url`

Observações:

- se `source_url` estiver presente, `source_name` também é obrigatório
- `cover_image` pode ser URL externa ou caminho local em `/assets/`
- para contribuições manuais, prefira capas locais quando possível

### Comunidades

Cada arquivo em `src/content/communities/` precisa de:

- `title`
- `state`
- `city`
- corpo Markdown não vazio

Campos opcionais:

- `website`
- `instagram`
- `linkedin`
- `telegram`
- `whatsapp`
- `tags`
- `featured`
- `cover_image`

## Modelos de conteúdo

- [Template de evento](/home/gaellopes/baiaotech/docs/templates/event-template.md)
- [Template de comunidade](/home/gaellopes/baiaotech/docs/templates/community-template.md)

## GitHub Actions

### CI

Workflow: `.github/workflows/ci.yml`

- instala dependências com `npm ci --ignore-scripts`
- roda `npm run validate`
- roda `npm run test:unit`
- roda smoke E2E com Playwright
- publica artefatos do Playwright em caso de falha

### Deploy GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml`

- usa `actions/configure-pages` para obter `base_url` e `base_path`
- builda o site com o contexto correto de Pages
- publica `_site` no GitHub Pages

### SonarQube Cloud

Workflow: `.github/workflows/sonarcloud.yml`

- gera LCOV com `npm run test:coverage`
- executa o scanner
- alimenta o check `SonarCloud Code Analysis`

### Event Intake

Workflow: `.github/workflows/event-intake.yml`

- roda por cron e por `workflow_dispatch`
- usa a lista de fontes inline no próprio workflow
- usa `GEMINI_API_KEY` com `gemini-2.5-flash-lite`
- usa `TOKEN_FOR_CI_EVENTS` para PRs, issues e sincronização do blacklist

### Prune Past Events

Workflow: `.github/workflows/prune-past-events.yml`

- roda diariamente
- remove eventos vencidos em `src/content/events/`
- valida e faz commit automático se houver limpeza

## Intake automático de eventos

O intake foi desenhado para buscar eventos do Nordeste com foco em tecnologia ou carreira em tecnologia.

### O que ele faz

- combina buscas regionais e seeds curadas
- tenta extrair dados determinísticos antes de chamar IA
- normaliza o evento com Gemini
- deduplica contra os eventos já existentes no repositório
- usa blacklist versionado em `data/event-intake-blacklist.ndjson`
- usa feedback humano anterior para não reabrir lixo já rejeitado

### Regras atuais

- só considera eventos do Nordeste
- só aceita eventos `in-person` ou `hybrid`
- descarta eventos passados usando `America/Fortaleza`
- só aceita eventos cujo tema central seja tecnologia ou carreira em tecnologia
- temas ambíguos ou não-tech entram como descarte, não como issue
- páginas de listagem e grupos sem evento concreto não devem virar issue
- eventos fora do Nordeste só entram se a localização estiver confirmada deterministicamente na página do evento

### Saída

- alta confiança: abre ou atualiza PR de evento
- baixa confiança, mas ainda tech: abre issue `event-intake`
- descartes por política entram no blacklist

### Observação sobre reviewer

O workflow tenta usar `gabrielldn` como reviewer padrão, mas o GitHub não permite pedir review do próprio autor da PR. Se `TOKEN_FOR_CI_EVENTS` pertencer ao mesmo usuário que abre a PR, o pedido de review será ignorado pelo GitHub.

### Rodando manualmente no GitHub

No `workflow_dispatch` do `Event Intake`:

- `apply=false`: só simula e publica artefatos
- `apply=true`: persiste PRs/issues e pode sincronizar o blacklist no `main`
- `cache_bust=true`: ignora o cache persistido daquela rodada

Os artefatos do intake ficam em `output/event-intake/`:

- `latest.json`
- `summary.md`
- `perf.json`

## Importação inicial do backend

O script `npm run import:backend` ainda existe como bootstrap legado, mas o fluxo principal do projeto já não depende dele.

Ele usa `gh` autenticado para buscar fixtures do repositório `baiaotech/BackendBaiaoTech`.

Variáveis opcionais:

- `BACKEND_REPO`
- `BACKEND_REF`

## Domínio e publicação

- o deploy em Pages funciona tanto para project site quanto para domínio customizado
- no domínio customizado, o build usa `PATH_PREFIX=/`
- no project site padrão do GitHub Pages, o build usa automaticamente o subpath do repositório
