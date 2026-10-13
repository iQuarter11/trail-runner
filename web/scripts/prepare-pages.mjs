import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../dist/', import.meta.url));
const destination = fileURLToPath(new URL('../../docs/', import.meta.url));
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
writeFileSync(new URL('../../docs/.nojekyll', import.meta.url), '');
console.log('Prepared docs/ for GitHub Pages.');
