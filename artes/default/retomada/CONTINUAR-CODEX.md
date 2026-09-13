# Checkpoint de produção — não é aprovação para publicar

Branch: `feat/artes-default-comunidades`. Nunca force-push, merge ou publicação nas redes nesta etapa.

O remoto encontrado foi `e7336928c607e921c59e6ca6919a2a8e340af2e3`, com apenas parte da preservação anterior (commit identificado como 80/410 arquivos). Não existiam os diretórios de imagens recuperadas mencionados no chat. O usuário confirmou não possuir ZIP. Não declarar os 410 arquivos recuperados.

Consulte `INVENTARIO.json`, `../lotes/PLANO.json` e os manifestos de cada lote. Arquivos presentes não significam revisão visual. Cada manifesto concluído registra inspeção individual dos PNGs e prompts; a aprovação humana continua nula.

Use um agente por lote de até dez comunidades, restrito às próprias pastas e manifesto. Somente o agente principal integra índices e serializa commits/pushes. Inspecione o estado local e remoto antes de continuar; preserve qualquer trabalho parcial.

Ferramenta Image Gen integrada confirmada em funcionamento nesta execução. As gerações novas e correções estão preservadas nas pastas das comunidades; não são as imagens antigas que faltaram no envio do ChatGPT. Reutilize antes de gerar novamente. Não use serviços pagos alternativos sem autorização.

Ferramentas portáveis a partir da raiz do checkout:

```bash
npm ci --prefix artes/default/scripts --ignore-scripts --no-audit --no-fund
node artes/default/scripts/build-community.cjs caminho/relativo/spec.json
node artes/default/scripts/validate-community.cjs lote-XX
node artes/default/scripts/integrate-batch.cjs lote-XX
```

Depois de revisar e adicionar ao índice somente os arquivos do lote liberado e os índices globais, execute `node artes/default/scripts/checksums-index.cjs` e adicione `artes/default/SHA256SUMS`. O cálculo usa o índice Git, evitando incluir alterações parciais de outro agente. Faça commit/push imediatamente e confira o SHA remoto com `git ls-remote origin refs/heads/feat/artes-default-comunidades`.

Não alterar a marca, o site, automações ou os cadastros editoriais. Não inventar dados de eventos, aprovação, logos ou cenas genéricas para comunidades cadastradas.

## Verificações complementares em 13/09/2026

- `npm run validate`: passou, com 75 eventos e 93 comunidades cadastradas.
- `npm run build`: passou.
- `npm run test:unit`: 133 testes passaram, em 22 arquivos.
- E2E: 11 testes passaram com um worker e servidor isolado na porta 4186. Uma configuração temporária externa ao repositório alterou somente porta, diretórios de saída e reutilização do servidor; os testes permaneceram intactos. A execução inicial com seis workers teve seis timeouts; a repetição serial passou. A porta padrão 4173 já pertencia ao checkout principal e seu processo não foi interrompido.

Esses testes verificam o site existente, não aprovam as artes. Para concluir o catálogo, execute `node artes/default/scripts/validate-catalog.cjs --complete`, confira os manifestos e PNGs individuais, e verifique o commit publicado com `node artes/default/scripts/verify-release.cjs HEAD`.
