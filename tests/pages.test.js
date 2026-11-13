// Chaque page s'ouvre sans erreur JavaScript, sur ordinateur et sur téléphone, sans défilement horizontal.
const { chromium, assert, server, setup } = require('./outils');
const PAGES = ['', 'ma-classe.html', 'classe.html', 'apropos.html', 'division.html', 'addition-soustraction.html', 'entiers/', 'essai/', 'essai/ma-classe.html'];
(async () => {
  await new Promise((r) => server.listen(8771, r));
  const BASE = 'http://localhost:8771/';
  const browser = await chromium.launch();
  try {
    for (const vp of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
      for (const pg of PAGES) {
        const errors = [];
        const ctx = await browser.newContext({ viewport: vp });
        await setup(ctx, errors);
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
        const p = await ctx.newPage();
        const res = await p.goto(BASE + pg);
        assert.strictEqual(res.status(), 200, pg + ' : ' + res.status());
        await p.waitForTimeout(400);
        const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(wide <= 1, pg + ' déborde de ' + wide + ' px à ' + vp.width + ' px');
        assert.deepStrictEqual(errors, [], pg);
        await ctx.close();
      }
      console.log('✓ ' + PAGES.length + ' pages sans erreur ni débordement à ' + vp.width + ' px');
    }
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
