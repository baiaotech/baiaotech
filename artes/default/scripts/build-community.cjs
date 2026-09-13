const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '../../..');
const root = path.join(repo, 'artes/default');
process.env.FONTCONFIG_FILE ||= path.join(root, 'assets/fonts.conf');
const sharp = require('sharp');
const matter = require('gray-matter');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const xml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const uri = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const font = uri(path.join(repo, 'src/assets/fonts/inter-latin-variable.woff2'), 'font/woff2');
const brand = uri(path.join(root, 'assets/baiao-tech-principal.svg'), 'image/svg+xml');
function text(id, x, y, size, value, weight=600, color='#1F1F1F', extra='') {
  return `<text id="${id}" x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${xml(value)}</text>`;
}
const calendar = `<g transform="translate(77 639)" fill="none" stroke="#F9733B" stroke-width="2.5" stroke-linecap="round"><rect x="0" y="5" width="27" height="26" rx="3"/><path d="M0 13h27M7 0v9M20 0v9"/></g>`;
const pin = `<g transform="translate(77 760)" fill="none" stroke="#F9733B" stroke-width="2.5"><path d="M13 31S1 18 1 11a12 12 0 0124 0c0 7-12 20-12 20Z"/><circle cx="13" cy="11" r="4"/></g>`;
function svg(style, background, logo) {
  const lines = style.linhas_nome;
  const nameX = style.logo_largura ? 72 + style.logo_largura + 34 : 72;
  let header = '';
  if (style.id === 'com-logo') {
    header += `<g id="organizer-logo-placeholder"><rect x="72" y="139" width="120" height="120" rx="6" fill="#F6D7B7"/>${text('logo-demo',132,185,20,'LOGO',700,'#8B3E2F','text-anchor="middle"')}${text('logo-demo-2',132,215,17,'AQUI',600,'#8B3E2F','text-anchor="middle"')}</g>`;
  } else if (logo) {
    if (style.logo_fundo) header += `<rect id="logo-contrast" x="72" y="151" width="${style.logo_largura}" height="96" rx="6" fill="${style.logo_fundo}"/>`;
    const inset = style.logo_fundo ? 12 : 0;
    header += `<image id="organizer-logo" x="${72+inset}" y="139" width="${style.logo_largura-inset*2}" height="120" preserveAspectRatio="xMidYMid meet" xlink:href="${logo}"/>`;
  }
  lines.forEach((line,i) => {
    const y = lines.length === 1 ? 202 : 177 + i*50;
    header += text(`organizer-name-${i+1}`,nameX,y,style.nome_tamanho,line,800,'#8B3E2F','letter-spacing="-1.5"');
  });
  header += text('organizer-location',nameX,lines.length===1?244:260,19,style.subtitulo.toUpperCase(),500,'#675D56','letter-spacing="1.2"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="card-title card-description">
<title id="card-title">${xml(style.nome)} — modelo de postagem</title>
<desc id="card-description">${xml(style.conceito)} Campos demonstrativos de evento, data e local. Assinatura do Baião Tech no rodapé. Em revisão; não publicar.</desc>
<defs><style>@font-face{font-family:'Inter Variable';src:url('${font}') format('woff2');font-weight:100 900;} text{font-family:'Inter Variable',Inter,sans-serif;}</style></defs>
<rect width="1080" height="1350" fill="${style.fundo_canvas || '#FCFAF7'}"/>
<g id="fixed-illustration"><image${style.ilustracao_y ? ` y="${style.ilustracao_y}"` : ''} width="1080" height="1350" xlink:href="${background}"/>${style.onda_rodape ? '<path id="illustration-footer-wave" d="M0 1130 C160 1085 315 1175 510 1150 C700 1125 850 1095 1080 1145 L1080 1350 H0 Z" fill="#FCFAF7"/>' : ''}</g>
<g id="agenda-heading">
<path d="M72 64h44" fill="none" stroke="#F9733B" stroke-width="3"/>
${text('agenda-month',138,72,22,'MÊS DA AGENDA',700,'#1F1F1F','letter-spacing="3"')}
${text('review-label',1008,70,15,'MODELO · EM REVISÃO',600,'#8B3E2F','text-anchor="end" letter-spacing="1.2"')}
</g>
<g id="fixed-organizer">${header}<path d="M72 292h936" fill="none" stroke="#DDCABB" stroke-width="1"/></g>
<g id="event-fields">
${text('event-title-1',68,429,108,'Nome do',900,'#1F1F1F','letter-spacing="-5"')}
${text('event-title-2',68,535,108,'evento',900,'#1F1F1F','letter-spacing="-5"')}
${text('event-title-3',68,597,60,'',800,'#1F1F1F','letter-spacing="-2"')}
${text('event-category',73,588,16,'PRÉVIA DE COMPOSIÇÃO',600,'#8B3E2F','letter-spacing="2"')}
${calendar}${text('date-caption',124,652,16,'DATA E HORÁRIO',700,'#8B3E2F','letter-spacing="1"')}
${text('event-date-time',124,700,36,'DD MÊS · HH:MM',700,'#1F1F1F','letter-spacing="-1"')}
${pin}${text('location-caption',124,772,16,'LOCAL / FORMATO',700,'#8B3E2F','letter-spacing="1"')}
${text('event-location',124,820,34,'A confirmar',700,'#1F1F1F','letter-spacing="-1"')}
</g>
<g id="fixed-baiao-footer">
<image id="baiao-tech-logo" x="72" y="1230" width="150" height="86" preserveAspectRatio="xMidYMid meet" xlink:href="${brand}"/>
<path d="M246 1239v74" stroke="#DCC6B4" stroke-width="1"/>
${text('footer-curation',270,1253,15,'CURADORIA',600,'#8B3E2F','letter-spacing="1.6"')}
${text('footer-copy-1',270,1282,18,'Eventos e comunidades',400,'#675D56')}
${text('footer-copy-2',270,1307,18,'de tecnologia.',400,'#675D56')}
${text('footer-url',1008,1284,23,'baiaotech.org',600,'#8B3E2F','text-anchor="end" letter-spacing="-0.6"')}
</g>
</svg>\n`;
}

// Build only the selected community; never overwrite catalogues or other models.
async function buildCommunity(spec) {
  if (!/^[a-z0-9-]+$/.test(spec.id || '')) throw new Error('Invalid community id');
  if (!spec.conceito || !spec.ilustracao) throw new Error('conceito and ilustracao are required');
  if (spec.ilustracao_y !== undefined && (!Number.isInteger(spec.ilustracao_y) || spec.ilustracao_y < -100 || spec.ilustracao_y > 100)) throw new Error('ilustracao_y deve ser inteiro entre -100 e 100');
  const source = `src/content/communities/${spec.id}.md`;
  const data = matter.read(path.join(repo, source)).data;
  const dir = path.join(root, 'comunidades', spec.id);
  fs.mkdirSync(dir, {recursive: true});
  const imagePath = path.resolve(spec.ilustracao);
  const illustration = path.join(dir, 'ilustracao.jpg');
  const original = fs.readFileSync(imagePath);
  const imageMeta = await sharp(original).metadata();
  if (imageMeta.format === 'jpeg' && imageMeta.width === 1080 && imageMeta.height === 1350) {
    // Reuse recovered JPEGs without a lossy re-encoding on each layout adjustment.
    if (imagePath !== illustration) fs.copyFileSync(imagePath, illustration);
  } else {
    await sharp(original).resize(1080,1350,{fit:spec.ajuste_ilustracao || 'cover',position:'centre',background:'#FCFAF7'}).jpeg({quality:92,mozjpeg:true}).toFile(illustration);
  }
  // O pequeno trecho de tela exposto por reposicionamento acompanha o papel da borda,
  // evitando uma faixa horizontal de outro tom. Não altera nenhum pixel do insumo.
  let canvasColor;
  if (spec.ilustracao_y) {
    const edgeBuffer = await sharp(illustration).extract({left:0,top:spec.ilustracao_y > 0 ? 0 : 1346,width:1080,height:4}).png().toBuffer();
    const edge = await sharp(edgeBuffer).stats();
    canvasColor = '#' + edge.channels.slice(0,3).map(c => Math.round(c.mean).toString(16).padStart(2,'0')).join('');
  }
  const logoSource = data.cover_image ? path.join(repo, 'src', data.cover_image) : null;
  if (logoSource && !fs.existsSync(logoSource)) throw new Error('Registered cover does not exist: '+logoSource);
  let logoWidth = 0;
  if (logoSource) {
    const meta = await sharp(logoSource).metadata();
    logoWidth = spec.logo_largura || Math.max(120, Math.min(280, Math.round(120*meta.width/meta.height)));
    await sharp(logoSource).png().toFile(path.join(dir, 'logo.png'));
  }
  const available = 1008-(logoWidth ? 72+logoWidth+34 : 72);
  let size=spec.nome_tamanho || 54;
  let lines=spec.linhas_nome;
  if(!lines){
    const capacity=Math.floor(available/(size*0.57));
    lines=[''];
    for(const word of data.title.split(/\s+/)){
      const i=lines.length-1;
      if(lines[i] && lines[i].length+1+word.length>capacity) lines.push(word);
      else lines[i]+=(lines[i]?' ':'')+word;
    }
    if(lines.length>2) {lines=[data.title];size=Math.min(size,Math.floor(available/(data.title.length*0.57)));}
  }
  if(lines.length>2) throw new Error('Use at most two community name lines');
  const location=[data.city, data.state].filter(Boolean).join(', ');
  const style={
    id:spec.id,nome:data.title,status:'em_revisao',aprovacao:null,
    comunidade:source,estado:data.state,cidade:data.city || '',conceito:spec.conceito,
    linhas_nome:lines,nome_tamanho:size,logo_largura:logoWidth,
    subtitulo:'Comunidade'+(location?' · '+location:''),
    logo_origem:logoSource?'src'+data.cover_image:null,
    logo_origem_sha256:logoSource?hash(fs.readFileSync(logoSource)):null,
    logo:logoSource?'logo.png':null,
    ilustracao:'ilustracao.jpg',modelo:'modelo.svg',previa:'previa.png',referencia_aprovada:null,
    observacao:'Ilustração exclusiva desta comunidade. Arquitetura e pessoas são ilustrativas; não representam sede, local de evento ou participantes reais.'+
      (logoSource?'':' Cadastro sem cover_image: cabeçalho nominal exclusivo, sem logo inventada nem espaço vazio reservado.'),
    ...(spec.logo_fundo ? {logo_fundo:spec.logo_fundo} : {}),
    ...(spec.onda_rodape === true ? {onda_rodape:true} : {}),
    ...(spec.ilustracao_y ? {ilustracao_y:spec.ilustracao_y,fundo_canvas:canvasColor} : {})
  };
  writeJSON(path.join(dir,'estilo.json'),style);
  const contents=svg(style,uri(illustration,'image/jpeg'),logoSource?uri(path.join(dir,'logo.png'),'image/png'):null);
  fs.writeFileSync(path.join(dir,'modelo.svg'),contents);
  await sharp(Buffer.from(contents)).png().toFile(path.join(dir,'previa.png'));
  return {id:spec.id,dir,style};
}
if (require.main === module) {
  const specFile=process.argv[2];
  if(!specFile) {console.error('Usage: node build-community.cjs spec.json');process.exit(1);}
  buildCommunity(JSON.parse(fs.readFileSync(specFile,'utf8'))).then(r=>console.log(JSON.stringify({id:r.id,dir:r.dir}))).catch(e=>{console.error(e);process.exit(1)});
}
module.exports={buildCommunity};
