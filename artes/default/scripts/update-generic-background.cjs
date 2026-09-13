// Substitui somente o insumo raster dos dois SVGs genéricos; preserva todos os demais bytes do SVG.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.FONTCONFIG_FILE = path.join(root, 'assets/fonts.conf');
const sharp = require('sharp');
async function main() {
  const input = process.argv[2];
  if (!input) throw Error('Informe PNG gerado e visualmente inspecionado.');
  const previous = path.join(root, 'genericos/ilustracao-anterior-nao-aprovada.jpg');
  const target = path.join(root, 'genericos/ilustracao.jpg');
  if (!fs.existsSync(previous)) fs.copyFileSync(target, previous);
  fs.copyFileSync(input, path.join(root, 'genericos/geracao-corrigida.png'));
  await sharp(input).resize(1080, 1350, {fit: 'cover'}).jpeg({quality: 92, mozjpeg: true}).toFile(target);
  const encoded = fs.readFileSync(target).toString('base64');
  for (const id of ['com-logo', 'sem-logo']) {
    const svgPath = path.join(root, 'genericos', id, 'modelo.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    const matches = svg.match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g);
    if (matches?.length !== 1) throw Error('JPEG incorporado ambíguo: ' + id);
    const updated = svg.replace(matches[0], 'data:image/jpeg;base64,' + encoded);
    fs.writeFileSync(svgPath, updated);
    await sharp(Buffer.from(updated)).png().toFile(path.join(root, 'genericos', id, 'previa.png'));
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
