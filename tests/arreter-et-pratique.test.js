// « Arrêter » sans résultat (#21) et pratique réussie à refaire (#22).
const { chromium } = require('playwright');
const assert = require('assert');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGE = process.argv[2] || '';
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
const solve = (t) => { const s = t.replace(/\s+/g, '').replace('−', '-'); const m = /^(\d*)([×÷+\-])(\d*)=(\d*)$/.exec(s); if (!m) return '0'; const [, a, op, b, c] = m; const A = +a, B = +b, C = +c;
  if (c === '') return String({ '×': A * B, '÷': A / B, '+': A + B, '-': A - B }[op]);
  if (a === '') return String({ '×': C / B, '+': C - B, '÷': C * B, '-': C + B }[op]);
  return String({ '×': C / A, '+': C - A, '÷': A / C, '-': A - C }[op]); };
const ok = (m) => console.log('✓ ' + m);
(async () => {
  await new Promise((r) => srv.listen(8768, r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.__ev = []; Object.defineProperty(window, 'goatcounter', { configurable: true, get() { return { count: (x) => window.__ev.push(x.path) }; }, set() {} }); });
  await p.route(/web3forms|fonts\.g/, (r) => r.fulfill({ status: 204, body: '' }));
  await p.goto('http://localhost:8768/' + PAGE);
  await p.click('#count-12', { force: true });
  const hist = () => p.evaluate(() => (JSON.parse(localStorage.getItem('tablesMinute.history.v1') || '[]')).length);
  // 1. Arrêter pendant le décompte : retour immédiat
  await p.click('#start'); await p.waitForTimeout(800);
  await p.click('#quit');
  assert.ok(await p.locator('#setup').isVisible()); assert.strictEqual(await hist(), 0);
  await p.waitForTimeout(3500);
  assert.ok(await p.locator('#setup').isVisible(), 'le décompte ne relance pas la feuille');
  ok('arrêter pendant le décompte');
  // 2. Arrêter après une réponse : il faut confirmer, rien n'est gardé
  await p.click('#start'); await p.waitForTimeout(3600);
  await p.keyboard.type('5');
  await p.click('#quit');
  assert.strictEqual((await p.textContent('#quit')).trim(), 'Touche encore pour arrêter');
  assert.ok(await p.locator('#test').isVisible());
  await p.click('#quit');
  assert.ok(await p.locator('#setup').isVisible()); assert.strictEqual(await hist(), 0, 'aucun résultat gardé');
  await p.keyboard.type('7');
  ok('arrêter avec confirmation, aucun résultat gardé, clavier inactif ensuite');
  // 3. Une vraie feuille marche encore, puis pratique, puis « Refaire ces questions, mélangées »
  await p.click('#start'); await p.waitForTimeout(3600);
  let ts = await p.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent));
  for (let i = 0; i < ts.length; i++) { await p.keyboard.type(i < 3 ? '99' : solve(ts[i])); await p.keyboard.press('Enter'); }
  await p.click('#done', { force: true });
  await p.waitForSelector('#results:not([hidden])');
  assert.strictEqual(await hist(), 1); assert.match(await p.textContent('#score'), /9/);
  await p.click('#retry'); await p.waitForTimeout(3600);
  ts = await p.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, '')));
  for (const t of ts) { await p.keyboard.type(solve(t)); await p.keyboard.press('Enter'); }
  await p.click('#done', { force: true }); await p.waitForTimeout(400);
  assert.match((await p.textContent('#score')).replace(/\s+/g, ''), /^3\/3/);
  assert.strictEqual((await p.textContent('#retry')).trim(), 'Refaire ces questions, mélangées');
  const factsOf = (list) => list.map((t) => { const n = t.match(/\d+/g).map(Number).sort((a, b) => a - b); return n.join(','); }).sort().join('|');
  await p.click('#retry'); await p.waitForTimeout(3600);
  const ts2 = await p.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, '')));
  assert.strictEqual(ts2.length, 3);
  assert.ok(await p.locator('#test-title').textContent().then((x) => /Pratique/.test(x)));
  ok('pratique réussie → refaire les mêmes calculs mélangés : ' + ts.join(' ') + ' → ' + ts2.join(' '));
  for (const t of ts2) { await p.keyboard.type(solve(t)); await p.keyboard.press('Enter'); }
  await p.click('#done', { force: true }); await p.waitForTimeout(400);
  assert.strictEqual(await hist(), 1, 'les pratiques ne vont pas dans l’historique');
  ok('les pratiques restent hors de l’historique');
  // 4. Téléphone : la barre tient
  await p.setViewportSize({ width: 360, height: 740 });
  await p.click('#again'); await p.waitForTimeout(3600);
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!over, 'pas de débordement horizontal');
  await p.click('#quit'); assert.ok(await p.locator('#setup').isVisible());
  ok('téléphone 360 px : barre sans débordement');
  const evs = await p.evaluate(() => window.__ev); assert.ok(evs.includes('feuille-arretee'), 'événement feuille-arretee : ' + evs.join(','));
  ok('événement feuille-arretee');
  assert.deepStrictEqual(errs, []);
  ok('aucune erreur (' + (PAGE || 'site public') + ')');
  await b.close(); srv.close();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
