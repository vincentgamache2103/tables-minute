// Demandes de la prof pilote (13 novembre) : l'élève voit seulement les prénoms, puis seulement sa feuille;
// la prof rouvre sa classe en collant son lien de prof; les carrés vont jusqu'à 10×10.
const { chromium, assert, server, setup, db } = require('./outils');
const ok = (m) => console.log('✓ ' + m);
(async () => {
  await new Promise((r) => server.listen(8772, r));
  const BASE = 'http://localhost:8772/';
  const browser = await chromium.launch();
  const errors = [];
  const ctxPage = async () => { const c = await browser.newContext({ viewport: { width: 1024, height: 768 } }); await setup(c, errors); return c.newPage(); };
  try {
    for (const pre of ['', 'essai/']) {
      const t = await ctxPage();
      await t.goto(BASE + pre + 'ma-classe.html');
      await t.fill('#new-names', 'Léa\nNoah');
      await t.click('#new-go');
      await t.waitForSelector('#v-class:not([hidden])');
      const kids = (await t.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + pre);
      const prof = await t.evaluate(() => window.TMClasse.teacherLink(window.TMClasse.mine().list[0]));
      // Élève : avant le prénom, seulement la liste
      const s = await ctxPage();
      await s.goto(kids);
      await s.waitForSelector('#klass-names button');
      assert.ok(await s.locator('#setup .paper').isHidden(), 'réglages cachés avant le prénom');
      assert.ok(await s.locator('#setup .history').isHidden(), 'derniers essais cachés');
      await s.locator('#klass-names button', { hasText: 'Léa' }).click();
      assert.ok(await s.locator('#setup .paper').isVisible(), 'la feuille paraît après le prénom');
      assert.ok(await s.locator('#start').isVisible());
      ok((pre || 'public') + ' : élève, seulement les prénoms, puis la feuille');
      // Prof sur un appareil vierge : coller le lien de prof
      const t2 = await ctxPage();
      await t2.goto(BASE + pre + 'ma-classe.html');
      await t2.waitForSelector('#v-new:not([hidden])');
      await t2.fill('#reopen-new', 'pas un lien');
      await t2.click('#v-new [data-reopen] button');
      assert.match(await t2.textContent('#v-new [data-reopen] .status'), /pas un lien de prof/);
      await t2.fill('#reopen-new', prof.replace(/^https?:\/\/[^#?]+/, BASE + pre + 'ma-classe.html'));
      await t2.click('#v-new [data-reopen] button');
      await t2.waitForSelector('#v-class:not([hidden])');
      await t2.waitForFunction(() => /2\sélèves/.test(document.getElementById('class-sub').textContent));
      ok((pre || 'public') + ' : prof, classe rouverte en collant le lien de prof');
    }
    // Carrés (essai) : de 2×2 à 10×10, donc 7×7 et 8×8 aussi
    const s3 = await ctxPage();
    await s3.goto(BASE + 'essai/?o=mul&st=sq&q=36&m=4&k=r');
    await s3.click('#start'); await s3.waitForTimeout(3600);
    const cells = await s3.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, '')));
    const n = cells.map((x) => x.match(/\d+/g).map(Number));
    assert.ok(n.every(([a, b]) => a === b), 'que des carrés : ' + cells.join(' '));
    const seen = new Set(n.map(([a]) => a));
    assert.ok(seen.has(7) && seen.has(8) && seen.has(10), 'jusqu’à 10×10 : ' + [...seen].sort((x, y) => x - y).join(','));
    ok('carrés de 2×2 à 10×10 : ' + [...seen].sort((x, y) => x - y).join(', '));
    if (errors.length) throw new Error(errors.join(' || '));
    ok('aucune erreur');
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
