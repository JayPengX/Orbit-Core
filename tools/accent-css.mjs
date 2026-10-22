// Writes each app's accent (kit/brand.mjs accentCss) into kit/orbit.css,
// between the app-colours markers. Run after changing a brand colour:
//   node tools/accent-css.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { accentCss } from '../kit/brand.mjs';

const path = new URL('../kit/orbit.css', import.meta.url);
const css = await readFile(path, 'utf8');
const next = css.replace(/(\/\* app-colours \*\/)[\s\S]*?(\/\* \/app-colours \*\/)/, `$1\n${accentCss()}\n$2`);
if (next === css) console.log('orbit.css: app colours already current');
else await writeFile(path, next), console.log('orbit.css: app colours written');
