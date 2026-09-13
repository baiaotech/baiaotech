// Main-agent-only release utility: hash the INDEX, never another batch's unfinished worktree files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../../..');
const prefix = 'artes/default/';
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--', prefix], { cwd: repo }).toString().split('\0').filter(Boolean).filter(f => f !== prefix + 'SHA256SUMS').sort();
const sums = files.map(file => {
  const bytes = execFileSync('git', ['show', ':' + file], { cwd: repo, maxBuffer: 30 * 1024 * 1024 });
  return crypto.createHash('sha256').update(bytes).digest('hex') + '  ' + file.slice(prefix.length);
});
fs.writeFileSync(path.join(repo, prefix, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`${sums.length} arquivos do índice incluídos em SHA256SUMS.`);
