// Renames dist-single/index.html -> free-casino.html and copies it to ../free-casino-play.html
import { renameSync, copyFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('dist-single/free-casino.html');
renameSync(resolve('dist-single/index.html'), out);
const html = readFileSync(out, 'utf8');
const markup = html.replace(/<script[\s\S]*?<\/script>/g, '<script></script>').replace(/<style[\s\S]*?<\/style>/g, '');
const external = [...markup.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?\b(?:src|href)=["'](?!data:)([^"']+)["']/g)].map((m) => m[1]);
if (external.length) throw new Error('single build still references external files: ' + external.join(', '));
if (process.env.COPY_TO) copyFileSync(out, resolve(process.env.COPY_TO));
console.log(`dist-single/free-casino.html  ${(statSync(out).size / 1024).toFixed(0)} KiB`);
