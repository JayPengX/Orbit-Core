// Chinese drawn in Taiwan's glyphs in our screenshots and recordings. The kit's
// font stack names PingFang TC and Noto Sans TC; a Linux machine (the cloud,
// GitHub Actions) has neither, so the browser fell back to the first CJK font
// fontconfig had: Noto Sans CJK JP (Japanese shapes: 説 for 說, 骨 drawn
// otherwise) or none at all (boxes). Imported first by every tool that starts a
// browser: on Linux it writes a user fontconfig file pointing those names, and
// any zh-TW text, at Noto Sans CJK TC (package fonts-noto-cjk) when it's there.
// A Mac draws PingFang itself: nothing is written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TC = 'Noto Sans CJK TC';
const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
${['PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'sans-serif', 'system-ui'].map(f => `  <match target="pattern"><test name="lang" compare="contains"><string>zh-tw</string></test><test name="family"><string>${f}</string></test><edit name="family" mode="prepend" binding="strong"><string>${TC}</string></edit></match>`).join('\n')}
${['PingFang TC', 'Noto Sans TC'].map(f => `  <alias binding="same"><family>${f}</family><prefer><family>${TC}</family></prefer></alias>`).join('\n')}
</fontconfig>
`;

export function chineseFonts() {
  if (process.platform !== 'linux') return false;
  let has = '';
  try {
    has = execFileSync('fc-list', [`:family=${TC}`, 'family'], { encoding: 'utf8' });
  } catch {}
  if (!has.trim()) {
    let any = '';
    try {
      any = execFileSync('fc-list', [':lang=zh-tw', 'family'], { encoding: 'utf8' });
    } catch {}
    if (!any.trim()) console.warn(`fonts: ${TC} isn't installed (apt-get install fonts-noto-cjk): Chinese may draw in Japanese shapes`);
    return false;
  }
  const dir = join(homedir(), '.config/fontconfig/conf.d');
  const file = join(dir, '60-orbit-tc.conf');
  if (existsSync(file) && readFileSync(file, 'utf8') === conf) return true;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, conf);
  try {
    execFileSync('fc-cache', ['-f'], { stdio: 'ignore' });
  } catch {}
  return true;
}
chineseFonts();
