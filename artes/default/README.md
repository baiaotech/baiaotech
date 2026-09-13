# Modelos de postagem — Baião Tech

Primeiro lote: **10 comunidades, cada uma com ilustração própria**, e **dois modelos genéricos**. Todas as peças completas têm logo do Baião Tech e `baiaotech.org` no rodapé, seguindo a hierarquia da referência de PyLadies Maceió.

**Em revisão. Os títulos, datas e locais são campos demonstrativos. Estes arquivos não anunciam eventos reais.**

## Revisar as artes

Abra a [galeria com os 12 cards completos](GALERIA.md). As prévias PNG têm **1080 × 1350 px**. Cada `modelo.svg` contém os mesmos elementos, com textos editáveis e imagens incorporadas, e pode ser aberto sem buscar arquivos externos.

| Comunidade | UF | Direção exclusiva | Card completo |
|---|---|---|---|
| PyLadies Maceió | AL | Mulheres, pertencimento e conexões | [PNG](comunidades/pyladies-maceio/previa.png) · [SVG](comunidades/pyladies-maceio/modelo.svg) |
| PyLadies Salvador | BA | Mentoria entre mulheres, programação em dupla e baía | [PNG](comunidades/pyladies-salvador/previa.png) · [SVG](comunidades/pyladies-salvador/modelo.svg) |
| GDG Fortaleza | CE | Codelab de aplicativos e orla | [PNG](comunidades/gdg-fortaleza/previa.png) · [SVG](comunidades/gdg-fortaleza/modelo.svg) |
| GDG Recife | PE | Troca de conhecimento, rios e pontes | [PNG](comunidades/gdg-recife/previa.png) · [SVG](comunidades/gdg-recife/modelo.svg) |
| AWS User Group João Pessoa | PB | Arquitetura em nuvem e litoral | [PNG](comunidades/aws-user-group-joao-pessoa/previa.png) · [SVG](comunidades/aws-user-group-joao-pessoa/modelo.svg) |
| GDG Natal | RN | Experimentação de interfaces e dunas | [PNG](comunidades/gdg-natal/previa.png) · [SVG](comunidades/gdg-natal/modelo.svg) |
| GDG Aracaju | SE | Encontro de desenvolvedores e troca de ideias | [PNG](comunidades/gdg-aracaju/previa.png) · [SVG](comunidades/gdg-aracaju/modelo.svg) |
| Cloud Native São Luís | MA | Colaboração em infraestrutura, nuvem e servidores | [PNG](comunidades/cloud-native-sao-luis/previa.png) · [SVG](comunidades/cloud-native-sao-luis/modelo.svg) |
| Teresina Hacker Clube | PI | Cultura maker, eletrônica e robótica educacional | [PNG](comunidades/teresina-hacker-clube/previa.png) · [SVG](comunidades/teresina-hacker-clube/modelo.svg) |
| DevOps CE | CE | Automação contínua e confiabilidade | [PNG](comunidades/devops-ce/previa.png) · [SVG](comunidades/devops-ce/modelo.svg) |

O lote contempla os nove estados do Nordeste. Os conceitos partem das descrições dos cadastros; não restringem os temas de eventos futuros. Pessoas e paisagens são ilustrações, não fotografias de integrantes, sedes ou locais confirmados de eventos.

## Arquivos e origem

- `catalogo.json`: índice de estilos e caminhos.
- `comunidades/<slug>/estilo.json`: vínculo exato com o cadastro, conceito, origem da imagem, hash e estado de aprovação.
- `comunidades/<slug>/modelo.svg`: **card completo editável**, com tipografia, imagem oficial da comunidade, ilustração e assinatura do Baião Tech incorporadas.
- `comunidades/<slug>/previa.png`: **card completo para revisão**, exportado do SVG.
- `comunidades/<slug>/logo.png`: cópia em PNG da imagem local indicada no cadastro, sem alterações visuais. O original e seu SHA-256 estão no `estilo.json`.
- `comunidades/<slug>/ilustracao.jpg`: **insumo de fundo**, sem textos e sem marcas; não é um card de postagem.
- `genericos/`: uma cena neutra exclusiva dos organizadores não catalogados, com dois cabeçalhos: com logo e sem logo.
- `assets/baiao-tech-principal.svg`: logo original da composição principal do kit de marca adotado. Não foi redesenhado.
- `referencias/pyladies-maceio-aprovado.png`: cópia intacta da imagem aprovada na conversa de 13/09/2026, preservada para comparação.
- `PROMPTS.json`: instruções usadas na geração das ilustrações, registradas para rastreabilidade. Não são autorização para regenerar estilos aprovados a cada postagem.
- `SHA256SUMS`: integridade do conjunto revisado, incluindo modelos, ilustrações, logos e PNGs.

Os SVGs são composições híbridas: **textos editáveis, elementos vetoriais e ilustrações raster incorporadas**. Não são ilustrações integralmente vetorizadas. A fonte Inter Variable do próprio repositório está incorporada; sua licença SIL OFL está em [`src/assets/fonts/Inter-LICENSE.txt`](../../src/assets/fonts/Inter-LICENSE.txt). Alguns editores vetoriais precisam da fonte instalada para editar texto; confirme a aparência em relação ao PNG antes de exportar.

## Seleção do modelo

