const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../../..');
const root = path.join(repo, 'artes/default');
process.env.FONTCONFIG_FILE ||= path.join(root, 'assets/fonts.conf');
const sharp = require('sharp');
const matter = require('gray-matter');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const decode = value => value.replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const embedded = (svg, id) => {
  const tag = svg.match(new RegExp(`<image\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
  return tag?.match(/(?:xlink:)?href="data:[^;]+;base64,([^"]+)"/)?.[1];
};

async function validateCommunity(id) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  if (!/^[a-z0-9-]+$/.test(id)) return { id, ok: false, errors: ['Slug inválido'] };
  const dir = path.join(root, 'comunidades', id);
  const cadastro = `src/content/communities/${id}.md`;
  try {
    const data = matter.read(path.join(repo, cadastro)).data;
    const required = ['estilo.json', 'ilustracao.jpg', 'modelo.svg', 'previa.png', ...(data.cover_image ? ['logo.png'] : [])];
    for (const name of required) check(fs.existsSync(path.join(dir, name)), `Arquivo ausente: ${name}`);
    if (errors.length) return { id, ok: false, errors };
    const style = JSON.parse(fs.readFileSync(path.join(dir, 'estilo.json')));
    const svg = fs.readFileSync(path.join(dir, 'modelo.svg'), 'utf8');
    const jpg = fs.readFileSync(path.join(dir, 'ilustracao.jpg'));
    const png = fs.readFileSync(path.join(dir, 'previa.png'));
    check(style.id === id && style.nome === data.title && style.comunidade === cadastro, 'Vínculo/nome do cadastro divergente');
    check(style.status === 'em_revisao' && style.aprovacao === null, 'Estado deve permanecer em_revisao, aprovacao:null');
    for (const fixed of ['fixed-illustration','fixed-organizer','fixed-baiao-footer']) check(svg.includes(`id="${fixed}"`), `Grupo fixo ausente: ${fixed}`);
    for (const field of ['agenda-month','event-title-1','event-title-2','event-title-3','event-category','event-date-time','event-location','review-label']) check(svg.includes(`id="${field}"`), `Campo editável ausente: ${field}`);
    check(/<svg\b[^>]*width="1080"[^>]*height="1350"/.test(svg), 'Dimensões SVG incorretas');
    check(svg.includes('baiaotech.org') && svg.includes('EM REVISÃO'), 'Rodapé ou marcador de revisão ausente');
    check(!/(?:xlink:)?href="(?:https?:|\/|file:)/.test(svg), 'SVG depende de imagem externa');
    const names = [...svg.matchAll(/<text\b[^>]*id="organizer-name-\d+"[^>]*>([^<]*)<\/text>/g)].map(m => decode(m[1])).join(' ');
    check(names === data.title, 'Nome editável não corresponde ao cadastro');
    const illustration = svg.match(/<g\b[^>]*id="fixed-illustration"[^>]*>[\s\S]*?<image\b[^>]*(?:xlink:)?href="data:image\/jpeg;base64,([^"]+)"/)?.[1];
    check(illustration && hash(Buffer.from(illustration, 'base64')) === hash(jpg), 'Ilustração incorporada diverge do JPEG');
    const footer = embedded(svg, 'baiao-tech-logo');
    check(footer && hash(Buffer.from(footer, 'base64')) === hash(fs.readFileSync(path.join(root, 'assets/baiao-tech-principal.svg'))), 'Marca Baião Tech não corresponde ao original');
    const footerGroup = content => content.match(/<g\b[^>]*id="fixed-baiao-footer"[^>]*>[\s\S]*?<\/g>/)?.[0];
    const baseSvg = fs.readFileSync(path.join(root, 'genericos/com-logo/modelo.svg'), 'utf8');
    check(footerGroup(svg) === footerGroup(baseSvg), 'Grupo do rodapé diverge da base: preservar posições, proporções, assinatura e URL');
    if (data.cover_image) {
      const source = path.join(repo, 'src', data.cover_image);
      const logo = fs.readFileSync(path.join(dir, 'logo.png'));
      check(style.logo_origem === 'src' + data.cover_image && style.logo_origem_sha256 === hash(fs.readFileSync(source)), 'Origem/hash da logo não corresponde ao cadastro');
      const a = await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer();
      const b = await sharp(logo).toColourspace('srgb').ensureAlpha().raw().toBuffer();
      check(hash(a) === hash(b), 'Logo PNG tem pixels diferentes da imagem cadastrada');
      const logoEmbedded = embedded(svg, 'organizer-logo');
      check(logoEmbedded && hash(Buffer.from(logoEmbedded, 'base64')) === hash(logo), 'Logo incorporada diverge do PNG');
      check(/<image\b[^>]*id="organizer-logo"[^>]*preserveAspectRatio="xMidYMid meet"/.test(svg), 'Logo sem proporção preservada');
    } else {
      check(style.logo === null && style.logo_largura === 0 && !svg.includes('id="organizer-logo"'), 'Comunidade sem logo deve ter cabeçalho nominal');
      check(/id="organizer-name-1" x="72"/.test(svg), 'Espaço de logo reservado indevidamente');
    }
    const meta = await sharp(png).metadata();
    check(meta.width === 1080 && meta.height === 1350 && meta.format === 'png', 'Prévia fora do formato1080x1350 PNG');
    const rendered = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
    const preview = await sharp(png).ensureAlpha().raw().toBuffer();
    check(hash(rendered) === hash(preview), 'Prévia PNG não corresponde à renderização atual do SVG');
    // Salvaguarda de margens: não substitui julgamento de estilo/anatomia.
    const occupied = async (input, top, height) => {
      const pixels = await sharp(input).toColourspace('srgb').removeAlpha().extract({left:0,top,width:1080,height}).raw().toBuffer();
      let count = 0;
      for (let i=0; i<pixels.length; i+=3) {
        const hi = Math.max(pixels[i],pixels[i+1],pixels[i+2]);
        const lo = Math.min(pixels[i],pixels[i+1],pixels[i+2]);
        if ((hi-lo>24 && lo<225) || hi<200) count++;
      }
      return count;
    };
    const sceneGroup = svg.match(/<g\b[^>]*id="fixed-illustration"[^>]*>[\s\S]*?<\/g>/)?.[0];
    const scene = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350"><rect width="1080" height="1350" fill="#FCFAF7"/>${sceneGroup || ''}</svg>`);
    const headerPixels = await occupied(scene, 0, 292);
    const footerPixels = await occupied(png, 1180, 48);
    check(headerPixels <= 100, `Ilustração invade faixa do cabeçalho (${headerPixels} pixels marcados)`);
    check(footerPixels <= 100, `Ilustração invade respiro do rodapé y1180–1228 (${footerPixels} pixels marcados)`);
    return { id, ok: errors.length === 0, errors, ilustracao_sha256: hash(jpg), previa_sha256: hash(png), modelo_sha256: hash(svg), nome: data.title };
  } catch (error) {
    return { id, ok: false, errors: [...errors, error.message] };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'lotes/PLANO.json')));
  const ids = args[0] === 'lote-01' ? JSON.parse(fs.readFileSync(path.join(root, 'catalogo.json'))).comunidades.slice(0,10).map(x=>x.id) : args[0]?.startsWith('lote-') ? plan.lotes.find(b => b.id === args[0])?.comunidades : args;
  if (!ids?.length) throw new Error('Informe lote-XX ou um ou mais slugs');
  const results = [];
  for (const id of ids) results.push(await validateCommunity(id));
  console.log(JSON.stringify({ resultado: results.every(r => r.ok) ? 'ok' : 'falhou', comunidades: results }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateCommunity };
