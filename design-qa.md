# Design QA — redesign Baião Tech

Data da revisão: 12 de setembro de 2026

## Referência aprovada

- Direção visual: editorial orientada a dados, com verde-petróleo, azul, papel quente e ilustrações geométricas.
- Mockup escolhido: `/home/gaellopes/.codex/generated_images/01a097a0-0bf3-76c0-ae24-a8fc1b8a4c82/exec-7d14dc93-b6dc-4fd9-b168-f5eb6428a709.png`.
- Comparação lado a lado: `output/design-qa/reference-vs-implementation.png` em 2974 × 1058 px.
- Captura da implementação no mesmo viewport: `output/design-qa/implementation/01-home-reference-viewport.png` em 1487 × 1058 px.

## Superfícies verificadas

| Superfície | Desktop | Mobile | Estados interativos |
| --- | --- | --- | --- |
| Home | 1487 × 1058 e página completa | 390 × 844 | busca, atalhos e menu aberto |
| Eventos | 1440 × 1000 | 390 × 844 | busca, selects, chips, reset e drawer aberto |
| Comunidades | 1440 × 1000 | 390 × 844 | busca sem acentos, tema, estado, chips e reset |
| Detalhe de evento | 1440 × 1000 | 390 × 844 | inscrição, Google Agenda, ICS e WhatsApp |
| Detalhe de comunidade | 1440 × 1000 | responsivo | links externos e WhatsApp |
| Como contribuir | 1440 × 1000 | 390 × 844 | CTAs e conteúdo longo |
| Fallback sem JavaScript | — | 320 × 844 | conteúdo visível e header sem oclusão |

As capturas finais estão em `output/design-qa/implementation/`. `console-errors.json` contém `[]`.

## Iterações realizadas

1. A auditoria inicial identificou hero excessiva, mídia repetida, filtros difíceis de percorrer, datas suscetíveis a fuso e drawers ainda focáveis quando fechados.
2. A primeira implementação aplicou o sistema visual escolhido, arte local, agenda editorial, diretório em duas colunas, detalhes estruturados e navegação responsiva.
3. A revisão visual corrigiu a quebra de `16–17`, compactou a faixa de comunidades e tornou o cabeçalho inicial da agenda visível sem depender do IntersectionObserver.
4. A revisão semântica reduziu cada card a um link, adicionou `h2` aos detalhes, humanizou os temas e tornou a frase completa da contagem uma live region atômica.
5. A revisão funcional corrigiu datas que atravessam meses, alvos de toque de 44 px, foco dos drawers, busca sem acentos, sincronização com a URL e o fallback mobile sem JavaScript.
6. A revisão de SEO preservou canonical, Open Graph, sitemap, robots e JSON-LD. Eventos híbridos sem endereço de transmissão comprovado mantêm somente o local físico na marcação estruturada.

## Evidências de qualidade

- Conteúdo: 51 eventos e 93 comunidades validados após integrar os 19 eventos mais recentes da `main`.
- Testes unitários: 124 aprovados.
- Testes E2E: 10 cenários cobrem home, navegação, filtros, detalhes, contribuição e fallback sem JavaScript.
- HTML gerado: 149 páginas verificadas sem problemas de headings, links, IDs, ARIA, imagens, assets internos ou JSON-LD; o redesign também recebeu revisão independente sem pendências P0, P1 ou P2.
- Inspeção visual: sem overflow horizontal entre 320 px e 1440 px; menu e filtros permanecem dentro do viewport e restauram o foco ao fechar.

| Rota auditada no Lighthouse | Performance | Acessibilidade | Boas práticas | SEO |
| --- | ---: | ---: | ---: | ---: |
| `/` | 100 | 100 | 100 | 100 |
| `/eventos/` | 100 | 100 | 100 | 100 |
| `/comunidades/` | 100 | 100 | 100 | 100 |
| `/como-contribuir/` | 100 | 100 | 100 | 100 |
| Detalhe de evento | 96 | 100 | 100 | 100 |
| Detalhe de comunidade | 97 | 100 | 100 | 100 |

## Diferenças residuais aceitas

- Setas e ícones puramente decorativos do mockup foram simplificados para manter a interface leve e sem nova biblioteca visual.
- Datas, nomes, preços, logotipos e textos vêm do conteúdo real; por isso variam em relação aos exemplos sintéticos do mockup.
- Títulos extensos usam reticências apenas na agenda compacta da home e permanecem completos nas listagens e páginas de detalhe.

Não há pendências P0, P1 ou P2.

final result: passed
