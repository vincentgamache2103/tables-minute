// Feuille à imprimer (#27) : les réglages choisis, une page pour l'élève, une page de corrigé.
const { chromium, assert, server, setup, solve } = require('./outils');
const PRE = process.argv[2] !== undefined ? process.argv[2] : '';
const ok = (m) => console.log('✓ ' + m);
(async () => {
  await new Promise((r) => server.listen(8781, r));
  const BASE = 'http://localhost:8781/';
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setup(ctx, errors);
    await ctx.addInitScript(() => {
      window.__printed = 0;
      window.print = () => { window.__printed += 1; };
      Object.defineProperty(window, 'goatcounter', { configurable: true, get() { return { count: (x) => { (window.__ev = window.__ev || []).push(x.path); } }; }, set() {} });
    });
    const p = await ctx.newPage();
    // Multiplications, table de 7, 24 questions
    await p.goto(BASE + PRE + '?o=mul&t=7&q=24&m=3&k=r');
    assert.ok(await p.locator('#print-go').isVisible(), 'bouton visible');
    assert.ok(await p.locator('#print').isHidden(), 'rien à l’écran');
    await p.click('#print-go');
    assert.strictEqual(await p.evaluate(() => window.__printed), 1, 'impression demandée');
    assert.ok((await p.evaluate(() => window.__ev || [])).includes('feuille-imprimee'), 'événement feuille-imprimee');
    const pages = p.locator('#print .p-page');
    assert.strictEqual(await pages.count(), 2, 'feuille + corrigé');
    const sheet = pages.nth(0), key = pages.nth(1);
    assert.strictEqual(await sheet.locator('li').count(), 24, '24 questions');
    assert.strictEqual(await sheet.locator('.p-blank').count(), 24, 'une case vide par question');
    assert.strictEqual(await sheet.locator('.p-ans').count(), 0, 'aucune réponse sur la feuille');
    assert.match(await sheet.textContent(), /Nom/);
    assert.match(await sheet.textContent(), /\/\s24/);
    ok('feuille : 24 questions, cases vides, nom, date, temps, résultat sur 24');

    const qs = await sheet.locator('li').allTextContents();
    const ans = await key.locator('li').allTextContents();
    assert.match(await key.textContent(), /Corrigé/);
    qs.forEach((q, i) => {
      assert.ok(/^\s*\d+ × 7 = \s*$|^\s*7 × \d+ = \s*$/.test(q.replace(/ /g, ' ')), 'table de 7 : ' + q);
      const right = solve(q);
      assert.strictEqual(ans[i].replace(/ /g, ' ').trim().split('= ')[1], String(right), 'corrigé ' + i + ' : ' + ans[i]);
    });
    ok('corrigé : mêmes questions dans le même ordre, bonnes réponses');

    // Mise en page imprimée : seule la feuille est visible
    await p.emulateMedia({ media: 'print' });
    assert.ok(await p.locator('#print').isVisible(), 'feuille visible à l’impression');
    assert.ok(await p.locator('#setup').isHidden(), 'reste de la page caché à l’impression');
    await p.emulateMedia({ media: 'screen' });
    ok('impression : seule la feuille s’imprime');

    // Une nouvelle impression tire d'autres questions
    await p.click('#print-go');
    assert.strictEqual(await p.locator('#print .p-page').count(), 2, 'toujours deux pages');

    // Avec le lien de la classe : pas de bouton
    await p.goto(BASE + PRE + '?ref=classe#c=AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB');
    await p.reload();
    await p.waitForTimeout(400);
    assert.ok(await p.locator('#print-go').isHidden(), 'pas d’impression en mode classe');
    ok('lien de la classe : pas de bouton Imprimer');

    /* ---- Le prof imprime la feuille de sa classe (#27) ---- */
    const t = await ctx.newPage();
    await t.goto(BASE + PRE + 'ma-classe.html');
    await t.fill('#new-names', 'Léa\nNoah\nZoé');
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    await t.waitForFunction(() => !document.querySelector('#card-sheets [data-sh="open"]').disabled);
    await t.click('#card-sheets [data-sh="open"]');
    await t.waitForSelector('#v-sheets:not([hidden])');
    assert.strictEqual(await t.locator('[data-act="print"]').count(), 0, 'pas de bouton tant que les élèves choisissent');
    await t.locator('.sh-card--all').getByText('Je choisis la feuille').click();
    if (await t.locator('.sh-card--all .sh-form').count() === 0) await t.locator('.sh-card--all [data-act="edit"]').click();
    const form = t.locator('.sh-card--all .sh-form');
    for (const n of [6, 8]) await form.locator('input[data-f="t"][value="' + n + '"]').check({ force: true });
    for (const n of [1, 2, 3, 4, 5, 7, 9, 10, 11, 12]) { const b = form.locator('input[data-f="t"][value="' + n + '"]'); if (await b.isChecked()) await b.uncheck({ force: true }); }
    await form.locator('input[data-f="q"][value="12"]').check({ force: true });
    await t.locator('.sh-card--all [data-act="done"]').click();
    const [pop] = await Promise.all([ctx.waitForEvent('page'), t.click('.sh-card--all [data-act="print"]')]);
    await pop.waitForLoadState();
    assert.match(pop.url(), /[?&]imprimer=1/, 'adresse : ' + pop.url());
    await pop.waitForFunction(() => window.__printed === 1);
    assert.ok((await pop.evaluate(() => window.__ev || [])).includes('feuille-imprimee-prof'), 'événement feuille-imprimee-prof');
    const pq = await pop.locator('#print .p-page').nth(0).locator('li').allTextContents();
    assert.strictEqual(pq.length, 12, '12 questions');
    pq.forEach((q) => assert.ok(/(^|\D)[68](\D|$)/.test(q.replace(/\u00a0/g, ' ')), 'tables de 6 et 8 : ' + q));
    assert.ok(await pop.locator('#print-go').isVisible(), 'le bouton reste là pour réimprimer');
    await pop.close();
    ok('prof : « Imprimer » ouvre la feuille de la classe (tables de 6 et 8, 12 questions) et lance l’impression');

    assert.deepStrictEqual(errors.filter((e) => !/Firestore|404|classe/i.test(e)), []);
    ok('aucune erreur de page');
  } catch (e) {
    console.error('✗', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
