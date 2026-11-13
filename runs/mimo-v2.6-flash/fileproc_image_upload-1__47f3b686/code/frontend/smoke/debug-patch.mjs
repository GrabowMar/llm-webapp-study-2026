import fs from 'node:fs';
const p = 'smoke/ui-test.tsx';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(
  'return realFetch(url, init);',
  `console.log("FETCH >", init?.method ?? "GET", url.toString());
      return realFetch(url, init).then((r) => { console.log("FETCH <", r.status, url.toString()); return r; }, (e) => { console.log("FETCH !", e?.message, url.toString()); throw e; });`
);
fs.writeFileSync(p, s);
console.log('patched');
