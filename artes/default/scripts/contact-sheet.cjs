// Painel auxiliar para comparar consistência; não substitui revisão individual.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function main() {
  const id = process.argv[2];
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'lotes/PLANO.json')));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalogo.json')));
  const slugs = id === 'lote-01' ? catalog.comunidades.slice(0,10).map(x => x.id) : plan.lotes.find(x => x.id === id)?.comunidades;
  if (!slugs) throw Error('Lote desconhecido');
  const layers = [];
  for (let i = 0; i < slugs.length; i++) {
    layers.push({input: await sharp(path.join(root, 'comunidades', slugs[i], 'previa.png')).resize(324,405).png().toBuffer(),left:(i%5)*324,top:Math.floor(i/5)*405});
  }
  const out = path.join(root, 'previews', id + '.png');
  await sharp({create:{width:1620,height:Math.ceil(slugs.length/5)*405,channels:3,background:'#FCFAF7'}}).composite(layers).png().toFile(out);
  console.log(out);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
