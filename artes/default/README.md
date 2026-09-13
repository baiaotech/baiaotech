# Modelos finais — Baião Tech

**93 modelos exclusivos de comunidades e dois genéricos aprovados pelo usuário.** A aprovação e os hashes das versões finais estão em [APROVACAO.json](APROVACAO.json). Consulte a [galeria](GALERIA.md) e o [catálogo](catalogo.json).

Os arquivos são bases para criar postagens, não anúncios de eventos reais. Não há avisos editoriais sobrepostos à arte. Nome do evento, mês, data e local continuam como campos a preencher; a aprovação da identidade visual não confirma esses dados nem autoriza publicação automática.

## Arquivos finais

- `modelo.svg`: card completo editável, com fonte, ilustração e marcas incorporadas.
- `modelo.png`: exportação limpa do mesmo card, em 1080 × 1350 px.
- `ilustracao.jpg`: fundo aprovado, sem textos; é um insumo, não o card completo.
- `logo.png`: cópia fiel do `cover_image` cadastrado, quando existente. Há 87 logos e seis comunidades com cabeçalho exclusivamente nominal.
- `estilo.json`: conceito, vínculo com cadastro, aprovação, composição e hashes dos arquivos.

Os genéricos compartilham `genericos/ilustracao.jpg` e têm versões [com logo](genericos/com-logo/modelo.svg) e [sem logo](genericos/sem-logo/modelo.svg). Os SVGs são híbridos: textos editáveis, elementos vetoriais e ilustrações raster incorporadas. Para editar textos, alguns programas exigem a fonte Inter instalada; a fonte e sua [licença SIL OFL](../../src/assets/fonts/Inter-LICENSE.txt) pertencem ao projeto.

## Uso pela atividade diária do ChatGPT

1. Leia `AGENTS.md`, `catalogo.json` e o estilo correspondente ao organizador confirmado do evento.
2. Comunidade cadastrada: use somente seu modelo específico. Não gere uma nova ilustração nem substitua a identidade por um genérico.
3. Organizador não catalogado: use o genérico com logo somente se houver logo oficial verificada; caso contrário, use o genérico sem logo. Nunca invente ou empreste uma marca.
4. Crie uma cópia de `modelo.svg` fora deste diretório. Preencha somente os campos abaixo com informações confirmadas. No genérico, substitua também nome e logo do organizador; `LOGO AQUI` é o campo de inserção, não uma marca publicável.
5. Exporte essa cópia para PNG em 1080 × 1350, sRGB. Confira acentos, título, data, horário/fuso, local, logo e margens. Não publique com campos pendentes ou sem a autorização aplicável.

Não use geração de imagens para redesenhar o card ou os textos: a base já está pronta. Edite o SVG e exporte o resultado. Preserve os grupos `fixed-illustration`, `fixed-organizer` e `fixed-baiao-footer`; a única exceção é preencher o organizador do genérico com dados verificados.

| ID no SVG | Preenchimento |
|---|---|
| `agenda-month` | Mês ou edição da agenda. |
| `event-title-1`, `event-title-2`, `event-title-3` | Título do evento, com quebras entre palavras. |
| `event-category` | Categoria/formato confirmado; pode permanecer vazio. |
| `event-date-time` | Data, horário e fuso confirmados. |
| `event-location` | Local ou formato confirmado. “A confirmar” somente quando isso corresponder à informação oficial. |

Área do título: x=68 até x=575. Modelo curto: duas linhas de 108 px, bases y=429 e 535. Para título longo, use três linhas de 78 px, bases y=385, 470 e 555; não comprima letras nem invada a imagem. Data/local ficam de x=124 a x=550. O rodapé não deve mudar. Se não couber, solicite um ajuste manual.

## Integridade e manutenção

Na raiz do checkout:

```bash
npm ci --prefix artes/default/scripts --ignore-scripts --no-audit --no-fund
node artes/default/scripts/validate-catalog.cjs
node artes/default/scripts/verify-release.cjs HEAD
```

O validador confere os 95 modelos, aprovação/hashes, logos oficiais, grupos fixos, margens e igualdade SVG/PNG. Uma alteração de identidade visual exige nova autorização expressa; não reutilize a aprovação de uma versão diferente. Preencher os campos previstos em uma cópia para um evento não altera a base aprovada.

Materiais auxiliares da produção anterior foram retirados do conjunto de uso a pedido do usuário. Permanecem recuperáveis no histórico do Git, no commit `c1349b5165bf2a2db1cdfc97e0bade82eba367b6`. Não os utilize no fluxo diário. Esta entrega não modifica tarefas agendadas, workflows, o site ou integrações de publicação.
