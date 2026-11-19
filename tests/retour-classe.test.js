// Demande d'une enseignante pilote (page d'essai) :
// A. un appareil qui connaît une classe, ouvert sans son lien : un bloc bien visible ramène à la classe;
// B. appareils partagés (choix du prof) : le prénom est redemandé après chaque feuille.
const { chromium, assert, server, db, busy, setup, solve } = require('./outils');
const ok = (m) => console.log('✓ ' + m);
(async () => {
  await new Promise((r) => server.listen(8775, r));
  const BASE = 'http://localhost:8775/';
  const browser = await chromium.launch();
  const errors = [];
  // Les événements GoatCounter sont gardés dans localStorage (ils survivent au changement de page).
  const newPage = async () => {
    const c = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setup(c, errors);
    await c.addInitScript(() => {
      Object.defineProperty(window, 'goatcounter', { configurable: true, get() { return { count: (x) => { const l = JSON.parse(localStorage.getItem('__ev') || '[]'); l.push(x.path); localStorage.setItem('__ev', JSON.stringify(l)); } }; }, set() {} });
    });
    return c.newPage();
  };
  const events = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__ev') || '[]'));
  const doSheet = async (p) => {
    await p.click('#start'); await p.waitForTimeout(3600);
    const ts = await p.$$eval('#sheet .cell', (cs) => cs.map((c) => c.textContent));
    for (const x of ts) { await p.keyboard.type(solve(x)); await p.keyboard.press('Enter'); }
    await p.click('#done', { force: true });
    await p.waitForSelector('#results:not([hidden])');
  };
  const myIndex = (p) => p.evaluate(() => window.TMClasse.myIndex(window.TMClasse.readHash(window.location.hash).id));
  const makeClass = async (name, names) => {
    const t = await newPage();
    await t.goto(BASE + 'essai/ma-classe.html');
    await t.fill('#new-name', name);
    await t.fill('#new-names', names);
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    await t.waitForFunction(() => !document.querySelector('#card-sheets [data-sh="open"]').disabled);
    return { t, kids: (await t.textContent('#kids-link')).trim().replace(/^https?:\/\/[^#?]+/, BASE + 'essai/') };
  };
  try {
    /* ---------- A. Retour à la classe ---------- */
    const A = await makeClass('2e année', 'Léa\nNoah');
    const s = await newPage();
    await s.goto(BASE + 'essai/');
    assert.ok(await s.locator('#klass-back').isHidden(), 'appareil sans classe : pas de bloc');
    await s.goto(A.kids);
    await s.locator('#klass-names button', { hasText: 'Léa' }).click();
    await s.goto(BASE + 'essai/');
    await s.waitForSelector('#klass-back:not([hidden])');
    assert.ok(await s.locator('#klass-back-full').isVisible(), 'bloc bien visible');
    assert.strictEqual((await s.textContent('#klass-back-title')).trim(), '2e année');
    assert.match(await s.textContent('#klass-back'), /Pour que ton prof voie tes résultats, fais tes feuilles dans ta classe\./);
    assert.ok(await s.locator('#klass-back-go').isVisible());
    const box = await s.locator('#klass-back').boundingBox();
    const paper = await s.locator('#setup .paper').first().boundingBox();
    assert.ok(box.y < paper.y, 'en haut de l’accueil, avant la feuille');
    ok('accueil sans le lien : bloc « Retourner à ta classe » (2e année)');

    await s.click('#klass-back-skip');
    assert.ok(await s.locator('#klass-back-full').isHidden());
    assert.ok(await s.locator('#klass-back-line').isVisible(), 'replié en une ligne');
    await s.reload();
    assert.ok(await s.locator('#klass-back-line').isVisible() && await s.locator('#klass-back-full').isHidden(), 'replié pour la session');
    ok('« Pratiquer sans ma classe » : bloc replié pour la session');

    await s.click('#count-12', { force: true });
    await doSheet(s);
    assert.ok(await s.locator('#r-klass').isVisible(), 'rappel sur l’écran de résultats');
    assert.match(await s.textContent('#r-klass'), /Ce résultat n’est pas allé à ton prof\./);
    ok('feuille hors classe : « Ce résultat n’est pas allé à ton prof »');
    await s.click('#r-klass-go');
    await s.waitForURL(/\?ref=classe#c=/);
    await s.waitForSelector('#klass-me:not([hidden])');
    assert.strictEqual((await s.textContent('#klass-me-name')).trim(), 'Léa');
    assert.ok((await events(s)).includes('classe-retour-bouton'), 'événement classe-retour-bouton');
    ok('bouton → la classe s’ouvre normalement (Léa), événement classe-retour-bouton');

    // Dans la classe : pas de rappel; sans « appareils partagés », Léa reste choisie (comme avant).
    await doSheet(s);
    await s.waitForFunction(() => /Envoyé/.test(document.getElementById('r-sent').textContent));
    assert.ok(await s.locator('#r-klass').isHidden(), 'pas de rappel dans la classe');
    assert.strictEqual(await myIndex(s), 0, 'Léa reste choisie');
    await s.click('#again');
    await s.waitForSelector('#test:not([hidden])');
    await s.click('#quit');
    ok('option désactivée : comportement d’avant (Léa reste choisie, « Nouvelle feuille » repart)');

    /* ---------- B. Appareils partagés ---------- */
    const B = await makeClass('3e année', 'Zoé\nSam');
    const t = B.t;
    await t.click('#card-sheets [data-sh="open"]');
    await t.waitForSelector('#v-sheets:not([hidden])');
    const box2 = t.locator('#v-sheets input[data-f="shared"]');
    assert.ok(!(await box2.isChecked()), 'désactivé par défaut');
    await box2.check();
    await t.click('[data-act="save"]');
    await t.waitForFunction(() => /Enregistré/.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    await t.click('#v-sheets [data-act="back"]');
    assert.match((await t.textContent('#card-sheets')).replace(/\s+/g, ' '), /Appareils partagés : prénom redemandé après chaque feuille/);
    ok('prof : « Redemander le prénom après chaque feuille » enregistré');

    const d = await newPage();
    await d.goto(B.kids);
    await d.locator('#klass-names button', { hasText: 'Zoé' }).click();
    await d.click('#count-12', { force: true });
    busy.on = true; // le serveur refuse : le résultat de Zoé attend sur l'appareil
    await doSheet(d);
    await d.waitForFunction(() => /gardé/.test(document.getElementById('r-sent').textContent));
    busy.on = false;
    assert.strictEqual(await myIndex(d), -1, 'Zoé est oubliée sur cet appareil');
    assert.strictEqual((await d.textContent('#r-name')).trim(), 'Zoé', 'ses résultats gardent son prénom');
    assert.strictEqual(await d.evaluate(() => (JSON.parse(localStorage.getItem('tablesMinute.history.v1') || '[]')).length), 0, 'pas de derniers essais gardés');
    await d.click('#again');
    await d.waitForSelector('#setup:not([hidden])');
    assert.ok(await d.locator('#klass-names').isVisible(), 'retour à la liste des prénoms');
    assert.ok(await d.locator('#setup .paper').isHidden(), 'la feuille attend le prénom');
    assert.ok(await d.locator('#setup .history').isHidden(), 'derniers essais cachés');
    assert.strictEqual((await d.inputValue('#name')), '', 'le prénom de Zoé n’est plus là');
    ok('après la feuille : Zoé oubliée, « Nouvelle feuille » → liste des prénoms');

    await d.locator('#klass-names button', { hasText: 'Sam' }).click();
    await doSheet(d);
    await d.waitForFunction(() => /Envoyé/.test(document.getElementById('r-sent').textContent));
    assert.strictEqual(await d.evaluate(() => window.TMClasse.pending()), 0, 'la file est vide');
    await t.click('#refresh');
    await t.waitForSelector('#res-body:not([hidden])');
    await t.waitForSelector('#kids [data-kid="0"]');
    await t.waitForSelector('#kids [data-kid="1"]');
    const rows = (await t.textContent('#kids')).replace(/\s+/g, ' ');
    assert.match(rows, /Zoé.*Feuilles ?1/); assert.match(rows, /Sam.*Feuilles ?1/);
    ok('le résultat en attente de Zoé est arrivé chez Zoé, celui de Sam chez Sam');

    if (errors.length) throw new Error('Erreurs de page : ' + errors.join(' || '));
    ok('aucune erreur de page');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
