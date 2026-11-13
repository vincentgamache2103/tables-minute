// La feuille du prof (page d'essai) : un prof, ses feuilles, trois élèves, le site public inchangé.
const { chromium, assert, fs, path, ROOT, server, db, now, rulesDenyS, busy, seenLimits, setup, solve } = require('./outils');
(async () => {
  await new Promise((r) => server.listen(8765, r));
  const BASE = 'http://localhost:8765/';
  const browser = await chromium.launch();
  const errors = [];
  const ok = (name) => console.log('✓ ' + name);
  try {
    /* ---- Le prof crée sa classe ---- */
    const tctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    await setup(tctx, errors);
    const t = await tctx.newPage();
    await t.goto(BASE + 'essai/ma-classe.html');
    await t.fill('#new-name', '2e année');
    await t.fill('#new-names', 'Léa\nNoah\nZoé\nSam\nMia\nLiam');
    await t.click('#new-go');
    await t.waitForSelector('#v-class:not([hidden])');
    const kidsLink = (await t.textContent('#kids-link')).trim();
    assert.ok(/\/essai\/\?ref=classe#c=/.test(kidsLink), 'lien des élèves dans essai/ : ' + kidsLink);
    // Le site public est resté comme avant
    const pub = await tctx.newPage();
    await pub.goto(BASE + 'ma-classe.html');
    await pub.waitForSelector('#v-class:not([hidden])');
    assert.strictEqual(await pub.locator('#card-sheets').count(), 0, 'pas de carte sur le site public');
    await pub.goto(BASE);
    assert.strictEqual(await pub.getByText('Par stratégie').count(), 0, 'pas de stratégies sur le site public');
    await pub.close();
    console.log('✓ site public inchangé, même classe visible des deux côtés');
    await t.waitForFunction(() => !document.querySelector('#card-sheets [data-sh="open"]').disabled);
    const cardTxt = (await t.textContent('#card-sheets')).replace(/\s+/g, ' ');
    assert.match(cardTxt, /choisissent/);
    ok('carte repliée : les élèves choisissent');

    /* ---- Feuille de toute la classe : × tables 2 à 5, 2 min ---- */
    await t.click('#card-sheets [data-sh="open"]');
    await t.waitForSelector('#v-sheets:not([hidden])');
    assert.strictEqual(await t.locator('#v-sheets [data-kid]').count(), 6);
    await t.locator('.sh-card--all').getByText('Je choisis la feuille').click();
    const allForm = t.locator('.sh-card--all .sh-form');
    if (await allForm.count() === 0) await t.locator('.sh-card--all [data-act="edit"]').click();
    const form = t.locator('.sh-card--all .sh-form');
    for (const n of [2, 3, 4, 5]) await form.locator('input[data-f="t"][value="' + n + '"]').check({ force: true });
    for (const n of [1, 6, 7, 8, 9, 10, 11, 12]) { const b = form.locator('input[data-f="t"][value="' + n + '"]'); if (await b.isChecked()) await b.uncheck({ force: true }); }
    await form.locator('input[data-f="m"][value="2"]').check({ force: true });
    const done = t.locator('.sh-card--all [data-act="done"]');
    if (await done.count()) await done.click();
    ok('feuille de toute la classe réglée');

    /* ---- Une feuille pour Léa et Noah : × doubles, 3 min ---- */
    await t.locator('#v-sheets [data-kid]:text-is("Léa")').click();
    await t.locator('#v-sheets [data-kid]:text-is("Noah")').click();
    await t.click('[data-act="place"]');
    await t.locator('[role="menuitem"]').filter({ hasText: /Nouvelle feuille/ }).click();
    const rule = t.locator('#v-sheets .sh-card.is-open').filter({ hasNot: t.locator('.sh-card--all') }).last();
    await t.waitForSelector('#v-sheets .sh-card.is-open .sh-form');
    const rf = t.locator('#v-sheets .sh-card.is-open .sh-form');
    await rf.locator('input[data-f="mode"][value="st"]').check({ force: true });
    // ne garder que les doubles
    const stBoxes = rf.locator('input[data-f="st"]');
    for (let i = 0; i < await stBoxes.count(); i++) {
      const b = stBoxes.nth(i);
      const v = await b.getAttribute('value');
      if ((v === 's2') !== (await b.isChecked())) await b.click({ force: true });
    }
    await rf.locator('input[data-f="m"][value="3"]').check({ force: true });
    await rf.locator('input[data-f="n"]').fill('En difficulté');
    await t.locator('#v-sheets .sh-card.is-open [data-act="done"]').click();
    ok('feuille pour Léa et Noah réglée (doubles, 3 min)');

    /* ---- Enregistrer ---- */
    await t.click('[data-act="save"]');
    await t.waitForFunction(() => /Enregistré/.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    const sDocs = Object.keys(db).filter((k) => /\/s\//.test(k));
    assert.strictEqual(sDocs.length, 1, 'un document de feuilles');
    ok('enregistré : un document chiffré dans classes/<id>/s');
    assert.ok(!/difficult|doubles|Léa/.test(JSON.stringify(db[sDocs[0]])), 'rien de lisible sur le serveur');
    ok('rien de lisible sur le serveur');
    await t.click('#v-sheets [data-act="back"]');
    await t.waitForSelector('#v-class:not([hidden])');
    const sum = (await t.textContent('#card-sheets')).replace(/\s+/g, ' ');
    assert.match(sum, /2 élèves/);
    ok('carte repliée mise à jour : ' + sum.trim().slice(0, 120));

    /* ---- Élève Léa : feuille verrouillée sur les doubles ---- */
    const sctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setup(sctx, errors);
    const s = await sctx.newPage();
    await s.goto(kidsLink.replace('https://vincentgamache2103.github.io/tables-minute/', BASE));
    await s.waitForSelector('#klass-names button');
    await s.locator('#klass-names button', { hasText: 'Léa' }).click();
    await s.waitForSelector('#preset:not([hidden])');
    const presetTxt = (await s.textContent('#preset')).replace(/\s+/g, ' ');
    assert.match(presetTxt, /doubles/i);
    assert.match(presetTxt, /3 minutes/);
    assert.ok(!/difficult/i.test(await s.content()), 'le nom de la feuille n’apparaît jamais chez l’élève');
    assert.ok(await s.locator('#preset-leave').isHidden(), 'pas de « Choisir autre chose »');
    assert.ok(await s.locator('#setup .fields input:not([disabled])').count() === 0, 'réglages verrouillés');
    ok('Léa : ' + presetTxt.trim());

    // Elle fait sa feuille : les questions sont toutes des doubles
    await s.click('#start');
    await s.waitForFunction(() => window.getComputedStyle(document.getElementById('test') || document.body).display !== 'none' && document.querySelectorAll('#test .cell, .cell').length > 0, null, { timeout: 8000 });
    await s.waitForTimeout(4500);
    const eqs = await s.locator('#test .cell').allTextContents();
    assert.ok(eqs.length >= 12, 'des questions : ' + eqs.length);
    const notDouble = eqs.map((x) => x.replace(/\s+/g, '')).filter((x) => !/(^|[^0-9])2[×÷]|[×÷]2(=|$)|^\d+[÷]2/.test(x) && !/×2|2×/.test(x) && !/÷2=/.test(x));
    assert.strictEqual(notDouble.length, 0, 'seulement des doubles : ' + notDouble.slice(0, 5).join(' | '));
    ok(eqs.length + ' questions, toutes des doubles');

    /* ---- « Ce n'est pas moi » puis Zoé : la feuille de toute la classe ---- */
    // (la feuille de Léa est encore en cours sur cette tablette : on prend une autre tablette pour Zoé)
    const z2 = await (async () => { const c = await browser.newContext(); await setup(c, errors); return c.newPage(); })();
    await z2.goto(kidsLink.replace(/^https?:\/\/[^#]+/, BASE + 'essai/?ref=classe'));
    await z2.waitForSelector('#klass-names button:visible');
    await z2.locator('#klass-names button', { hasText: 'Zoé' }).click();
    await z2.waitForFunction(() => /2 à 5/.test(document.getElementById('preset').textContent));
    const z = (await z2.textContent('#preset')).replace(/\s+/g, ' ');
    assert.match(z, /2 minutes/);
    ok('Zoé : ' + z.trim());

    /* ---- Le prof change la semaine suivante : Noah retourne avec la classe ---- */
    await t.click('#card-sheets [data-sh="open"]');
    await t.waitForSelector('#v-sheets:not([hidden])');
    await t.locator('#v-sheets [data-kid]:text-is("Noah")').click();
    await t.click('[data-act="place"]');
    await t.locator('[role="menuitem"]').filter({ hasText: /classe/ }).first().click();
    await t.click('[data-act="save"]');
    await t.waitForFunction(() => /Enregistré/.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    assert.strictEqual(Object.keys(db).filter((k) => /\/s\//.test(k)).length, 2);
    ok('deuxième version enregistrée');

    const n = await sctx.newPage();
    await n.goto(kidsLink.replace(/^https?:\/\/[^#]+/, BASE + 'essai/?ref=classe'));
    await n.waitForSelector('#klass-names button:visible, #klass-change:visible');
    if (await n.locator('#klass-change').isVisible()) await n.click('#klass-change');
    await n.locator('#klass-names button', { hasText: 'Noah' }).click();
    await n.waitForFunction(() => /2 à 5/.test(document.getElementById('preset').textContent));
    ok('Noah suit maintenant la feuille de la classe');

    /* ---- Une copie rejouée d'une vieille version ne gagne pas ; un faux document est ignoré ---- */
    const docs = Object.keys(db).filter((k) => /\/s\//.test(k)).sort((a, b) => (db[a].t < db[b].t ? -1 : 1));
    const root = docs[0].split('/')[2];
    db['/classes/' + root + '/s/AAAAAAAAAAAAAAAAAAAA'] = { d: db[docs[0]].d, t: now() }; // vieille version rejouée
    db['/classes/' + root + '/s/BBBBBBBBBBBBBBBBBBBB'] = { d: 'x'.repeat(200), t: now() }; // faux
    const n2 = await sctx.newPage();
    await n2.goto(kidsLink.replace(/^https?:\/\/[^#]+/, BASE + 'essai/?ref=classe'));
    await n2.waitForSelector('#klass-names button:visible, #klass-change:visible');
    if (await n2.locator('#klass-change').isVisible()) await n2.click('#klass-change');
    await n2.locator('#klass-names button', { hasText: 'Noah' }).click();
    await n2.waitForFunction(() => /2 à 5/.test(document.getElementById('preset').textContent));
    ok('vieille version rejouée et faux document ignorés');

    /* ---- Règles pas encore publiées : l'élève choisit comme avant, sans erreur ---- */
    rulesDenyS.on = true;
    const fresh = await browser.newContext();
    await setup(fresh, errors);
    const f = await fresh.newPage();
    await f.goto(kidsLink.replace(/^https?:\/\/[^#]+/, BASE + 'essai/?ref=classe'));
    await f.locator('#klass-names button', { hasText: 'Mia' }).click();
    await f.waitForTimeout(800);
    assert.ok(await f.locator('#preset').isHidden(), 'sans règles publiées : pas de préréglage');
    assert.ok(await f.locator('#setup .fields input:not([disabled])').count() > 0, 'les réglages restent ouverts');
    ok('règles pas publiées : rien ne casse côté élève');
    // et côté prof : l'erreur s'affiche, le brouillon reste
    await t.click('#v-sheets [data-act="back"]').catch(() => {});
    await t.click('#card-sheets [data-sh="open"]');
    await t.locator('#v-sheets [data-kid]:text-is("Sam")').click();
    await t.click('[data-act="place"]');
    await t.locator('[role="menuitem"]').filter({ hasText: /Nouvelle feuille/ }).click();
    await t.click('[data-act="save"]');
    await t.waitForFunction(() => document.querySelector('#v-sheets [data-sh="save-status"]').classList.contains('is-err') || /serveur|connexion|répondu/i.test(document.querySelector('#v-sheets [data-sh="save-status"]').textContent));
    ok('prof : erreur affichée si les règles ne sont pas publiées : ' + (await t.textContent('#v-sheets [data-sh="save-status"]')).trim());
    const draft = await t.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('tablesMinute.sheetDraft')).length);
    assert.strictEqual(draft, 1, 'brouillon gardé');
    ok('brouillon gardé sur l’appareil');

    if (errors.length) throw new Error('Erreurs de page : ' + errors.join(' || '));
    ok('aucune erreur de page');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
