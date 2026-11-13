// Tableau du prof : résultats par opération (#2), sur le site public puis la page d'essai.
const { chromium, assert, fs, path, ROOT, server, db, now, rulesDenyS, busy, seenLimits, setup, solve } = require('./outils');
const PRE = process.argv[2] || '';
(async () => {
  await new Promise((r) => server.listen(8765, r));
  const BASE = 'http://localhost:8765/';
  const browser = await chromium.launch();
  const errors = [];
  const ok = (m) => console.log('✓ ' + m);
  try {
    const tctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, acceptDownloads: true });
    await setup(tctx, errors);
    const t = await tctx.newPage();
    await t.goto(BASE + PRE + 'ma-classe.html');
    await t.fill('#new-names', 'Léa\nNoah');
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    const kidsLink = (await t.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + PRE);
    // Léa : × et ÷, toutes les × bonnes, toutes les ÷ fausses
    const s = await (await browser.newContext()).newPage();
    await setup(s.context(), errors);
    await s.goto(kidsLink);
    await s.locator('#klass-names button', { hasText: 'Léa' }).click();
    await s.check('#op-div', { force: true });
    await s.click('#count-12', { force: true });
    await s.click('#start'); await s.waitForTimeout(3600);
    const ts = await s.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent));
    for (const x of ts) { await s.keyboard.type(/÷/.test(x) ? '99' : solve(x)); await s.keyboard.press('Enter'); }
    await s.click('#done', { force: true });
    await s.waitForFunction(() => /Envoyé/.test(document.getElementById('r-sent').textContent));
    ok('Léa a envoyé une feuille × ÷');
    await t.click('#refresh');
    await t.waitForSelector('#ops-filter:not([hidden])');
    const chips = await t.$$eval('#ops-filter .chip', (b) => b.map((x) => x.textContent));
    assert.deepStrictEqual(chips.map((x) => x.replace(/\s+/g, ' ')), ['Toutes les opérations', '× Multiplication', '÷ Division'], JSON.stringify(chips));
    const tile = (await t.textContent('#tiles')).replace(/\s+/g, ' ');
    assert.match(tile, /50 %\s*de bonnes réponses/); assert.match(tile, /× 100 % · ÷ 0 %/);
    ok('filtre affiché; tuile : ' + tile.trim());
    await t.click('#ops-filter [data-op="d"]');
    const tileD = (await t.textContent('#tiles')).replace(/\s+/g, ' ');
    assert.match(tileD, /\b0 %\s*de bonnes réponses en division/);
    const facts = await t.$$eval('#class-facts li', (l) => l.map((x) => x.textContent));
    assert.ok(facts.length && facts.every((x) => /÷/.test(x)), 'calculs manqués en ÷ seulement : ' + facts.join(' | '));
    const bars = await t.$$eval('#tables-bars li', (l) => l.map((x) => x.textContent));
    assert.ok(bars.every((x) => /÷|Pas encore/.test(x)));
    ok('vue ÷ : 0 %, calculs manqués en ÷ seulement');
    await t.click('#ops-filter [data-op="m"]');
    assert.match((await t.textContent('#tiles')).replace(/\s+/g, ' '), /100 %\s*de bonnes réponses en multiplication/);
    assert.match(await t.textContent('#class-facts'), /Aucune erreur/);
    ok('vue × : 100 %');
    await t.click('#ops-filter [data-op=""]');
    await t.click('#kids [data-kid="0"]');
    assert.match((await t.textContent('#kids .kid-detail')).replace(/\s+/g, ' '), /Réussite par opération : × 100 % · ÷ 0 %/);
    ok('détail de Léa : réussite par opération');
    const [dl] = await Promise.all([t.waitForEvent('download'), t.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    const [h, row] = csv.replace(/^﻿/, '').split('\r\n');
    assert.match(h, /Réussite × \(%\);Réussite ÷ \(%\);Réussite \+ \(%\);Réussite − \(%\)$/);
    assert.match(row, /;100;0;;$/);
    ok('CSV : colonnes par opération');
    if (errors.length) throw new Error(errors.join(' || '));
    ok('aucune erreur (' + (PRE || 'public') + ')');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