| Situação verificada | Modelo / ação |
|---|---|
| Comunidade catalogada e estilo aprovado | Usar exclusivamente o modelo daquela comunidade. |
| Comunidade catalogada e estilo em revisão, ausente ou desatualizado | Encaminhar a peça para revisão do modelo específico. Não usar genérico automaticamente. |
| Organizador não catalogado, com logo verificável e genérico aprovado | `genericos/com-logo/modelo.svg`. Substituir o campo demonstrativo pela logo real, sem distorção. |
| Organizador não catalogado, sem logo verificável e genérico aprovado | `genericos/sem-logo/modelo.svg`. O nome ocupa o cabeçalho desde a margem esquerda. |
| Vínculo entre evento e organizador incerto | Não associar por semelhança de nome ou por cidade. Encaminhar a dúvida à curadoria. |

Uma busca de logo fora do catálogo deve registrar a URL da fonte oficial. Se não houver comprovação suficiente, usar a versão sem logo. **Nunca usar o logo de uma comunidade como exemplo de outra organização.** `LOGO AQUI` aparece apenas na prévia demonstrativa do genérico e deve impedir publicação enquanto não for substituído.

## Preenchimento sem alterar o estilo

Trabalhe em uma cópia do SVG aprovado. Preserve `fixed-illustration`, `fixed-organizer` e `fixed-baiao-footer`. Para genéricos, o organizador e sua logo são campos variáveis, sempre confirmados com a fonte do evento.

| ID no SVG | Conteúdo variável |
|---|---|
| `agenda-month` | Mês/edição da agenda. |
| `event-title-1`, `event-title-2`, `event-title-3` | Título real, com quebras de linha entre palavras. |
| `event-category` | Categoria ou formato confirmado; pode ficar vazio. |
| `event-date-time` | Data e horário confirmados; explicitar o fuso quando necessário. |
| `event-location` | Local/formato confirmado; usar “A confirmar” se ausente. |
| `review-label` | Marcador de revisão, removível apenas após validar a peça e o modelo. |

Área máxima do título: **x=68 até x=575**. O modelo curto tem duas linhas de 108 px, nas bases y=429 e 535. Para um título maior, usar três linhas de **78 px**, nas bases **y=385, 470 e 555**, preservando a faixa de dados abaixo. Não invadir a ilustração, comprimir letras, omitir parte do título nem reduzir indefinidamente a fonte; se não couber, encaminhar para ajuste manual e revisão. Data e local ficam na coluna esquerda, de x=124 a x=550. O rodapé permanece fixo.

Use os dados confirmados do evento, nunca os campos de demonstração como valores padrão. Exportar o SVG para PNG em 1080 × 1350, sRGB, e conferir texto, logos, rodapé e margens na imagem final. A revisão do modelo não substitui a checagem factual e a aprovação de cada publicação.

## Aprovação e atividade mensal

Os 12 `estilo.json` estão em `em_revisao`, com `aprovacao: null`. Para aprovar um estilo, registrar `status: "aprovado"` e um objeto `aprovacao` com responsável, data e link do comentário/revisão que identifica a versão aprovada. Não alterar esses campos em nome do revisor.

A referência de PyLadies Maceió já foi aprovada na conversa; a conversão em modelo editável é apresentada junto das demais para comparação. Não substituir a referência histórica pela adaptação.

Depois da revisão e integração do PR, a atividade mensal deverá ler este contrato e selecionar somente versões explicitamente aprovadas. Novas ilustrações ou alterações da marca/composição retornam a `em_revisao`. **Este PR não modifica a tarefa agendada nem publica conteúdo.**

Para conferir a integridade a partir desta pasta:

```bash
sha256sum --check SHA256SUMS
```

As logos das comunidades mantêm a identidade e titularidade de seus respectivos responsáveis. A presença no diretório não representa endosso adicional nem transfere direitos sobre as marcas.

## Continuação em lotes

O [plano de continuação](lotes/PLANO.json) organiza as 83 comunidades ainda sem modelo em lotes de até 10, cada um produzido por um subagent. Cada lote concluído é conferido e enviado à mesma branch; os anteriores são preservados. Os manifestos em `lotes/lote-XX.json` registram prompts e revisão visual. A criação continua separada da aprovação para publicação.

Para comunidades sem `cover_image` no cadastro, o modelo específico utiliza o nome em destaque desde a margem esquerda, sem logo inventada, marca emprestada ou espaço vazio reservado. A ausência fica registrada no `estilo.json` para revisão.

O script `scripts/build-community.cjs` monta apenas uma comunidade por execução, sem modificar os índices globais. Ele recebe um JSON com `id`, `conceito` e o caminho `ilustracao`; aceita `linhas_nome`, `nome_tamanho`, `logo_largura` e `logo_fundo` para ajustes de legibilidade. Requer Node.js, `gray-matter` do projeto e `sharp` disponível no runtime (`CODEX_PRIMARY_RUNTIME_NODE_MODULES`) ou instalado no ambiente. As ilustrações são geradas separadamente com Image Gen integrado. `assets/Inter.ttf` é a conversão local da fonte Inter Variable já incluída no projeto, sob a mesma [licença SIL OFL](../../src/assets/fonts/Inter-LICENSE.txt); `assets/fonts.conf` permite renderização consistente dos PNGs. O SVG mantém a fonte WOFF2 incorporada.
