// Builds the three next/font variants into ../next-font, ../next-font-nopreload
// and ../next-font-noadjust. next/font only accepts literal calls assigned to
// module-level consts, so each variant rewrites app/fonts.js before its build.
//
//   pnpm install && pnpm build
import { execFileSync } from 'node:child_process';
import { renameSync, rmSync, writeFileSync } from 'node:fs';

const VARIANTS = { 'next-font': '', 'next-font-nopreload': ', preload: false', 'next-font-noadjust': ', adjustFontFallback: false' };

for (const [variant, extra] of Object.entries(VARIANTS)) {
  writeFileSync('app/fonts.js', `// Written by build.mjs for ${variant}. The composite set from build-full.py.
// Noto Sans KR and Noto Serif KR list only latin-family subsets on Google,
// so 'latin' is the only subset there is to name.
import { Inter, Noto_Sans_KR, Noto_Serif_KR, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--inter'${extra} });
export const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--noto-sans'${extra} });
export const notoSerif = Noto_Serif_KR({ subsets: ['latin'], weight: '700', variable: '--noto-serif'${extra} });
export const mono = JetBrains_Mono({ subsets: ['latin'], weight: '400', variable: '--mono'${extra} });
`);
  // A shared .next lets one variant's font CSS leak into the next build.
  rmSync('out', { recursive: true, force: true });
  rmSync('.next', { recursive: true, force: true });
  // --webpack: in 16.3.4 the Turbopack build kept the adjusted fallback faces
  // even with adjustFontFallback: false (clean .next, checked 2026-10-26).
  execFileSync('pnpm', ['exec', 'next', 'build', '--webpack'], { stdio: 'inherit', env: { ...process.env, NF_VARIANT: variant, NEXT_TELEMETRY_DISABLED: '1' } });
  rmSync(`../${variant}`, { recursive: true, force: true });
  renameSync('out', `../${variant}`);
}
