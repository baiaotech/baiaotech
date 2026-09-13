// Executado somente pelo agente principal, depois da revisão individual do lote.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateCommunity } = require('./validate-community.cjs');
const root = path.resolve(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const write = (f, value) => fs.writeFileSync(path.join(root, f), JSON.stringify(value, null, 2) + '\n');
async function main() {
  const id = process.argv[2];
  if (!/^lote-\d\d$/.test(id || '')) throw Error('Informe lote-XX');
  const plan = read('lotes/PLANO.json');
  const batch = plan.lotes.find(x => x.id === id);
  const manifest = read(`lotes/${id}.json`);
  if (!batch || manifest.status !== 'concluido_em_revisao' || manifest.aprovacao !== null) throw Error('Lote não liberado');
  for (const slug of batch.comunidades) {
    const entry = manifest.comunidades.find(x => x.id === slug);
    if (!entry?.revisao_visual?.realizada || entry.status !== 'em_revisao') throw Error(`Sem revisão: ${slug}`);
    const result = await validateCommunity(slug);
    if (!result.ok) throw Error(JSON.stringify(result));
  }
  const catalog = read('catalogo.json');
  catalog.base_composicao = 'genericos/com-logo/modelo.svg';
  const prompts = read('PROMPTS.json');
  prompts.correcoes ||= {};
  if (fs.existsSync(path.join(root, 'genericos/REVISAO.json'))) prompts.correcoes.genericos = [read('genericos/REVISAO.json').prompt_correcao];
  for (const slug of batch.comunidades) {
    const style = read(`comunidades/${slug}/estilo.json`);
    const entry = manifest.comunidades.find(x => x.id === slug);
    const item = { id: slug, nome: style.nome, estado: style.estado, estilo: `comunidades/${slug}/estilo.json`, previa: `comunidades/${slug}/previa.png` };
    const index = catalog.comunidades.findIndex(x => x.id === slug);
    if (index < 0) catalog.comunidades.push(item); else catalog.comunidades[index] = item;
    if (prompts.prompts[slug] && prompts.prompts[slug] !== entry.prompt) {
      prompts.historico ||= {};
      prompts.historico[slug] ||= [];
      if (!prompts.historico[slug].includes(prompts.prompts[slug])) prompts.historico[slug].push(prompts.prompts[slug]);
    }
    prompts.prompts[slug] = entry.prompt;
    if (entry.prompts_correcao?.length) prompts.correcoes[slug] = entry.prompts_correcao;
  }
  batch.status = 'concluido_em_revisao';
  batch.aprovacao = null;
  batch.manifesto = `lotes/${id}.json`;
  catalog.politica = 'Modelos em revisão, com dados demonstrativos. Revisão técnica não constitui aprovação humana nem autorização para publicação.';
  write('catalogo.json', catalog); write('PROMPTS.json', prompts); write('lotes/PLANO.json', plan);
  const qualityPath = 'retomada/REVISAO-PADRAO.json';
  if (manifest.comparacao_base?.realizada && fs.existsSync(path.join(root, qualityPath))) {
    const quality = read(qualityPath);
    quality.lotes[id] = 'conferido_contra_base';
    quality.problemas_identificados = quality.problemas_identificados.map(item => item.lote === id || batch.comunidades.includes(item.id) ? {...item, resolvido: true, registro: `lotes/${id}.json`} : item);
    write(qualityPath, quality);
  }
  let gallery = '# Galeria de revisão — cards completos\n\n' + catalog.comunidades.length + ' comunidades no catálogo e 2 genéricos. Campos demonstrativos; não publicar. A presença no catálogo não substitui a revisão individual registrada nos manifestos.\n\n[Plano e progresso](lotes/PLANO.json) · [Revisão adicional do padrão](retomada/REVISAO-PADRAO.json) · [Inventário do checkpoint](retomada/INVENTARIO.json) · [Contrato](README.md)\n\n## Base de composição indicada pelo usuário\n\n[Genérico com logo — SVG](genericos/com-logo/modelo.svg). A cena de cada comunidade permanece exclusiva.\n\n## Referência histórica aprovada\n\n![PyLadies Maceió — referência preservada](referencias/pyladies-maceio-aprovado.png)\n\n';
  for (const item of [...catalog.comunidades, ...catalog.genericos]) {
    const base = path.posix.dirname(item.estilo);
    const style = read(item.estilo);
    gallery += `## ${item.nome || 'Genérico ' + item.id}\n\n${style.conceito || ''}\n\n![Card completo — ${item.nome || item.id}](${item.previa})\n\n[SVG editável](${base}/modelo.svg) · [Estilo e origem](${item.estilo})\n\n`;
  }
  fs.writeFileSync(path.join(root, 'GALERIA.md'), gallery.trimEnd() + '\n');
  const subgallery = '# ' + id + ' — revisão técnica concluída\n\nTodos os modelos permanecem em revisão humana, com aprovação nula e dados demonstrativos.\n\n' + batch.comunidades.map(slug => `## ${read(`comunidades/${slug}/estilo.json`).nome}\n\n![Card completo](../comunidades/${slug}/previa.png)\n\n[SVG](../comunidades/${slug}/modelo.svg) · [Estilo](../comunidades/${slug}/estilo.json)\n`).join('\n');
  fs.writeFileSync(path.join(root, `lotes/${id}.md`), subgallery);
  // Inventário usa o índice + este lote, não diretórios ainda em trabalho por outros agentes.
  const tracked = new Set(execFileSync('git', ['ls-files', '--cached', '--', 'artes/default'], {cwd: path.resolve(root, '../..')}).toString().trim().split('\n'));
  const initial = catalog.comunidades.slice(0, 10).map(x => x.id);
  const items = [...initial, ...plan.lotes.flatMap(x => x.comunidades)].map(slug => {
    const released = batch.comunidades.includes(slug);
    const stylePath = `comunidades/${slug}/estilo.json`;
    const has = f => released ? fs.existsSync(path.join(root, f)) : tracked.has('artes/default/' + f);
    const required = ['estilo.json', 'ilustracao.jpg', 'modelo.svg', 'previa.png'];
    const complete = required.every(f => has(`comunidades/${slug}/${f}`));
    const b = plan.lotes.find(x => x.comunidades.includes(slug));
    const firstManifest = path.join(root, 'lotes/lote-01.json');
    const visual = b?.status === 'concluido_em_revisao' || (!b && fs.existsSync(firstManifest) && read('lotes/lote-01.json').comunidades.some(x => x.id === slug && x.revisao_visual?.realizada));
    return {id: slug, lote: b?.id || 'lote-01', arquivos_basicos_completos: complete, revisao_visual_registrada: visual, estado: visual ? 'concluido_em_revisao' : complete ? 'arquivos_presentes_revisao_pendente' : has(stylePath) ? 'parcial' : 'ausente', aprovacao: null};
  });
  fs.mkdirSync(path.join(root, 'retomada'), {recursive: true});
  write('retomada/INVENTARIO.json', {base_remota_encontrada: 'e7336928c607e921c59e6ca6919a2a8e340af2e3', recuperacao: 'Remoto continha checkpoint parcial 80/410; diretório retomada e 66+11 imagens antigas não estavam disponíveis. Usuário confirmou não possuir ZIP. Novas gerações identificadas nos manifestos.', checkpoint_lote: id, total_previsto: 93, revisados_tecnicamente: items.filter(x => x.revisao_visual_registrada).length, comunidades: items});
  console.log(`${id} integrado: ${catalog.comunidades.length} entradas; ${items.filter(x => x.revisao_visual_registrada).length} revisões técnicas registradas.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
