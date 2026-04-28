# AGENTS.md - Baião Tech

Este arquivo e o ponto de entrada para agentes de IA neste repositorio. Leia-o antes de editar qualquer arquivo.

## Projeto

Baião Tech e um site editorial em Eleventy para divulgar eventos e comunidades de tecnologia do Nordeste. O modelo editorial em Markdown deve ser preservado: nao crie novos campos obrigatorios em front matter sem necessidade explicita.

## Stack

- Eleventy com templates Nunjucks em `src/`
- CSS global em `src/assets/css/site.css`
- JavaScript progressivo em `src/assets/js/site.js` e `src/assets/js/list-filters.js`
- Conteudo editorial em `src/eventos/` e `src/comunidades/`
- Saida estatica em `_site/`

## Comandos

Use estes comandos para validar mudancas:

```bash
npm run validate
npm run build
npm run test:unit
npm run test:e2e
```

Para auditoria local de qualidade web, sirva `_site/` e rode Lighthouse nas rotas principais:

```bash
npx --no-install serve _site -l 4173
```

Rotas minimas para conferir: `/`, `/eventos/`, `/comunidades/`, um detalhe de evento, um detalhe de comunidade e `/contribuir/`.

## Regras De UX/UI

- Mobile deve usar menu hamburguer acessivel, com `aria-expanded`, Escape para fechar, foco controlado e backdrop.
- Conteudo com `data-reveal` deve estar visivel por padrao. Animacoes so podem depender da classe `.js`, para o site continuar legivel sem JavaScript.
- CTAs e controles clicaveis devem respeitar area minima aproximada de 44px.
- Use imagens locais e estaveis sempre que possivel. Cards e detalhes devem renderizar midia como `<img>` com `loading="lazy"`, `decoding="async"`, dimensoes previsiveis e `alt` adequado.
- Nao introduza dependencia visual de fontes remotas sem uma razao forte. Prefira a stack local/sistema existente.
- Evite card dentro de card. Use cards apenas para itens repetidos, modais ou ferramentas claramente emolduradas.
- Mantenha raios de cards e paineis em ate 8px, salvo decisao explicita de design.
- Filtros de listas devem responder em tempo real, anunciar contagem via `aria-live`, expor chips ativos e ter reset claro.

## SEO E Performance

- Preserve `robots.txt`, `sitemap.xml`, meta description derivada do conteudo, `og:image` padrao e JSON-LD basico para eventos.
- Nao degrade as metas atuais: Lighthouse local deve ficar em 95+ performance para home/eventos, 90+ para comunidades e 100 em acessibilidade, SEO e boas praticas.
- Evite carregar imagens externas diretamente nas listagens. Quando uma capa nao for local/HTTPS segura, use fallback editorial local.

## Colaboracao

- Antes de editar, leia a estrutura existente e siga o padrao local.
- Nao reverta mudancas que voce nao fez.
- Se encontrar `CONTEXT.md` no futuro, migre o conteudo relevante para este `AGENTS.md` e mantenha este arquivo como contrato principal para agentes.
