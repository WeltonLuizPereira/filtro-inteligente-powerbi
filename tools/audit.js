// Auditoria: confere capabilities.json x settings.ts x uso no visual.ts
// Uso: node tools/audit.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const caps = JSON.parse(read('capabilities.json'));
const settings = read('src/settings.ts');
const visual = read('src/visual.ts');

// cartões do painel (settings.ts): name, displayName e lista de slices
const cards = {};
const cardRe = /name = "(\w+)";\s*\n\s*displayName = "([^"]+)";\s*\n\s*slices[^=]*= \[([^\]]*)\]/g;
for (const m of settings.matchAll(cardRe)) {
  cards[m[1]] = { display: m[2], slices: m[3].split(',').map((s) => s.trim().replace('this.', '')).filter(Boolean) };
}
// campo da classe -> nome da propriedade
const sliceName = {};
const sliceRe = /(\w+) = (?:dd|tg|col|num)\("(\w+)"|(\w+) = new formattingSettings\.\w+\(\{ name: "(\w+)"/g;
for (const m of settings.matchAll(sliceRe)) {
  if (m[1]) sliceName[m[1]] = m[2]; else sliceName[m[3]] = m[4];
}

let problemas = 0;
const erro = (msg) => { problemas++; console.log('  x ' + msg); };

console.log('== capabilities x painel');
for (const [obj, def] of Object.entries(caps.objects)) {
  if (obj === 'general') continue;
  const card = cards[obj];
  if (!card) { erro('objeto "' + obj + '" nas capabilities sem cartao no settings.ts'); continue; }
  const capProps = Object.keys(def.properties);
  const modelProps = card.slices.map((s) => sliceName[s]);
  for (const p of modelProps) if (!capProps.includes(p)) erro(obj + '.' + p + ' esta no painel mas nao nas capabilities');
  for (const p of capProps) if (!modelProps.includes(p)) console.log('  . ' + obj + '.' + p + ' so nas capabilities (propriedade interna, sem controle no painel)');
}
for (const obj of Object.keys(cards)) if (!caps.objects[obj]) erro('cartao "' + obj + '" nao existe nas capabilities');

console.log('== painel x visual.ts');
for (const [obj, card] of Object.entries(cards)) {
  for (const sl of card.slices) {
    const prop = sliceName[sl];
    const re = new RegExp('\\.' + prop + '\\.(value|visible)');
    if (!re.test(visual)) erro(obj + '.' + prop + ' esta no painel mas o visual.ts nao usa (opcao morta)');
  }
}
for (const m of visual.matchAll(/settings\.(\w+)\./g)) {
  if (!cards[m[1]]) erro('visual.ts usa settings.' + m[1] + ', que nao existe');
}

console.log('== propriedades internas lidas do visual.ts');
for (const [obj, def] of Object.entries(caps.objects)) {
  if (obj === 'general') continue;
  const modelProps = (cards[obj] ? cards[obj].slices : []).map((s) => sliceName[s]);
  for (const p of Object.keys(def.properties)) {
    if (modelProps.includes(p)) continue;
    if (!visual.includes(p)) erro('propriedade interna ' + obj + '.' + p + ' nao e usada no visual.ts');
  }
}

console.log(problemas ? '\n' + problemas + ' problema(s)' : '\nOK: tudo consistente');
process.exit(problemas ? 1 : 0);
