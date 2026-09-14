# Agenda diária — fallback sem evento no dia

Esta referência foi aprovada pelo usuário em 14/09/2026 para a **rotina social diária** quando não houver evento confirmado na data de referência e houver um próximo encontro futuro validado no catálogo.

Ela é uma **referência de composição**, não substitui os modelos-base aprovados nem autoriza redesenhar marcas.

## Direção visual

- O estado editorial deve parecer parte nativa do card, nunca uma faixa improvisada colada no topo.
- Use um selo/pílula `AGENDA DIÁRIA` integrado ao cabeçalho.
- Headline principal: `Sem evento confirmado hoje`.
- Subtítulo: `Próximo encontro cadastrado`.
- O próximo evento futuro vira o conteúdo principal, com hierarquia forte para título, data e cidade/UF.
- Use ilustração/paisagem integrada, com o mesmo caráter editorial e nordestino da identidade do Baião Tech.
- Mantenha bom respiro, sem comprimir fontes para encaixar conteúdo.

## Estrutura sugerida

1. selo `AGENDA DIÁRIA`;
2. headline de estado do dia;
3. subtítulo explicando que a peça destaca o próximo encontro cadastrado;
4. organizador/comunidade + categoria/cidade;
5. título do próximo evento em grande destaque;
6. data;
7. local/formato;
8. tags curtas, quando verificadas;
9. paisagem/ilustração integrada;
10. rodapé oficial do Baião Tech, preservado exatamente a partir do asset/modelo aprovado.

## Regras obrigatórias

- Nunca afirmar que não existem eventos no Nordeste; afirmar somente que não há evento confirmado **hoje na agenda do Baião Tech**.
- Nunca apresentar o próximo evento como se fosse hoje.
- `start_date`/`end_date` não provam ocorrência diária; validar sessões efetivas.
- A logo e o rodapé do Baião Tech continuam imutáveis. Use o `fixed-baiao-footer`/asset oficial dos modelos aprovados; não reproduza a marca com geração de imagem.
- Comunidade catalogada continua usando sua marca oficial. Organizador não catalogado segue as regras dos genéricos.
- Este fallback é específico da **social diária**. As rotinas semanal/mensal não herdam automaticamente este layout.

## Arquivo de referência

`exemplo-fallback-proximo-encontro.svg` documenta a composição e hierarquia visual. O rodapé do SVG referencia o asset oficial `artes/default/assets/baiao-tech-principal.svg`; em produção, prefira sempre copiar o grupo `fixed-baiao-footer` do modelo-base vigente.

A arte final de cada execução continua devendo ser uma cópia preenchida/exportada e revisada em 1080 × 1350, sRGB.