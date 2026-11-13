// Outils communs des tests : le site servi en local, et un faux Firestore en mémoire
// qui applique les mêmes règles que firestore.rules (pour les parties utiles aux tests).
const { chromium } = require('playwright');
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* ---------- Faux Firestore ---------- */
const db = {}; // chemin -> { d, t }
let clock = Date.parse('2026-11-12T15:00:00Z');
const now = () => new Date(clock += 1000).toISOString();
const rulesDenyS = { on: false }; const busy = { on: false }; const seenLimits = []; // pour simuler des règles pas encore publiées
async function firestore(route) {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname.replace(/^\/v1\/projects\/tables-minute\/databases\/\(default\)\/documents/, '');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
  if (req.method() === 'GET') {
    const doc = db[p];
    if (!doc) return json(404, { error: { status: 'NOT_FOUND' } });
    const fields = { d: { stringValue: doc.d } };
    if (doc.t) fields.t = { timestampValue: doc.t };
    return json(200, { name: p, fields });
  }
  if (p === '/classes' && u.searchParams.get('documentId')) {
    const id = u.searchParams.get('documentId');
    if (db['/classes/' + id]) return json(409, { error: { status: 'ALREADY_EXISTS' } });
    db['/classes/' + id] = { d: body.fields.d.stringValue };
    return json(200, {});
  }
  if (p === ':commit' && busy.on && /\/r\//.test(body.writes[0].update.name)) return json(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
  if (p === ':commit') {
    const w = body.writes[0];
    const name = w.update.name.replace(/^projects\/tables-minute\/databases\/\(default\)\/documents/, '');
    const m = /^\/classes\/([^/]+)\/(r|s)\/([^/]+)$/.exec(name);
    if (!m || !db['/classes/' + m[1]]) return json(403, { error: { status: 'PERMISSION_DENIED' } });
    const d = w.update.fields.d.stringValue;
    if (m[2] === 's' && (rulesDenyS.on || d.length <= 100 || d.length > 16000 || !/^[A-Za-z0-9_-]{20}$/.test(m[3]))) return json(403, { error: { status: 'PERMISSION_DENIED' } });
    if (db[name]) return json(409, { error: { status: 'ALREADY_EXISTS' } });
    db[name] = { d, t: now() };
    return json(200, {});
  }
  const q = /^\/classes\/([^/]+):runQuery$/.exec(p);
  if (q) {
    const sq = body.structuredQuery; if (sq.from[0].collectionId === 's') seenLimits.push(sq.limit);
    const coll = sq.from[0].collectionId;
    if (coll === 's' && (rulesDenyS.on || sq.limit > 50)) return json(403, { error: { status: 'PERMISSION_DENIED' } });
    const pre = '/classes/' + q[1] + '/' + coll + '/';
    let rows = Object.keys(db).filter((k) => k.startsWith(pre)).map((k) => ({ k, ...db[k] }));
    if (sq.where) rows = rows.filter((r) => r.t >= sq.where.fieldFilter.value.timestampValue);
    rows.sort((a, b) => (a.t < b.t ? -1 : 1));
    if (sq.orderBy[0].direction === 'DESCENDING') rows.reverse();
    rows = rows.slice(0, sq.limit);
    return json(200, rows.map((r) => ({ document: { name: 'projects/tables-minute/databases/(default)/documents' + r.k, fields: { d: { stringValue: r.d }, t: { timestampValue: r.t } } } })));
  }
  return json(400, { error: 'inconnu ' + p });
}

async function setup(ctx, errors) {
  await ctx.route('https://firestore.googleapis.com/**', firestore);
  await ctx.route(/goatcounter|api\.web3forms/, (r) => r.fulfill({ status: 204, body: '' }));
  ctx.on('page', (pg) => {
    pg.on('pageerror', (e) => errors.push(e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  });
}


// Résoudre une question telle qu'affichée (« 4×=28 », « 28÷4= », « 7−=3 »…).
const solve = (t) => { const s = t.replace(/\s+/g, '').replace('−', '-'); const m = /^(\d*)([×÷+\-])(\d*)=(\d*)$/.exec(s); if (!m) return '0'; const [, a, op, b, c] = m; const A = +a, B = +b, C = +c;
  if (c === '') return String({ '×': A * B, '÷': A / B, '+': A + B, '-': A - B }[op]);
  if (a === '') return String({ '×': C / B, '+': C - B, '÷': C * B, '-': C + B }[op]);
  return String({ '×': C / A, '+': C - A, '÷': A / C, '-': A - C }[op]); };

module.exports = { chromium, assert, fs, path, ROOT, server, db, now, rulesDenyS, busy, seenLimits, setup, solve };
