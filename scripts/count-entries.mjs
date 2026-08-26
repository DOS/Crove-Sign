import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const enPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'en', 'web.po');
const content = fs.readFileSync(enPoPath, 'utf-8');

const lines = content.split('\n');
let count = 0;
for (const line of lines) {
  if (line.startsWith('msgid ')) count++;
}

console.log('Total msgid count:', count);
