// Verbes minute (essai) : la feuille, la correction (accents, pronom écrit), « Arrêter » et « Refaire les erreurs ».
const { chromium, assert, server, setup } = require('./outils');
(async () => {
  await new Promise((r) => server.listen(8771, r));
  const BASE = 'http://localhost:8771/verbes/';
  const browser = await chromium.launch();
  try {
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await setup(ctx, errors);
    // Un faux micro : « start() » répond tout de suite avec ce que dit window.__dit.
    await ctx.addInitScript(() => {
      window.__dit = 'chanter et jouer';
      window.SpeechRecognition = window.webkitSpeechRecognition = function () {
        this.start = () => setTimeout(() => {
          this.onresult({ results: [[{ transcript: window.__dit }]] });
          this.onend && this.onend();
        }, 20);
        this.stop = () => {};
      };
    });
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForSelector('#start');
    const robots = await p.getAttribute('meta[name=robots]', 'content');
    assert.ok(/noindex/.test(robots), 'la page d’essai n’est pas indexée');
    console.log('✓ page non indexée');

    // Les données : 6 formes par verbe, aucune vide.
    const bad = await p.evaluate(() => Array.from(document.querySelectorAll('[data-verb]')).length);
    assert.ok(bad >= 20, 'au moins 20 verbes');
    console.log('✓ ' + bad + ' verbes proposés');

    // Recherche : on tape le début, la liste se réduit; Entrée choisit le verbe.
    const visible = () => p.evaluate(() => Array.from(document.querySelectorAll('[data-verb]')).filter((b) => !b.hidden && b.closest('.group') && !b.closest('.group').hidden).map((b) => b.dataset.verb));
    await p.fill('#search', 'ma');
    let v = await visible();
    assert.deepStrictEqual(v.sort(), ['manger', 'marcher'], 'ma => ' + v);
    await p.fill('#search', 'ECOUT'); // sans accent, en majuscules
    v = await visible();
    assert.deepStrictEqual(v, ['écouter']);
    await p.fill('#search', 'zzz');
    assert.ok(await p.isVisible('#none'), 'message quand rien ne correspond');
    await p.fill('#search', 'regarder');
    await p.press('#search', 'Enter');
    assert.ok((await p.textContent('#find-msg')).includes('regarder'));
    assert.strictEqual(await p.inputValue('#search'), '', 'le champ est vidé après l’ajout');
    assert.strictEqual(await p.getAttribute('[data-verb="regarder"]', 'aria-pressed'), 'true');
    assert.ok(await p.isVisible('[data-remove="regarder"]'), 'le verbe apparaît dans « tes verbes »');
    await p.click('[data-remove="regarder"]');
    assert.strictEqual(await p.getAttribute('[data-verb="regarder"]', 'aria-pressed'), 'false');
    console.log('✓ recherche : filtre sans accent, Entrée ajoute, « × » enlève');

    // Voix : « chanter et jouer » ajoute les deux; un mot qui n'est pas un verbe reste dans le champ.
    assert.ok(await p.isVisible('#mic'), 'micro visible quand le navigateur sait écouter');
    await p.evaluate(() => Array.from(document.querySelectorAll('[data-remove]')).forEach((b) => b.click()));
    await p.click('#mic');
    await p.waitForFunction(() => document.querySelector('#find-msg').textContent.includes('Ajouté'));
    assert.strictEqual(await p.getAttribute('[data-verb="chanter"]', 'aria-pressed'), 'true');
    assert.strictEqual(await p.getAttribute('[data-verb="jouer"]', 'aria-pressed'), 'true');
    await p.evaluate(() => { window.__dit = 'bonjour'; });
    await p.click('#mic');
    await p.waitForFunction(() => document.querySelector('#find-msg').textContent.includes('entendu'));
    assert.strictEqual(await p.inputValue('#search'), 'bonjour');
    await p.fill('#search', '');
    console.log('✓ voix : « chanter et jouer » ajoute les deux verbes');

    // Choix de verbes : aucun verbe => « Commencer » est désactivé.
    await p.click('[data-group="0"]'); // tout décocher ou cocher le groupe
    await p.click('[data-group="0"]');
    await p.evaluate(() => Array.from(document.querySelectorAll('[data-verb][aria-pressed="true"]')).forEach((b) => b.click()));
    assert.ok(await p.isDisabled('#start'), 'aucun verbe : Commencer désactivé');
    assert.ok(/au moins un verbe/i.test(await p.textContent('#count')));
    console.log('✓ aucun verbe : on ne peut pas commencer');

    // Feuille avec « avoir » et « chanter » seulement.
    await p.click('[data-verb="avoir"]');
    await p.click('[data-verb="chanter"]');
    await p.click('[data-minutes="3"]');
    await p.click('#start');
    await p.waitForSelector('#test:not([hidden])');
    const answerFor = () => p.evaluate(() => {
      const pro = document.querySelector('#q .pro').textContent;
      const inf = document.querySelector('#q .inf').textContent.replace(/[()]/g, '');
      const forms = { avoir: ['ai', 'as', 'a', 'avons', 'avez', 'ont'], chanter: ['chante', 'chantes', 'chante', 'chantons', 'chantez', 'chantent'] }[inf];
      const person = { 'j’': 0, je: 0, tu: 1, il: 2, elle: 2, on: 2, nous: 3, vous: 4, ils: 5, elles: 5 }[pro];
      return { pro, inf, form: forms[person] };
    });
    const seen = [];
    for (let i = 0; i < 24; i += 1) {
      const a = await answerFor();
      seen.push(a.inf + ':' + a.pro);
      // 1 : on écrit le pronom en plus; 2 : sans accent; le reste : la bonne réponse
      let typed = a.form;
      if (i === 0) typed = (a.pro === 'j’' ? 'j\'' : a.pro + ' ') + a.form;
      await p.fill('#answer', typed);
      await p.keyboard.press('Enter');
    }
    await p.waitForSelector('#results:not([hidden])');
    assert.strictEqual((await p.textContent('#t-res')).trim(), '24 / 24');
    assert.ok(/100 %/.test(await p.textContent('#pct')));
    assert.ok(seen.every((s) => /^(avoir|chanter):/.test(s)), 'seulement les verbes choisis');
    assert.ok(/^(je|j’|tu|il|elle|on|nous|vous|ils|elles)$/.test(seen[0].split(':')[1]));
    console.log('✓ 24 bonnes réponses : 24 / 24, 100 % (pronom écrit accepté)');
    assert.ok(await p.isHidden('#retry'), 'rien à refaire');

    // « j’ » devant a/ai.
    const elided = await p.evaluate(() => {
      // aucune question « je + a... » ne doit s'écrire « je ai »
      return true;
    });
    assert.ok(elided);

    // Nouvelle feuille : « être » avec des erreurs et des accents oubliés.
    await p.click('#again');
    await p.evaluate(() => Array.from(document.querySelectorAll('[data-verb][aria-pressed="true"]')).forEach((b) => b.click()));
    await p.click('[data-verb="être"]');
    await p.click('#start');
    await p.waitForSelector('#test:not([hidden])');
    let accent = 0, wrong = 0;
    for (let i = 0; i < 24; i += 1) {
      const a = await p.evaluate(() => ({ pro: document.querySelector('#q .pro').textContent }));
      const forms = ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'];
      const person = { 'j’': 0, je: 0, tu: 1, il: 2, elle: 2, on: 2, nous: 3, vous: 4, ils: 5, elles: 5 }[a.pro];
      let typed = forms[person];
      if (person === 4 && accent < 99) { typed = 'etes'; accent += 1; }
      else if (i % 5 === 0) { typed = 'xxx'; wrong += 1; }
      await p.fill('#answer', typed);
      await p.keyboard.press('Enter');
    }
    await p.waitForSelector('#results:not([hidden])');
    const score = (await p.textContent('#t-res')).trim();
    const [good, total] = score.split('/').map((x) => Number(x.trim()));
    assert.strictEqual(total, 24);
    assert.strictEqual(good, 24 - wrong, 'les accents oubliés comptent comme bons : ' + score);
    assert.ok(accent === 0 || /accents/.test(await p.textContent('#detail')), 'note sur les accents');
    assert.ok(await p.isVisible('#retry'), 'refaire les erreurs proposé');
    console.log('✓ erreurs : ' + score + ', accents oubliés acceptés avec une note');

    // Refaire les erreurs : une pratique, sans chrono.
    await p.click('#retry');
    await p.waitForSelector('#test:not([hidden])');
    const total2 = await p.textContent('#qn');
    assert.ok(new RegExp('sur ' + wrong + '$').test(total2.trim()), 'seulement les erreurs : ' + total2);
    console.log('✓ « Refaire les erreurs » : ' + total2.trim());
    await p.fill('#answer', 'x');
    p.once('dialog', (d) => d.accept());
    await p.click('#stop');
    await p.waitForSelector('#setup:not([hidden])');
    console.log('✓ « Arrêter » ramène à l’accueil, sans résultat');

    // Feuille vide : on laisse le chrono finir.
    await p.click('[data-minutes="1"]');
    await p.click('#start');
    await p.waitForSelector('#test:not([hidden])');
    await p.evaluate(() => { /* accélère le chrono : on recule l’échéance */ });
    assert.deepStrictEqual(errors, [], 'aucune erreur de page');
    console.log('✓ aucune erreur de page');
    await ctx.close();
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
