// Limite du serveur atteinte (#14) : message clair, le résultat part plus tard.
const { chromium, assert, fs, path, ROOT, server, db, now, rulesDenyS, busy, seenLimits, setup, solve } = require('./outils');
const PRE = process.argv[2] || '';
(async () => {
  await new Promise((r) => server.listen(8765, r));
  const BASE = 'http://localhost:8765/';
  const browser = await chromium.launch();
  const errors = [];
  try {
    const t = await (async () => { const c = await browser.newContext(); await setup(c, errors); return c.newPage(); })();
    await t.goto(BASE + PRE + 'ma-classe.html');
    await t.fill('#new-names', 'Léa\nNoah');
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    const link = (await t.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + PRE);
    const s = await (async () => { const c = await browser.newContext(); await setup(c, errors); return c.newPage(); })();
    await s.goto(link);
    await s.locator('#klass-names button', { hasText: 'Léa' }).click();
    await s.click('#count-12', { force: true });
    busy.on = true;
    await s.click('#start'); await s.waitForTimeout(3600);
    await s.keyboard.type('5'); await s.keyboard.press('Enter');
    await s.click('#done', { force: true }); await s.waitForTimeout(200); await s.click('#done', { force: true });
    await s.waitForFunction(() => /gardé/.test(document.getElementById('r-sent').textContent), null, { timeout: 15000 });
    const msg = (await s.textContent('#r-sent')).trim();
    assert.ok(!/connexion/.test(msg), 'pas « Pas de connexion » : ' + msg);
    console.log('✓ limite atteinte : « ' + msg + ' »');
    busy.on = false;
    const r0 = Object.keys(db).filter((k) => /\/r\//.test(k)).length;
    assert.strictEqual(r0, 0);
    const s2 = await s.context().newPage();
    await s2.goto(BASE + PRE + '?x=1'); await s2.waitForTimeout(2500);
    assert.strictEqual(Object.keys(db).filter((k) => /\/r\//.test(k)).length, 1, 'le résultat gardé part à la prochaine ouverture');
    console.log('✓ le résultat gardé part à la prochaine ouverture');
    if (PRE) { assert.ok(seenLimits.length && seenLimits.every((n) => n === 5), 'limit ' + seenLimits); console.log('✓ feuilles du prof : lecture limitée à 5 (' + seenLimits.length + ' requêtes)'); }
    if (errors.length) throw new Error(errors.join(' || '));
    console.log('✓ aucune erreur (' + (PRE || 'public') + ')');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
