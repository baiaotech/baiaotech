# Baião Tech — verificação da aplicação da marca

Data: 13/09/2026.

final result: passed

## Referência e evidências

- Referência escolhida pelo usuário: `/home/gaellopes/.codex/generated_images/01a09b30-a5a6-7203-b1fd-6add7c892901/exec-d63d3222-26cf-48a8-bb8a-e88af0a51dce.png`.
- Implementação: `http://localhost:4173/`.
- Captura final, após a integração remota: `output/integration-20260913/home-1487.png`.
- Referência e implementação: 1487 × 1058 pixels, viewport CSS 1487 × 1058, deviceScaleFactor 1. Não foi necessário redimensionar a referência.
- Estado comparado: home, início da página, menu fechado, busca vazia, eventos futuros em 13/09/2026.
- Comparação conjunta da referência à esquerda e implementação à direita: `output/integration-20260913/comparison-v2.png`.
- Comparação conjunta ampliada da abertura, incluindo logo, tipografia, botões e ilustração: `output/integration-20260913/comparison-hero-v2.png`.
- Capturas e métricas finais: `output/integration-20260913/verification.json`; evidências anteriores preservadas em `output/brand-redesign/`.
- Correção solicitada a partir de `Captura de tela 2026-09-13 120251.png`: comparações do mesmo SVG antes/depois, na mesma escala, em `logo-escuro-b-comparison.png` e `logo-claro-b-comparison.png`; verificação em `logo-verification.json`.

## Avaliação visual final

Não restam diferenças P0/P1/P2 acionáveis nas superfícies verificadas.

| Superfície | Resultado |
| --- | --- |
| Fontes e tipografia | Inter local com pesos variáveis, fallback de sistema e caracteres portugueses. Título em duas linhas como na proposta; pesos ajustados também nas páginas internas. |
| Espaçamento e composição | Abertura de no mínimo 592 px no desktop, crescendo conforme o título editorial para preservar a área da ilustração. Texto à esquerda, próximo evento à direita, agenda em linhas abertas. Botões e busca têm áreas de toque de pelo menos 44 px. |
| Cores | Noite, Terracota, Sertão e Cariri aplicados à interface; Noite nos botões Terracota e Cariri nos links sobre branco. Fundos claros derivados como apoio. |
| Imagens e identidade | Logos do kit com restauração autorizada do contorno superior do B; demais letras, chapéu, divisor, cacto, cores e proporções preservados. Conexões originais do kit. Arte editorial de cinco pessoas/paisagem em WebP, com integração suave ao fundo escuro. Logos das comunidades e capas dos eventos preservados. |
| Conteúdo | Textos institucionais seguem a proposta. Títulos completos e organizadores reais mantêm o Markdown editorial, mesmo quando são mais longos que a imagem conceitual. |

## Histórico das correções

1. Primeira captura (`home-desktop-v1.png`): quebra do título e posição da agenda divergiam da proposta; havia uma borda perceptível na integração da ilustração. Foram corrigidos a quebra em duas linhas, altura da abertura, espaçamentos e máscara da imagem.
2. Comparação intermediária (`comparison-before-final.png` e `comparison-hero-before-final.png`): título e botão principal estavam menores que a referência; em 768 px o elemento decorativo passava atrás da data e as colunas comprimiam os nomes dos eventos. Foram ajustados os tamanhos de fonte/botão, os pesos tipográficos das páginas internas, a distribuição das linhas em tablets e a visibilidade do elemento decorativo nesse intervalo.
3. Evidência final (`comparison-v2.png`, `comparison-hero-v2.png`, `home-768.png`): composição corrigida, título e chamadas hierarquizados, data livre de decoração e títulos legíveis.
4. Uma captura intermediária de comunidades coincidiu com a reconstrução de `_site`; foi rejeitada e refeita após a conclusão do build. A captura final `comunidades-1487.png` e as verificações finais não têm imagens quebradas. O menu móvel também foi recapturado após o término da transição, em `menu-mobile.png`.
5. O usuário apontou a ponta superior do B incompleta. O defeito estava no próprio vetor secundário do kit: o lettering manteve o recorte da área coberta pelo chapéu na composição principal. Foi restaurado somente esse trecho do contorno externo do B, nas variantes clara e escura, sem alterar os vazados, demais letras, símbolos ou proporções. Não foi necessário regenerar a marca. As comparações ampliadas e as capturas reais do cabeçalho/rodapé em 1487, 390 e 320 px mostram o B íntegro. O teste de geometria confirma que apenas um dos 15 contornos do lettering mudou e que três pontos antes vazios da região reparada agora estão preenchidos.
6. A integração remota trouxe um destaque com título mais longo, que colocava o link sobre a ilustração (`output/integration-20260913/home-before-long-title-fix.png`). A abertura agora cresce com o conteúdo. Um novo teste E2E reproduziu a falta de espaço antes da correção e passou depois, em 1487, 1024, 768, 390 e 320 px, sem abreviar o título.
7. A capa oficial da Sympla enviava um cookie de terceiros, reduzindo boas práticas a 77 em eventos e no detalhe. A mesma imagem foi copiada para `/assets/covers/events/hackathon-startup-piaui-2026.png`, sem alteração de pixels; SHA-256 idêntico ao download original. A origem está documentada em comentário no Markdown. Os demais dados editoriais e o suporte remoto a capas HTTPS foram preservados.

## Integração de origin/main

