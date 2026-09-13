const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateCommunity} = require('./validate-community.cjs');
const sharp = require('sharp');
const repo = path.resolve(__dirname, '../../..');
const root = path.resolve(__dirname, '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root,f)));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const complete = process.argv.includes('--complete');
  const catalog = read('catalogo.json');
  const plan = read('lotes/PLANO.json');
  const registered = fs.readdirSync(path.join(repo,'src/content/communities')).filter(x=>x.endsWith('.md')).map(x=>x.slice(0,-3));
  const expected = [...catalog.comunidades.slice(0,10).map(x=>x.id),...plan.lotes.flatMap(x=>x.comunidades)];
  const errors = [];
  const check = (ok,message)=>{if(!ok) errors.push(message);};
  check(expected.length===93 && new Set(expected).size===93,'Plano não contém 93 slugs únicos');
  check(registered.length===93 && registered.every(x=>expected.includes(x)),'Plano difere dos cadastros reais');
  const ids = catalog.comunidades.map(x=>x.id);
  check(new Set(ids).size===ids.length,'Catálogo tem comunidades duplicadas');
  check(ids.every(x=>registered.includes(x)),'Catálogo aponta para cadastro inexistente');
  if(complete) check(ids.length===93 && expected.every(x=>ids.includes(x)),'Catálogo ainda incompleto');
  const scenes = new Map();
  for(const id of ids) {
    const result = await validateCommunity(id);
    for(const error of result.errors) errors.push(id+': '+error);
    if(result.ilustracao_sha256) {
      check(!scenes.has(result.ilustracao_sha256),`Ilustração repetida: ${id} / ${scenes.get(result.ilustracao_sha256)}`);
      scenes.set(result.ilustracao_sha256,id);
    }
  }
  check(catalog.genericos.length===2 && ['com-logo','sem-logo'].every(id=>catalog.genericos.some(x=>x.id===id)),'Genéricos incorretos');
  const genericJpg = fs.readFileSync(path.join(root,'genericos/ilustracao.jpg'));
  check(!scenes.has(hash(genericJpg)),'Genérico reutiliza ilustração de comunidade cadastrada');
  const brand = fs.readFileSync(path.join(root,'assets/baiao-tech-principal.svg'));
  for(const id of ['com-logo','sem-logo']) {
    const dir = path.join(root,'genericos',id);
    const style = read(`genericos/${id}/estilo.json`);
    const svg = fs.readFileSync(path.join(dir,'modelo.svg'),'utf8');
    const png = fs.readFileSync(path.join(dir,'previa.png'));
    const meta = await sharp(png).metadata();
    check(style.status==='em_revisao' && style.aprovacao===null,id+': aprovação indevida');
    check(meta.width===1080 && meta.height===1350,id+': formato incorreto');
    const a = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const b = await sharp(png).ensureAlpha().raw().toBuffer();
    check(a.equals(b),id+': PNG difere de SVG');
    check(svg.includes('data:image/jpeg;base64,'+genericJpg.toString('base64')),id+': fundo incorporado divergente');
    check(svg.includes('data:image/svg+xml;base64,'+brand.toString('base64')),id+': marca original divergente');
    check(svg.includes('baiaotech.org') && svg.includes('fixed-baiao-footer'),id+': rodapé incompleto');
    check(id!=='sem-logo' || (style.logo===null && style.logo_largura===0 && /id="organizer-name-1" x="72"/.test(svg)),id+': espaço vazio para logo');
  }
  if(complete) {
    for(const batch of [{id:'lote-01',comunidades:expected.slice(0,10)},...plan.lotes]) {
      const manifest = read(`lotes/${batch.id}.json`);
      check(manifest.status==='concluido_em_revisao' && manifest.aprovacao===null,batch.id+': manifesto não concluído para revisão');
      check(manifest.comparacao_base?.realizada===true,batch.id+': sem reconferência da base indicada');
      for(const id of batch.comunidades) check(manifest.comunidades.some(x=>x.id===id && x.revisao_visual?.realizada && x.status==='em_revisao'),id+': revisão individual ausente');
    }
  }
  console.log(JSON.stringify({resultado:errors.length?'falhou':'ok',modo:complete?'completo':'catalogados',comunidades:ids.length,genericos:2,ilustracoes_exclusivas:scenes.size,errors},null,2));
  if(errors.length) process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
