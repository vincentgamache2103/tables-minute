// Note, pourcentage ou les deux (#26), page d'essai : le réglage des familles, le choix du prof imposé
// à ses élèves, une classe sans ce choix (« Les deux »), le détail de l'élève et le CSV du prof.
const { chromium, assert, fs, server, db, setup, solve } = require('./outils');
const ok = (m) => console.log('✓ ' + m);
const NB = ' ';
const PCT = '75' + NB + '%';
(async () => {
  await new Promise((r) => server.listen(8774, r));
  const BASE = 'http://localhost:8774/';
  const browser = await chromium.launch();
  const errors = [];
  // « Copier mon résultat » : le texte copié est gardé dans la page pour le test.
  const newPage = async (opts) => {
    const c = await browser.newContext(Object.assign({ viewport: { width: 1180, height: 820 } }, opts || {}));
    await setup(c, errors);
    await c.addInitScript(() => {
      window.__copied = '';
      try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } }); } catch (e) { /* rien */ }
    });
    return c.newPage();
  };
  // Une feuille où les « wrong » premières réponses sont fausses.
  const doSheet = async (p, wrong) => {
    await p.click('#start'); await p.waitForTimeout(3600);
    const ts = await p.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent));
    for (let i = 0; i < ts.length; i++) { await p.keyboard.type(i < wrong ? '999' : solve(ts[i])); await p.keyboard.press('Enter'); }
    await p.click('#done', { force: true });
    await p.waitForSelector('#results:not([hidden])');
    return ts.length;
  };
  const score = async (p) => ({
    text: (await p.textContent('#score')).trim(),
    aria: await p.getAttribute('#score', 'aria-label'),
    label: (await p.textContent('#score-label')).trim()
  });
  const copied = async (p) => { await p.click('#copy-result'); await p.waitForFunction(() => window.__copied); const t = await p.evaluate(() => window.__copied); await p.evaluate(() => { window.__copied = ''; }); return t; };
  const visible = async (p, sel) => p.$eval(sel, (el) => el.innerText);
  const NOTE_RE = /\b\d+\s*\/\s*\d+\b/;
  try {
    /* ---------- Famille : les trois choix, gardés sur l'appareil ---------- */
    const f = await newPage();
    await f.goto(BASE + 'essai/');
    assert.ok(await f.locator('#res-field').isVisible(), 'le réglage est dans les réglages de la feuille');
    assert.ok(await f.locator('#res-both').isChecked(), 'par défaut : Les deux');
    assert.strictEqual((await f.textContent('#res-hint')).trim(), 'Exemple' + NB + ': 18/24 · ' + PCT);
    await f.click('#count-12', { force: true });
    await doSheet(f, 3);
    let sc = await score(f);
    assert.strictEqual(sc.text, '9/12 · ' + PCT);
    assert.strictEqual(sc.aria, '9 sur 12, ' + PCT);
    assert.strictEqual(sc.label, 'bonnes réponses');
    assert.match(await copied(f), new RegExp('^Tables minute · 9/12 · ' + PCT + ' · '));
    ok('famille, Les deux (par défaut) : ' + sc.text);

    await f.click('#to-setup');
    assert.strictEqual((await f.textContent('#history .h-score')).trim(), '9/12 · ' + PCT);
    await f.click('#res-pct', { force: true });
    assert.strictEqual((await f.textContent('#history .h-score')).trim(), PCT, 'les derniers essais suivent le réglage');
    assert.strictEqual(await f.evaluate(() => JSON.parse(localStorage.getItem('tablesMinute.settings.v1')).res), 'pct');
    await f.reload();
    assert.ok(await f.locator('#res-pct').isChecked(), 'le choix est gardé sur l’appareil');
    await doSheet(f, 3);
    sc = await score(f);
    assert.strictEqual(sc.text, PCT);
    assert.strictEqual(sc.aria, PCT);
    assert.strictEqual(sc.label, 'de bonnes réponses');
    const pctCopy = await copied(f);
    assert.ok(!NOTE_RE.test(pctCopy) && pctCopy.indexOf(PCT) > 0, 'copie sans la note : ' + pctCopy);
    assert.ok(!NOTE_RE.test(await visible(f, '#results')), 'aucune note visible sur l’écran de résultats');
    await f.click('#to-setup');
    assert.ok(!NOTE_RE.test(await visible(f, '#history')), 'aucune note dans les derniers essais');
    ok('famille, Le pourcentage : ' + sc.text + ', aucun « 9/12 » visible ni copié');

    await f.click('#res-note', { force: true });
    await doSheet(f, 3);
    sc = await score(f);
    assert.strictEqual(sc.text, '9/12');
    assert.strictEqual(sc.aria, '9 sur 12');
    assert.strictEqual(sc.label, 'bonnes réponses');
    assert.strictEqual(await f.$eval('#score', (el) => el.querySelector('.of').textContent), '/12', 'même affichage qu’avant');
    const noteCopy = await copied(f);
    assert.match(noteCopy, /^Tables minute · 9\/12 · /); assert.ok(noteCopy.indexOf('%') < 0, noteCopy);
    await f.click('#to-setup');
    const hs = await f.$$eval('#history .h-score', (l) => l.map((x) => x.textContent));
    assert.deepStrictEqual(hs, ['9/12', '9/12', '9/12']);
    ok('famille, La note : exactement comme avant (' + sc.text + ')');

    /* ---------- Classe : le prof choisit « Le pourcentage » ---------- */
    const t = await newPage({ acceptDownloads: true });
    await t.goto(BASE + 'essai/ma-classe.html');
    await t.fill('#new-names', 'Léa\nNoah');
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    const kidsLink = (await t.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + 'essai/');
    await t.waitForFunction(() => !document.querySelector('#card-sheets [data-sh="open"]').disabled);
    assert.match((await t.textContent('#card-sheets')).replace(/\s+/g, ' '), /Résultat montré : la note et le pourcentage/);
    await t.click('#card-sheets [data-sh="open"]');
    await t.waitForSelector('#v-sheets:not([hidden])');
    const resIn = t.locator('#v-sheets input[data-f="res"]');
    assert.strictEqual(await resIn.count(), 3);
    assert.ok(await t.locator('#v-sheets input[data-f="res"][value="both"]').isChecked(), 'éditeur : Les deux par défaut');
    await t.locator('#v-sheets input[data-f="res"][value="pct"]').check({ force: true });
    assert.ok(await t.locator('#v-sheets [data-sh="dirty"]').isVisible(), 'changement pas encore enregistré');
    await t.click('[data-act="save"]');
    await t.waitForFunction(() => /Enregistré/.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    const sDocs = Object.keys(db).filter((k) => /\/s\//.test(k));
    assert.strictEqual(sDocs.length, 1);
    assert.ok(!/"res"|"pct"/.test(db[sDocs[0]].d), 'le choix est chiffré avec la feuille');
    await t.click('#v-sheets [data-act="back"]');
    await t.waitForSelector('#v-class:not([hidden])');
    assert.match((await t.textContent('#card-sheets')).replace(/\s+/g, ' '), /Résultat montré : le pourcentage/);
    ok('prof : « Le pourcentage » enregistré, chiffré dans classes/<id>/s');

    // L'élève, sur un appareil où la famille avait choisi « La note » : c'est le choix du prof qui compte.
    const s = await newPage();
    await s.goto(BASE + 'essai/');
    await s.click('#res-note', { force: true });
    await s.goto(kidsLink);
    await s.locator('#klass-names button', { hasText: 'Léa' }).click();
    await s.waitForSelector('#start:visible');
    assert.ok(await s.locator('#res-field').isHidden(), 'l’élève ne voit pas le réglage');
    assert.strictEqual(await s.locator('input[name="res"]:not([disabled])').count(), 0, 'réglage verrouillé');
    await s.click('#count-12', { force: true });
    await doSheet(s, 3);
    await s.waitForFunction(() => /Envoyé/.test(document.getElementById('r-sent').textContent));
    sc = await score(s);
    assert.strictEqual(sc.text, PCT);
    assert.ok(!NOTE_RE.test(await visible(s, '#results')), 'aucune note visible chez l’élève');
    assert.ok(!NOTE_RE.test(await copied(s)), 'copie sans la note');
    const lastHist = await s.evaluate(() => JSON.parse(localStorage.getItem('tablesMinute.history.v1'))[0]);
    assert.strictEqual(lastHist.res, 'pct', 'l’essai garde le choix du prof');
    ok('élève Léa : ' + sc.text + ', réglage caché, choix du prof imposé');

    // Tableau du prof : le détail suit le choix de la classe; le CSV a toujours la note et le pourcentage.
    await t.click('#refresh');
    await t.waitForSelector('#res-body:not([hidden])');
    await t.click('#kids [data-kid="0"]');
    assert.strictEqual((await t.textContent('#kids .kid-detail .s-score')).trim(), PCT);
    ok('détail de Léa : ' + PCT);
    const [dl] = await Promise.all([t.waitForEvent('download'), t.click('#csv')]);
    const [h, row] = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
    assert.match(h, /;Bonnes réponses;Questions;Pourcentage;/);
    assert.match(row, /^Léa;.*;9;12;75;/);
    ok('CSV : colonne Pourcentage à côté de la note (9;12;75)');

    /* ---------- Classe sans le choix (enregistrée avant #26) : Les deux ---------- */
    // Le classe.js d'avant : la même feuille, sans le champ « res ».
    const now = fs.readFileSync(require('path').join(__dirname, '..', 'essai', 'classe.js'), 'utf8');
    const before = now.replace(", res: RES_MODES.indexOf(r.res) >= 0 ? r.res : 'both'", '');
    assert.notStrictEqual(before, now, 'classe.js d’avant');
    const t2 = await newPage();
    await t2.route(/\/essai\/classe\.js/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: before }));
    await t2.goto(BASE + 'essai/ma-classe.html');
    await t2.fill('#new-names', 'Zoé\nSam');
    await t2.click('#new-go');
    await t2.waitForSelector('#v-class:not([hidden])');
    const kids2 = (await t2.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + 'essai/');
    await t2.waitForFunction(() => !document.querySelector('#card-sheets [data-sh="open"]').disabled);
    await t2.click('#card-sheets [data-sh="open"]');
    await t2.locator('.sh-card--all').getByText('Je choisis la feuille').click();
    await t2.click('[data-act="save"]');
    await t2.waitForFunction(() => /Enregistré/.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    assert.ok(!('res' in await t2.evaluate(() => window.TMClasse.cleanSheets({}))), 'feuille enregistrée sans le champ');
    const z = await newPage();
    await z.goto(BASE + 'essai/');
    await z.click('#res-pct', { force: true });
    await z.goto(kids2);
    await z.locator('#klass-names button', { hasText: 'Zoé' }).click();
    await z.waitForSelector('#preset:not([hidden])');
    assert.ok(await z.locator('#res-field').isHidden());
    const n = await doSheet(z, 6);
    assert.strictEqual(n, 24);
    sc = await score(z);
    assert.strictEqual(sc.text, '18/24 · ' + PCT);
    ok('classe sans le choix : Les deux (' + sc.text + ')');
    assert.strictEqual(await z.evaluate(() => window.TMClasse.cleanSheets({ res: 'xyz' }).res), 'both');

    if (errors.length) throw new Error('Erreurs de page : ' + errors.join(' || '));
    ok('aucune erreur de page');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
