// Writes each app's accent (kit/brand.mjs accentCss) into kit/quadra.css,
// between the app-colours markers. Run after changing a brand colour:
//   node tools/accent-css.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { accentCss } from '../kit/brand.mjs';

const path = new URL('../kit/quadra.css', import.meta.url);
const css = await readFile(path, 'utf8');
const next = css.replace(/(\/\* app-colours \*\/)[\s\S]*?(\/\* \/app-colours \*\/)/, `$1\n${accentCss()}\n$2`);
if (next === css) console.log('quadra.css: app colours already current');
else await writeFile(path, next), console.log('quadra.css: app colours written');
