// Boîte à idées : le courriel est réservé aux adultes, et un courriel d'élève n'est jamais envoyé.
const { chromium, assert, server, setup } = require('./outils');
const PRE = process.argv[2] !== undefined ? process.argv[2] : '';
const ok = (m) => console.log('✓ ' + m);
(async () => {
  await new Promise((r) => server.listen(8783, r));
  const BASE = 'http://localhost:8783/';
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await setup(ctx, errors);
    const sent = [];
    await ctx.route(/api\.web3forms/, (r) => { sent.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
    const p = await ctx.newPage();
    await p.goto(BASE + PRE);
    assert.ok(await p.locator('#idea-email').isHidden(), 'champ courriel caché au départ');
    assert.ok(await p.locator('#idea-adult summary').isVisible(), 'lien pour les adultes');
    ok('courriel caché derrière « Je suis un parent ou un prof »');

    // Une page neuve par envoi (la page refuse deux envois à moins de 20 secondes).
    const send = async (msg, mail) => {
      await p.goto(BASE + PRE);
      await p.fill('#idea-msg', msg);
      if (mail !== undefined) { await p.click('#idea-adult summary'); await p.fill('#idea-email', mail); }
      const n = sent.length;
      await p.click('#idea-send');
      await p.waitForFunction(() => /Merci/.test(document.getElementById('idea-status').textContent));
      assert.strictEqual(sent.length, n + 1, 'une idée envoyée');
      return sent[n];
    };
    let s = await send('Une feuille plus longue svp');
    assert.ok(!('email' in s), 'pas de courriel');
    for (const m of ['emy3066@ele.cssda.ca', 'raph1221@elee.cssda.ca', '4501268@college-heritage.ca', 'leo@eleve.csdm.qc.ca']) {
      s = await send('Une idée de calcul mental', m);
      assert.ok(!('email' in s), 'courriel d’élève retiré : ' + m);
      assert.strictEqual(s.Suggestion, 'Une idée de calcul mental', 'l’idée part quand même');
      assert.match(await p.textContent('#idea-status'), /courriel d’école/);
      assert.strictEqual(await p.inputValue('#idea-email'), '', 'case vidée');
    }
    ok('courriels d’élèves (ele., elee., numéro de fiche, eleve.) jamais envoyés, l’idée part quand même');
    s = await send('Une version pour les fractions', 'julie.tremblay@gmail.com');
    assert.strictEqual(s.email, 'julie.tremblay@gmail.com');
    s = await send('Merci pour le site', 'marie.roy@cssmi.qc.ca');
    assert.strictEqual(s.email, 'marie.roy@cssmi.qc.ca', 'courriel de prof gardé');
    ok('courriels d’adultes envoyés normalement (parent, prof)');
    assert.deepStrictEqual(errors.filter((e) => !/Firestore|404/i.test(e)), []);
    ok('aucune erreur de page');
  } catch (e) {
    console.error('✗', e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();