- Autorizada pelo usuário após a interrupção de `git pull` por alterações locais.
- Fast-forward de `d40fd86` para `652f2b7`; nenhuma divergência entre HEAD e origin/main no momento da verificação.
- Antes da atualização, 23 arquivos locais foram arquivados em `/tmp/baiaotech-pre-pull-c06wBt/worktree.tar.gz`, com manifesto SHA-256 e patch dos arquivos rastreados. O stash `cd3c157e99921f73c648cefa7160b7dd5edd3e58` foi mantido como recuperação adicional.
- Na reaplicação inicial, 22 arquivos ficaram byte a byte idênticos ao backup; apenas `event-card.njk` recebeu a combinação automática das mudanças remotas e locais. Nenhum conflito ficou pendente.
- Ajustes posteriores da integração limitados ao espaço para títulos longos, seu teste de regressão, à cópia local da capa da Sympla e a este relatório. Logos, fontes, ícones, arte e comportamento de busca preservados.

## Validação funcional e responsiva

- 30 verificações de layout: home, eventos, comunidades, detalhe de evento, detalhe de comunidade e contribuição; larguras 320, 390, 768, 1024 e 1487 px. Sem overflow horizontal e sem erros JavaScript na rodada final.
- Menu móvel: abertura, navegação, Escape, atualização de `aria-expanded`, isolamento da navegação fechada e restauração do foco.
- Busca da home: seleção inicial de dois eventos, busca incluindo o evento em destaque e itens fora da seleção inicial, resultado vazio, chips, contagem anunciada e reset.
- Sem JavaScript: conteúdo e navegação legíveis, sem sobreposição do cabeçalho, busca GET para a agenda.
- Filtros das listas: busca, estado, normalização de acentos e navegação até detalhes.
- Detalhes: imagens, WhatsApp, Google Agenda e download de calendário ICS.
- `npm run validate`: 75 eventos e 93 comunidades.
- `npm run build`: aprovado.
- `npm run test:unit`: 133 testes aprovados em 22 arquivos, incluindo os testes remotos de capas.
- `npm run test:e2e`: 11 testes aprovados após os ajustes da integração, incluindo a regressão de títulos longos.
- `git diff --check`: aprovado.
- Após a correção do B: build, validação editorial, 125 testes unitários e 10 testes E2E repetidos com sucesso; cabeçalho e rodapé verificados em 1487, 390 e 320 px, sem overflow, falha de carregamento ou erro JavaScript. As evidências `header-logo-fixed-*.png` e `footer-logo-fixed-*.png` registram as duas aplicações.

## Lighthouse local

Lighthouse 13.4.1, configuração móvel padrão, Chromium headless. Rodada final após a integração, o ajuste para títulos longos e a cópia local da capa. Os resultados são medições locais, não dados de usuários em produção.

| Rota | Performance | Acessibilidade | Boas práticas | SEO |
| --- | ---: | ---: | ---: | ---: |
| / | 99 | 100 | 100 | 100 |
| /eventos/ | 98 | 100 | 100 | 100 |
| /comunidades/ | 99 | 100 | 100 | 100 |
| /eventos/hackathon-startup-piaui-2026/ | 91 | 100 | 100 | 100 |
| /comunidades/gdg-maceio/ | 99 | 100 | 100 | 100 |
| /como-contribuir/ | 99 | 100 | 100 | 100 |

Relatórios completos: `output/integration-20260913/lighthouse-*.json`.
As metas de AGENTS.md foram atendidas. A rodada anterior, com o cookie da Sympla, está registrada em `lighthouse-summary-before-local-cover.json`; boas práticas voltaram a 100 nas seis rotas.
O detalhe do Hackathon mantém a capa oficial original de 280.523 bytes, sem recompressão; sua performance é 91, com oportunidade de otimização de imagem registrada pelo Lighthouse.
A rota de contribuição existente é `/como-contribuir/`; foi preservada.

## Diferenças esperadas e limites

- A ilustração foi produzida como um arquivo próprio; pequenos detalhes da paisagem e das pessoas diferem da imagem conceitual. A identidade, composição geral e paleta foram mantidas.
- A logo usa o vetor do kit com a correção do B solicitada pelo usuário; o elemento de conexões mantém o vetor original. Sua geometria pode divergir levemente da representação gerada na proposta.
- As imagens e os títulos dos eventos mantêm suas identidades e conteúdo reais. Não foram abreviados no Markdown para reproduzir os textos resumidos da imagem.
- Os layouts móveis são adaptações responsivas, pois a referência escolhida é desktop.
- O conteúdo recebido do remoto muda os eventos exibidos em destaque e na seleção inicial. Títulos maiores ampliam a abertura; não foram cortados para manter a altura da imagem conceitual.
- P3: algumas imagens originais das comunidades têm definição limitada. Não foram substituídas ou redesenhadas.
- Pontuações automatizadas de acessibilidade não equivalem a uma auditoria completa com todas as tecnologias assistivas.

## Checklist de entrega

- [x] Proposta selecionada implementada no Eleventy existente.
- [x] Identidade aplicada também a páginas internas, rodapé, favicon e imagem padrão de compartilhamento.
- [x] Modelo editorial e URLs existentes preservados.
- [x] Controles, filtros e navegação verificados.
- [x] Comparação visual, testes e metas locais aprovados.
- [x] Prévia local disponível.

Esta validação foi concluída sobre a base `652f2b7`, antes da criação do commit do redesenho. O envio à `main` aciona o workflow existente `Deploy GitHub Pages`; o resultado da publicação deve ser confirmado no GitHub Actions, independentemente destas evidências locais.
