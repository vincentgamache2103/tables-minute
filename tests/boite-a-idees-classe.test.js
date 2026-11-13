// Mode classe : pas de boîte à idées (#18).
const { chromium } = require('playwright');
const assert = require('assert');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise((r) => srv.listen(8769, r));
  const b = await chromium.launch();
  for (const pg of ['', 'essai/']) {
    const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
    await ctx.route(/goatcounter|web3forms|fonts\.g|firestore/, (r) => r.fulfill({ status: 404, body: '{}' }));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8769/' + pg);
    assert.ok(await p.locator('#ideas').isVisible(), 'boîte visible sans classe');
    await p.goto('http://localhost:8769/' + pg + '?ref=classe#c=AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB');
    await p.reload(); await p.waitForTimeout(500);
    assert.ok(await p.locator('#klass').isVisible(), 'mode classe');
    assert.strictEqual(await p.locator('#ideas').isVisible(), false, 'boîte cachée en mode classe');
    assert.strictEqual(await p.locator('#menu-idea-li').isHidden(), true, 'menu caché');
    assert.strictEqual(await p.locator('#idea-form input[type="email"], #idea-form input[name="email"]').evaluateAll((els) => els.filter((e) => e.offsetParent).length), 0);
    assert.deepStrictEqual(errs, []);
    console.log('✓ ' + (pg || 'public') + ' : boîte à idées visible normalement, cachée en mode classe');
  }
  await b.close(); srv.close();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
