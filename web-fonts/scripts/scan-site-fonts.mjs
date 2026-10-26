// Lists the @font-face rules a site declares: family, faces, unicode-range count,
// formats, font-display and hosts. Bytes actually downloaded come from
//   WARM=0 node scripts/measure-round2.mjs 2 https:/ none www.musinsa.com/ toss.im/ ...
// (results/2026-10-26-korean-services.json, measured with no throttling).
//
//   node scripts/scan-site-fonts.mjs https://toss.im https://www.kurly.com

const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const get=async u=>{try{const r=await fetch(u,{headers:{'user-agent':UA,'accept-language':'ko-KR'},redirect:'follow',signal:AbortSignal.timeout(15000)});return {url:r.url,text:await r.text()}}catch(e){return {url:u,text:''}}};
for (const site of process.argv.slice(2)){
  const {url,text:html}=await get(site);
  const links=[...html.matchAll(/<link[^>]+>/g)].map(m=>m[0]);
  const css=links.filter(l=>/stylesheet/.test(l)).map(l=>(l.match(/href="([^"]+)"/)||[])[1]).filter(Boolean).map(h=>new URL(h.replace(/&amp;/g,'&'),url).href);
  const pre=links.filter(l=>/preload/.test(l)&&/font/.test(l)).length;
  const pc=links.filter(l=>/preconnect/.test(l)).map(l=>(l.match(/href="([^"]+)"/)||[])[1]);
  let all=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  for (const c of css.slice(0,15)){const r=await get(c); all+='\n'+r.text; for (const im of r.text.matchAll(/@import\s+(?:url\()?["']?([^"')]+)/g)){all+='\n'+(await get(new URL(im[1],c).href)).text}}
  const faces=[...all.matchAll(/@font-face\s*{([^}]*)}/g)].map(m=>m[1]);
  const fam={};for(const f of faces){const n=((f.match(/font-family:\s*([^;]+)/)||[])[1]||'?').replace(/["']/g,'').trim();const o=fam[n]??={faces:0,ranged:0,hosts:new Set(),fmt:new Set(),disp:new Set(),w:new Set()};o.faces++;if(/unicode-range/.test(f))o.ranged++;for(const u of f.matchAll(/url\(["']?([^"')]+)/g)){try{o.hosts.add(new URL(u[1],css[0]||url).host)}catch{};const e=(u[1].match(/\.(woff2|woff|ttf|otf|eot)/)||[])[1];if(e)o.fmt.add(e)}const d=(f.match(/font-display:\s*(\w+)/)||[])[1];if(d)o.disp.add(d);const w=(f.match(/font-weight:\s*([^;]+)/)||[])[1];if(w)o.w.add(w.trim())}
  console.log(`\n## ${site} -> ${url}  css ${css.length}, font preload ${pre}, preconnect ${pc.join(' ')}`);
  for(const [n,o] of Object.entries(fam)) console.log(`  ${n}: faces ${o.faces}, unicode-range ${o.ranged}, weights [${[...o.w].slice(0,6)}], ${[...o.fmt]}, display ${[...o.disp]}, hosts ${[...o.hosts].join(' ')}`);
  const ff=[...new Set([...all.matchAll(/font-family:\s*([^;}]+)/g)].map(m=>m[1].trim()))].filter(x=>!/^var\(/.test(x)).slice(0,3);
  console.log('  body stacks:', ff.join(' || ').slice(0,300));
}
