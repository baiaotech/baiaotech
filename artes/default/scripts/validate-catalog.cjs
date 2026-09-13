const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateCommunity} = require('./validate-community.cjs');
const sharp = require('sharp');
const repo = path.resolve(__dirname,'../../..');
const root = path.resolve(__dirname,'..');
const read = f => JSON.parse(fs.readFileSync(path.join(root,f)));
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
async function main() {
  const catalog=read('catalogo.json'), approval=read('APROVACAO.json');
  const ids=catalog.comunidades.map(x=>x.id);
  const registered=fs.readdirSync(path.join(repo,'src/content/communities')).filter(x=>x.endsWith('.md')).map(x=>x.slice(0,-3));
  const errors=[];
  const check=(ok,message)=>{if(!ok)errors.push(message);};
  check(ids.length===93 && new Set(ids).size===93 && registered.length===93 && registered.every(x=>ids.includes(x)), 'Catálogo não corresponde às 93 comunidades');
  check(catalog.status==='aprovado' && catalog.aprovacao==='APROVACAO.json' && approval.status==='aprovado' && approval.declaracao==='Todas aprovadas!' && approval.versao_aprovada==='c1349b5165bf2a2db1cdfc97e0bade82eba367b6', 'Registro de aprovação ausente ou divergente');
  check(approval.modelos.length===95 && new Set(approval.modelos.map(x=>x.estilo)).size===95,'Registro deve identificar exatamente 95 modelos');
  const scenes=new Set();
  for(const id of ids) {
    const r=await validateCommunity(id);
    errors.push(...r.errors.map(e=>id+': '+e));
    if(r.ilustracao_sha256){check(!scenes.has(r.ilustracao_sha256),id+': fundo duplicado');scenes.add(r.ilustracao_sha256);}
  }
  check(catalog.genericos.length===2 && ['com-logo','sem-logo'].every(id=>catalog.genericos.some(x=>x.id===id)),'Genéricos incorretos');
  const jpg=fs.readFileSync(path.join(root,'genericos/ilustracao.jpg'));
  const brand=fs.readFileSync(path.join(root,'assets/baiao-tech-principal.svg'));
  check(!scenes.has(hash(jpg)),'Fundo genérico reutiliza comunidade');
  for(const id of ['com-logo','sem-logo']) {
    const dir=path.join(root,'genericos',id),style=read(`genericos/${id}/estilo.json`);
    const svg=fs.readFileSync(path.join(dir,'modelo.svg'),'utf8'),png=fs.readFileSync(path.join(dir,'modelo.png'));
    const record=approval.modelos.find(x=>x.estilo===`genericos/${id}/estilo.json`);
    check(style.status==='aprovado' && style.aprovacao?.versao_aprovada===approval.versao_aprovada && style.aprovacao?.declaracao===approval.declaracao,id+': aprovação divergente');
    check(record?.modelo_sha256===hash(Buffer.from(svg)) && record?.imagem_sha256===hash(png) && record?.ilustracao_sha256===hash(jpg),id+': versão diverge da aprovação');
    check(style.modelo_sha256===record?.modelo_sha256 && style.imagem_sha256===record?.imagem_sha256 && style.ilustracao_sha256===record?.ilustracao_sha256,id+': hashes do estilo divergentes');
    check(style.imagem==='modelo.png' && !('previa' in style),id+': caminho da imagem final incorreto');
    const meta=await sharp(png).metadata();
    check(meta.width===1080 && meta.height===1350,id+': dimensões incorretas');
    check((await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()).equals(await sharp(png).ensureAlpha().raw().toBuffer()),id+': PNG difere do SVG');
    check(svg.includes('data:image/jpeg;base64,'+jpg.toString('base64')) && svg.includes('data:image/svg+xml;base64,'+brand.toString('base64')),id+': fundo ou marca divergentes');
    check(!/review-label|em revis[aã]o|prévia de composi[çc][aã]o/i.test(svg),id+': aviso editorial indevido');
    for(const group of ['fixed-illustration','fixed-organizer','fixed-baiao-footer']) check(svg.includes(`id="${group}"`),id+': grupo ausente '+group);
    check(id!=='sem-logo' || (style.logo===null && style.logo_largura===0 && /id="organizer-name-1" x="72"/.test(svg)),id+': espaço vazio indevido');
    check(fs.readdirSync(dir).sort().join('|')==='estilo.json|modelo.png|modelo.svg',id+': arquivos extras');
  }
  for(const item of [...catalog.comunidades,...catalog.genericos]) {
    check(item.status==='aprovado' && item.imagem===path.posix.dirname(item.estilo)+'/modelo.png' && item.modelo===path.posix.dirname(item.estilo)+'/modelo.svg','Entrada final incorreta: '+item.id);
  }
  for(const old of ['lotes','retomada','referencias','previews','PROMPTS.json','genericos/REVISAO.json']) check(!fs.existsSync(path.join(root,old)),'Material auxiliar antigo presente: '+old);
  console.log(JSON.stringify({resultado:errors.length?'falhou':'ok',comunidades:ids.length,genericos:2,ilustracoes_exclusivas:scenes.size,errors},null,2));
  if(errors.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
