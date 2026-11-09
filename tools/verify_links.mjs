import fs from 'node:fs';
import path from 'node:path';

const files = fs.readdirSync('dist/csharp', { recursive: true })
  .filter(f => f.endsWith('.html'))
  .map(f => path.join('dist/csharp', f));

let broken = 0;
let checked = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.matchAll(/src="([^"]+)"/g);
  for (const m of matches) {
    const src = m[1];
    if (src.startsWith('/movtobase/images/')) {
      checked++;
      const rel = src.replace('/movtobase/', 'dist/');
      if (!fs.existsSync(rel)) {
        console.error(`Broken link: ${src} in ${file}`);
        broken++;
      }
    }
  }
}

console.log(`Checked ${checked} image references. Broken links: ${broken}`);
if (broken > 0) process.exit(1);
