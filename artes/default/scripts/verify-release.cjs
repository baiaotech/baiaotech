// Confere o snapshot Git publicado sem confundir alterações locais em andamento com o release.
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '../../..');
const ref = process.argv[2] || 'HEAD';
const git = args => execFileSync('git', args, {cwd:repo, maxBuffer:40*1024*1024});
const commit = git(['rev-parse', '--verify', ref + '^{commit}']).toString().trim();
const prefix = 'artes/default/';
const lines = git(['show', commit + ':' + prefix + 'SHA256SUMS']).toString().trim().split('\n');
let count = 0;
for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match || match[2].startsWith('/') || match[2].split('/').includes('..')) throw Error('Entrada de checksum inválida');
  const bytes = git(['show', commit + ':' + prefix + match[2]]);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== match[1]) throw Error('Checksum divergente: ' + match[2]);
  count++;
}
const files = git(['ls-tree','-r','--name-only',commit,'--',prefix]).toString().trim().split('\n').filter(x => x !== prefix + 'SHA256SUMS');
if (files.length !== count) throw Error('Cobertura incompleta dos checksums');
console.log(JSON.stringify({commit,arquivos:count,checksums:'ok',cobertura:'completa'}));
