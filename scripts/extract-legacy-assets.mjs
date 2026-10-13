#!/usr/bin/env node
/**
 * Extrae los logos embebidos (base64) del cotizador de un solo archivo a PNG en
 * front/public/brand/. Solo lee las constantes LOGO_*; no copia datos de clientes.
 *
 * Uso: npm run legacy:extract-assets -- "C:\ruta\cotizador-ggis-v68.html"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Indica la ruta del HTML original. Ej: npm run legacy:extract-assets -- ./cotizador-ggis-v68.html');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'front', 'public', 'brand');
fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(source, 'utf8');
const names = { LOGO_GYG: 'gyg.png', LOGO_SOLT: 'solt.png', LOGO_SENSOR: 'sensormatic.png', LOGO_POTTER: 'potter.png' };
let found = 0;
for (const [constant, file] of Object.entries(names)) {
  const m = new RegExp(`const ${constant} = 'data:image/png;base64,([A-Za-z0-9+/=]+)'`).exec(html);
  if (!m) {
    console.warn(`No se encontró ${constant}`);
    continue;
  }
  fs.writeFileSync(path.join(outDir, file), Buffer.from(m[1], 'base64'));
  console.log(`✓ ${file}`);
  found++;
}
process.exit(found ? 0 : 1);
