import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(path.join(root, 'public'), output, { recursive: true });
console.log(`Build concluído: ${(await readdir(output)).length} entradas em dist.`);
