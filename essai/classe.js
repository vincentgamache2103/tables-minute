/* Tables minute : la version classe, gratuite pour les profs.
 *
 * Le serveur (Google Firestore, à Montréal) ne reçoit que du texte chiffré :
 * - la classe (son nom, les prénoms et la clé publique du prof) est chiffrée avec une clé K
 *   qui voyage seulement dans le lien, après le « # ». Les navigateurs n'envoient jamais
 *   cette partie du lien au serveur;
 * - chaque résultat est chiffré pour le prof seul (ECDH P-256, puis AES-GCM) : un élève ne
 *   peut pas lire les résultats des autres, et Vincent non plus.
 * Si le prof perd son lien de prof et change d'appareil, personne ne peut retrouver les résultats.
 *
 * Lien des élèves : ./#c=<classe>.<K>
 * Lien du prof :    ./ma-classe.html#p=<classe>.<K>.<clé privée>
 *
 * Une classe ne change jamais. Pour modifier la liste des prénoms, le prof crée une nouvelle
 * version (nouveau lien des élèves) qui garde les mêmes clés et pointe vers les anciennes (prev) :
 * les anciens liens marchent encore et tous les résultats restent ensemble.
 *
 * La feuille choisie par le prof (pour toute la classe ou pour un élève) : un document de plus,
 * ajouté sous la première version de la classe (classes/<première>/s/…), à chaque changement.
 * Il est chiffré avec la clé K, comme la classe, et signé avec la clé du prof (ECDSA P-256) :
 * un élève qui a le lien de la classe peut le lire, mais pas en écrire un faux. Le plus récent gagne.
 */
(function () {
  'use strict';

  const CFG = (window.TABLES_MINUTE && typeof window.TABLES_MINUTE === 'object' && window.TABLES_MINUTE.classes) || null;
  const HAS_CRYPTO = !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues && window.TextEncoder && window.fetch);
  // Seul l'identifiant du projet est nécessaire : les règles de sécurité de Firestore décident de tout.
  const READY = !!(HAS_CRYPTO && CFG && typeof CFG.project === 'string' && /^[a-z][a-z0-9-]{4,40}$/.test(CFG.project));
  const API_KEY = CFG && typeof CFG.apiKey === 'string' && /^[A-Za-z0-9_-]{20,60}$/.test(CFG.apiKey) ? CFG.apiKey : '';
  const subtle = HAS_CRYPTO ? window.crypto.subtle : null;
  const enc = HAS_CRYPTO ? new TextEncoder() : null;
  const dec = HAS_CRYPTO ? new TextDecoder() : null;

  const ID_RE = /^[A-Za-z0-9_-]{16}$/;
  const K_RE = /^[A-Za-z0-9_-]{22}$/;
  const D_RE = /^[A-Za-z0-9_-]{43}$/;
  const RID_RE = /^[A-Za-z0-9_-]{20}$/;
  const MAX_NAMES = 40;
  const NAME_MAX = 24;
  const MAX_PREV = 100;
  const ROOT = READY ? 'projects/' + CFG.project + '/databases/(default)/documents' : '';
  const API = 'https://firestore.googleapis.com/v1/';

  const KEY_ME = 'tablesMinute.classMe.v1';
  const KEY_DOCS = 'tablesMinute.classDocs.v1';
  const KEY_QUEUE = 'tablesMinute.classQueue.v1';
  const KEY_MINE = 'tablesMinute.myClasses.v1';
  const KEY_RESULTS = 'tablesMinute.classResults.v1.';
  const KEY_SHEETS = 'tablesMinute.classSheets.v1';

  /* ---------- Petits outils ---------- */
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('base64');
    const s = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function random(n) {
    const a = new Uint8Array(n);
    window.crypto.getRandomValues(a);
    return a;
  }
  function concat() {
    const parts = Array.prototype.slice.call(arguments);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    parts.forEach((p) => { out.set(p, at); at += p.length; });
    return out;
  }
  const newId = () => b64u(random(12));
  const store = {
    get(key, fallback) {
      try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del(key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* rien */ }
    }
  };
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

  // Un prénom : des lettres, des chiffres, une espace, un trait d'union, une apostrophe ou un point.
  function cleanName(v) {
    return String(v || '').replace(/[^\p{L}\p{M}\p{N} '’\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }
  // La liste garde la place de chaque élève : un prénom retiré devient une place vide.
  function cleanRoster(list) {
    return (Array.isArray(list) ? list : []).slice(0, MAX_NAMES).map(cleanName);
  }
  function cleanClassName(v) {
    return String(v || '').replace(/[^\p{L}\p{M}\p{N} '’\-.,()#°]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /* ---------- Liens ---------- */
  // Élève : #c=<classe>.<K>   Prof : #p=<classe>.<K>.<clé privée>
  function readHash(hash) {
    const h = String(hash || '').replace(/^#/, '');
    let m = /^c=([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/.exec(h);
    if (m) return { kind: 'student', id: m[1], k: m[2] };
    m = /^p=([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(h);
    if (m) return { kind: 'teacher', id: m[1], k: m[2], d: m[3] };
    m = /^classe=([A-Za-z0-9_-]{16})$/.exec(h);
    if (m) return { kind: 'local', id: m[1] };
    return null;
  }
  const base = () => new URL('./', window.location.href).href;
  const studentHash = (c) => '#c=' + c.id + '.' + c.k;
  const studentLink = (c, query) => base() + (query ? '?' + query : '') + studentHash(c);
  const teacherLink = (c) => base() + 'ma-classe.html#p=' + c.id + '.' + c.k + '.' + c.d;

  /* ---------- Chiffrement ---------- */
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  async function aes(raw, usage) {
    return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usage);
  }
  async function sealClass(k, id, data) {
    const iv = random(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('tm-classe:' + id) },
      await aes(unb64u(k), ['encrypt']), enc.encode(JSON.stringify(data)));
    return b64u(concat(iv, new Uint8Array(ct)));
  }
  async function openClass(k, id, d) {
    const bytes = unb64u(d);
    if (bytes.length < 29) throw new Error('court');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode('tm-classe:' + id) },
      await aes(unb64u(k), ['decrypt']), bytes.slice(12));
    const raw = obj(JSON.parse(dec.decode(pt)));
    if (raw.v !== 1 || typeof raw.p !== 'string' || unb64u(raw.p).length !== 65) throw new Error('classe');
    return {
      v: 1,
      n: cleanClassName(raw.n),
      r: cleanRoster(raw.r),
      p: raw.p,
      prev: (Array.isArray(raw.prev) ? raw.prev : []).filter((x) => ID_RE.test(x)).slice(0, MAX_PREV),
      at: Number(raw.at) || 0
    };
  }
  async function resultKey(bits, id, usage) {
    const k = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('tm-classe:' + id), info: enc.encode('tm-resultat-v1') },
      k, { name: 'AES-GCM', length: 256 }, false, usage);
  }
  async function sealResult(pub, id, data) {
    const teacher = await subtle.importKey('raw', unb64u(pub), ECDH, false, []);
    const eph = await subtle.generateKey(ECDH, true, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: teacher }, eph.privateKey, 256);
    const iv = random(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('tm-resultat:' + id) },
      await resultKey(bits, id, ['encrypt']), enc.encode(JSON.stringify(data)));
    const ephRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
    return b64u(concat(ephRaw, iv, new Uint8Array(ct)));
  }
  async function teacherKey(pub, d) {
    const raw = unb64u(pub);
    const jwk = { kty: 'EC', crv: 'P-256', x: b64u(raw.slice(1, 33)), y: b64u(raw.slice(33, 65)), d: d, ext: true };
    return subtle.importKey('jwk', jwk, ECDH, false, ['deriveBits']);
  }
  async function openResult(priv, id, d) {
    const bytes = unb64u(d);
    if (bytes.length < 65 + 12 + 17) throw new Error('court');
    const eph = await subtle.importKey('raw', bytes.slice(0, 65), ECDH, false, []);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: eph }, priv, 256);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(65, 77), additionalData: enc.encode('tm-resultat:' + id) },
      await resultKey(bits, id, ['decrypt']), bytes.slice(77));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- La feuille choisie par le prof ---------- */
  // Une feuille : { o: opérations, t: tables, st: stratégies (× et ÷ seulement), m: minutes, k: sorte, q: questions }.
  const SHEET_OPS = ['mul', 'div', 'add', 'sub'];
  const SHEET_KINDS = ['mix', 'product', 'missing'];
  // Les stratégies, dans l'ordre où une enseignante les présente, jusqu'à la table de 10.
  const STRATS = [
    { key: 's1', name: 'Les simples (×1)', short: 'simples' },
    { key: 's2', name: 'Les doubles (×2)', short: 'doubles' },
    { key: 'sq', name: 'Les carrés', short: 'carrés' },
    { key: 's5', name: 'Les ×5', short: '×5' },
    { key: 's10', name: 'Les ×10', short: '×10' },
    { key: 's9', name: 'Les ×9', short: '×9' },
    { key: 'oth', name: 'Les autres', short: 'les autres' }
  ];
  const STRAT_KEYS = STRATS.map((s) => s.key);
  function pickIn(list, allowed) {
    return allowed.filter((x) => (Array.isArray(list) ? list : []).indexOf(x) >= 0);
  }
  function cleanSheet(raw) {
    const r = obj(raw);
    const o = pickIn(r.o, SHEET_OPS);
    if (!o.length) return null;
    const st = pickIn(r.st, STRAT_KEYS);
    const t = Array.from(new Set((Array.isArray(r.t) ? r.t : []).map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))).sort((a, b) => a - b);
    // Les stratégies sont des faits de multiplication : seulement avec × et ÷.
    const strat = st.length > 0 && o.every((x) => x === 'mul' || x === 'div');
    if (!strat && !t.length) return null;
    return {
      o: o,
      t: strat ? [] : t,
      st: strat ? st : [],
      m: [2, 3, 4].indexOf(Number(r.m)) >= 0 ? Number(r.m) : 2,
      k: SHEET_KINDS.indexOf(r.k) >= 0 ? r.k : 'mix',
      q: [12, 24, 36].indexOf(Number(r.q)) >= 0 ? Number(r.q) : 24
    };
  }
  // Les règles du prof : des feuilles nommées (« Groupe des doubles »), et les élèves placés dans chacune.
  // all : la feuille du reste de la classe (null : ces élèves choisissent eux-mêmes).
  // rules : [{ id, n: nom, s: feuille }]. by : { place de l'élève : id de sa règle }.
  const MAX_RULES = 12;
  const RULE_ID = /^[a-z0-9]{1,8}$/;
  function cleanSheets(raw) {
    const r = obj(raw);
    const rules = [];
    (Array.isArray(r.rules) ? r.rules : []).slice(0, MAX_RULES).forEach((x) => {
      const o = obj(x);
      const s = cleanSheet(o.s);
      if (!s || !RULE_ID.test(o.id) || rules.some((y) => y.id === o.id)) return;
      rules.push({ id: o.id, n: cleanClassName(o.n) || 'Règle ' + (rules.length + 1), s: s });
    });
    const by = {};
    Object.keys(obj(r.by)).forEach((i) => {
      const n = Number(i);
      const id = r.by[i];
      if (Number.isInteger(n) && n >= 0 && n < MAX_NAMES && String(n) === i && rules.some((y) => y.id === id)) by[i] = id;
    });
    return { v: 2, at: Number(r.at) || 0, all: cleanSheet(r.all), rules: rules, by: by };
  }
  // La feuille d'un élève : celle de sa règle, sinon celle du reste de la classe, sinon aucune.
  function ruleFor(sheets, i) {
    if (!sheets || !Number.isInteger(i) || i < 0) return null;
    const id = sheets.by[String(i)];
    return id ? sheets.rules.filter((x) => x.id === id)[0] || null : null;
  }
  function sheetFor(sheets, i) {
    if (!sheets) return null;
    const rule = ruleFor(sheets, i);
    return rule ? rule.s : sheets.all || null;
  }
  // Toutes les versions d'une classe partagent leur première version : c'est là que vit sa feuille.
  const rootId = (id, info) => (info && info.prev && info.prev.length ? info.prev[info.prev.length - 1] : id);

  const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
  async function sealSheets(k, pub, d, root, sheets) {
    const raw = unb64u(pub);
    const jwk = { kty: 'EC', crv: 'P-256', x: b64u(raw.slice(1, 33)), y: b64u(raw.slice(33, 65)), d: d, ext: true };
    const key = await subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
    const j = JSON.stringify(sheets);
    const sig = new Uint8Array(await subtle.sign(SIGN, key, enc.encode('tm-feuille:' + root + ':' + j)));
    const iv = random(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('tm-feuille:' + root) },
      await aes(unb64u(k), ['encrypt']), enc.encode(JSON.stringify({ j: j, s: b64u(sig) })));
    return b64u(concat(iv, new Uint8Array(ct)));
  }
  async function openSheets(k, pub, root, d) {
    const bytes = unb64u(d);
    if (bytes.length < 29) throw new Error('court');
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode('tm-feuille:' + root) },
      await aes(unb64u(k), ['decrypt']), bytes.slice(12));
    const box = obj(JSON.parse(dec.decode(pt)));
    if (typeof box.j !== 'string' || typeof box.s !== 'string') throw new Error('feuille');
    const key = await subtle.importKey('raw', unb64u(pub), ECDSA, false, ['verify']);
    const ok = await subtle.verify(SIGN, key, unb64u(box.s), enc.encode('tm-feuille:' + root + ':' + box.j));
    if (!ok) throw new Error('signature');
    return cleanSheets(JSON.parse(box.j));
  }

  /* ---------- Serveur (API REST de Firestore) ---------- */
  function url(path) {
    return API + path + (API_KEY ? (path.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY) : '');
  }
  function fail(status, text) {
    const e = new Error('serveur ' + status);
    e.status = status;
    e.offline = status === 0;
    e.exists = /ALREADY_EXISTS|already exists/.test(text || '');
    return e;
  }
  async function call(path, body, method) {
    let res;
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 15000) : 0;
    try {
      const opt = body === undefined
        ? { method: method || 'GET', cache: 'no-store' }
        : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' };
      if (ctl) opt.signal = ctl.signal;
      res = await fetch(url(path), opt);
    } catch (e) { throw fail(0, ''); }
    finally { clearTimeout(timer); }
    if (res.ok) return res.json();
    let text = '';
    try { text = await res.text(); } catch (e) { /* rien */ }
    throw fail(res.status, text);
  }
  async function fetchClassDoc(id) {
    try {
      const j = await call(ROOT + '/classes/' + id);
      const d = j && j.fields && j.fields.d && j.fields.d.stringValue;
      if (typeof d !== 'string') throw fail(500, '');
      return d;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  async function putClassDoc(id, d) {
    await call(ROOT + '/classes?documentId=' + id, { fields: { d: { stringValue: d }, v: { integerValue: '1' } } });
  }
  async function putResult(id, rid, d) {
    await call(ROOT + ':commit', {
      writes: [{
        update: { name: ROOT + '/classes/' + id + '/r/' + rid, fields: { d: { stringValue: d } } },
        updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false }
      }]
    });
  }
  async function resultThere(id, rid) {
    try { await call(ROOT + '/classes/' + id + '/r/' + rid); return true; } catch (e) { return false; }
  }
  // Les résultats arrivés depuis « after » (heure du serveur, au millième de seconde), du plus ancien au plus récent.
  // « Depuis » inclut « after » : deux feuilles reçues dans la même milliseconde ne se perdent pas; les doublons sont écartés par leur nom.
  async function queryResults(id, after) {
    const q = {
      from: [{ collectionId: 'r' }],
      orderBy: [{ field: { fieldPath: 't' }, direction: 'ASCENDING' }],
      limit: 300
    };
    if (after) q.where = { fieldFilter: { field: { fieldPath: 't' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: after } } };
    const rows = await call(ROOT + '/classes/' + id + ':runQuery', { structuredQuery: q });
    return (Array.isArray(rows) ? rows : []).filter((r) => r && r.document && r.document.fields).map((r) => {
      const f = r.document.fields;
      return { n: String(r.document.name || '').split('/').pop(), t: f.t && f.t.timestampValue, d: f.d && f.d.stringValue };
    }).filter((r) => typeof r.t === 'string' && typeof r.d === 'string');
  }

  // Les feuilles du prof : chaque changement ajoute un document; on lit les plus récents.
  async function putSheetsDoc(root, sid, d) {
    await call(ROOT + ':commit', {
      writes: [{
        update: { name: ROOT + '/classes/' + root + '/s/' + sid, fields: { d: { stringValue: d } } },
        updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false }
      }]
    });
  }
  async function querySheets(root) {
    const q = {
      from: [{ collectionId: 's' }],
      orderBy: [{ field: { fieldPath: 't' }, direction: 'DESCENDING' }],
      limit: 50
    };
    const rows = await call(ROOT + '/classes/' + root + ':runQuery', { structuredQuery: q });
    return (Array.isArray(rows) ? rows : []).filter((r) => r && r.document && r.document.fields)
      .map((r) => r.document.fields.d && r.document.fields.d.stringValue).filter((d) => typeof d === 'string');
  }

  /* ---------- Ouvrir une classe (élève ou prof) ---------- */
  // Une classe ne change jamais : une fois lue, on la garde (chiffrée) sur l'appareil.
  async function loadClass(id, k) {
    const cache = obj(store.get(KEY_DOCS, {}));
    let d = typeof cache[id] === 'string' ? cache[id] : null;
    if (d) {
      try { return await openClass(k, id, d); } catch (e) { d = null; }
    }
    d = await fetchClassDoc(id);
    if (!d) { const e = new Error('introuvable'); e.missing = true; throw e; }
    const c = await openClass(k, id, d);
    const keep = {};
    Object.keys(cache).slice(-7).forEach((x) => { keep[x] = cache[x]; });
    keep[id] = d;
    store.set(KEY_DOCS, keep);
    return c;
  }

  /* ---------- La feuille du prof : lire et enregistrer ---------- */
  // La dernière feuille lue est gardée sur l'appareil : sans Internet, l'élève garde la feuille du prof.
  function cachedSheets(root) {
    const all = obj(store.get(KEY_SHEETS, {}));
    return all[root] ? cleanSheets(all[root]) : null;
  }
  function keepSheets(root, sheets) {
    const all = obj(store.get(KEY_SHEETS, {}));
    const keep = {};
    Object.keys(all).filter((x) => x !== root).slice(-7).forEach((x) => { keep[x] = all[x]; });
    keep[root] = sheets;
    store.set(KEY_SHEETS, keep);
  }
  // La plus récente des feuilles signées par le prof (selon l'heure écrite dedans : une vieille copie remise ne gagne pas).
  // Retourne { sheets, offline } : sheets vaut null si le prof n'a jamais choisi de feuille.
  async function loadSheets(id, k, info) {
    const root = rootId(id, info);
    let best = cachedSheets(root);
    let offline = false;
    try {
      const docs = await querySheets(root);
      for (let i = 0; i < docs.length; i++) {
        try {
          const s = await openSheets(k, info.p, root, docs[i]);
          if (!best || s.at > best.at) best = s;
        } catch (e) { /* document faux ou abîmé : on l'ignore */ }
      }
      if (best) keepSheets(root, best);
    } catch (e) {
      if (e.offline) offline = true; else if (e.status !== 403 && e.status !== 404) throw e;
    }
    return { sheets: best, offline: offline };
  }
  async function saveSheets(c, info, sheets) {
    if (!READY) throw new Error('pas prêt');
    const root = rootId(c.id, info);
    const clean = cleanSheets(Object.assign({}, sheets, { at: Date.now() }));
    const d = await sealSheets(c.k, info.p, c.d, root, clean);
    await putSheetsDoc(root, b64u(random(15)), d);
    keepSheets(root, clean);
    return clean;
  }

  /* ---------- Élève : qui je suis dans cette classe ---------- */
  function myIndex(id) {
    const me = obj(store.get(KEY_ME, {}));
    const v = obj(me[id]);
    return Number.isInteger(v.i) ? v.i : -1;
  }
  // Depuis combien de temps l'élève a confirmé son prénom sur cet appareil (en millisecondes).
  function myAge(id) {
    const v = obj(obj(store.get(KEY_ME, {}))[id]);
    return Number.isFinite(v.at) ? Date.now() - v.at : Infinity;
  }
  function setMyIndex(id, i) {
    const me = obj(store.get(KEY_ME, {}));
    if (i < 0) delete me[id];
    else me[id] = { i: i, at: Date.now() };
    const keep = {};
    Object.keys(me).sort((a, b) => (obj(me[a]).at || 0) - (obj(me[b]).at || 0)).slice(-10).forEach((x) => { keep[x] = me[x]; });
    store.set(KEY_ME, keep);
  }

  const KEY_LAST = 'tablesMinute.lastClass.v1';
  function rememberStudentClass(link, name) {
    store.set(KEY_LAST, { h: studentHash(link), n: cleanClassName(name), at: Date.now() });
  }
  function lastStudentClass() {
    const v = obj(store.get(KEY_LAST, null));
    const h = readHash(v.h);
    if (!h || h.kind !== 'student' || !(Date.now() - (v.at || 0) < 150 * 864e5)) return null;
    return { h: v.h, n: cleanClassName(v.n) };
  }

  /* ---------- Élève : envoyer un résultat (avec une file d'attente hors ligne) ---------- */
  // La file garde seulement du texte déjà chiffré.
  function queue() {
    const q = store.get(KEY_QUEUE, []);
    return (Array.isArray(q) ? q : []).filter((x) => x && ID_RE.test(x.c) && RID_RE.test(x.r) && typeof x.d === 'string');
  }
  async function flushNow() {
    let sent = 0;
    const items = queue();
    const left = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        await putResult(it.c, it.r, it.d);
        sent += 1;
      } catch (e) {
        // Déjà reçu (la réponse s'était perdue) : c'est envoyé.
        if (e.exists || (!e.offline && await resultThere(it.c, it.r))) { sent += 1; continue; }
        // Hors ligne, quota du jour atteint ou serveur occupé : on réessaiera sans compter d'échec.
        const passing = e.offline || e.status === 429 || e.status >= 500;
        it.tries = (it.tries || 0) + (passing ? 0 : 1);
        if (it.tries < 5 && Date.now() - (it.at || 0) < 30 * 864e5) left.push(it);
      }
    }
    // Un résultat ajouté pendant l'envoi reste dans la file.
    const done = items.map((x) => x.r);
    const keep = left.concat(queue().filter((x) => done.indexOf(x.r) < 0)).slice(-60);
    if (keep.length) store.set(KEY_QUEUE, keep); else store.del(KEY_QUEUE);
    return { sent: sent, left: keep.length };
  }
  let flushing = null;
  function flush() {
    if (!READY) return Promise.resolve({ sent: 0, left: 0 });
    if (!flushing) flushing = flushNow().finally(() => { flushing = null; });
    return flushing;
  }
  const queued = (rid) => queue().some((x) => x.r === rid);
  async function sendResult(c, data) {
    const d = await sealResult(c.p, c.id, data);
    const rid = b64u(random(15));
    const q = queue();
    q.push({ c: c.id, r: rid, d: d, at: Date.now() });
    if (!store.set(KEY_QUEUE, q.slice(-60))) {
      // Pas de stockage sur cet appareil : un seul essai, tout de suite.
      try { await putResult(c.id, rid, d); return { sent: true, queued: 0 }; }
      catch (e) {
        const there = e.exists || (!e.offline && await resultThere(c.id, rid));
        return { sent: there, queued: 0, lost: !there };
      }
    }
    let r = await flush();
    // Une file déjà en route ne contenait pas ce résultat : on repart une fois.
    if (queued(rid)) r = await flush();
    return { sent: !queued(rid), queued: r.left };
  }
  if (READY) {
    window.addEventListener('online', () => { flush(); });
  }

  /* ---------- Prof : ses classes, gardées sur cet appareil ---------- */
  function mine() {
    const raw = obj(store.get(KEY_MINE, {}));
    const list = (Array.isArray(raw.list) ? raw.list : []).filter((c) => c && ID_RE.test(c.id) && K_RE.test(c.k) && D_RE.test(c.d));
    return { list: list, cur: typeof raw.cur === 'string' ? raw.cur : '' };
  }
  function saveMine(m) {
    return store.set(KEY_MINE, { list: m.list.slice(-20), cur: m.cur });
  }
  // Une classe vue sur cet appareil : on la garde. Une nouvelle version remplace l'ancienne.
  function remember(c, info) {
    const m = mine();
    const prev = info && Array.isArray(info.prev) ? info.prev : [];
    const i = m.list.findIndex((x) => x.id === c.id || prev.indexOf(x.id) >= 0);
    const entry = { id: c.id, k: c.k, d: c.d, n: info ? info.n : '', cnt: info ? info.r.filter(Boolean).length : 0, prev: prev.slice(0, MAX_PREV), at: (info && info.at) || Date.now() };
    if (i >= 0) m.list[i] = entry; else m.list.push(entry);
    m.cur = c.id;
    saveMine(m);
    return entry;
  }
  // Un vieux lien de prof : la version plus récente déjà gardée sur cet appareil, s'il y en a une.
  function newer(id) {
    return mine().list.filter((x) => Array.isArray(x.prev) && x.prev.indexOf(id) >= 0)[0] || null;
  }
  function forget(id) {
    const m = mine();
    const gone = m.list.filter((x) => x.id === id)[0];
    m.list = m.list.filter((x) => x.id !== id);
    if (m.cur === id) m.cur = m.list.length ? m.list[m.list.length - 1].id : '';
    saveMine(m);
    [id].concat((gone && gone.prev) || []).forEach((x) => store.del(KEY_RESULTS + x));
  }

  async function createClass(name, roster, from) {
    if (!READY) throw new Error('pas prêt');
    const r = cleanRoster(roster);
    if (!r.some(Boolean)) throw new Error('vide');
    let keys;
    let prev = [];
    if (from) {
      keys = { k: from.k, d: from.d, p: from.info.p };
      const chain = [from.id].concat(from.info.prev || []);
      prev = chain.length > MAX_PREV ? chain.slice(0, MAX_PREV - 1).concat(chain[chain.length - 1]) : chain;
    } else {
      const kp = await subtle.generateKey(ECDH, true, ['deriveBits']);
      const jwk = await subtle.exportKey('jwk', kp.privateKey);
      const raw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
      keys = { k: b64u(random(16)), d: jwk.d, p: b64u(raw) };
    }
    const info = { v: 1, n: cleanClassName(name), r: r, p: keys.p, prev: prev, at: Date.now() };
    for (let tries = 0; tries < 3; tries++) {
      const id = newId();
      const d = await sealClass(keys.k, id, info);
      try {
        await putClassDoc(id, d);
      } catch (e) {
        if (e.exists) continue;
        throw e;
      }
      const cache = obj(store.get(KEY_DOCS, {}));
      cache[id] = d;
      store.set(KEY_DOCS, cache);
      const c = { id: id, k: keys.k, d: keys.d };
      remember(c, info);
      return { c: c, info: info };
    }
    throw new Error('code');
  }

  /* ---------- Prof : lire les résultats ---------- */
  // Les résultats chiffrés sont gardés sur l'appareil du prof; on demande seulement les nouveaux.
  async function results(c, info, onProgress) {
    const priv = await teacherKey(info.p, c.d);
    const ids = [c.id].concat(info.prev || []);
    const out = [];
    let failed = 0;
    let offline = false;
    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const cache = obj(store.get(KEY_RESULTS + id, {}));
      let docs = Array.isArray(cache.docs) ? cache.docs.filter((x) => Array.isArray(x) && x.length === 3) : [];
      let after = typeof cache.t === 'string' ? cache.t : '';
      // On relit les deux dernières minutes : un résultat reçu juste avant la dernière lecture
      // peut avoir été enregistré juste après. Les doublons sont écartés par leur nom.
      let from = after && Number.isFinite(Date.parse(after)) ? new Date(Date.parse(after) - 120000).toISOString() : '';
      const seen = {};
      docs.forEach((x) => { seen[x[0]] = true; });
      try {
        for (let page = 0; page < 40; page++) {
          const rows = await queryResults(id, from);
          rows.forEach((row) => { if (!seen[row.n]) { seen[row.n] = true; docs.push([row.n, row.t, row.d]); } });
          if (rows.length) {
            from = rows[rows.length - 1].t;
            if (!after || Date.parse(from) > Date.parse(after)) after = from;
          }
          if (onProgress) onProgress(docs.length);
          if (rows.length < 300) break;
        }
      } catch (e) {
        if (e.offline) offline = true; else failed += 1;
      }
      docs = docs.slice(-4000);
      let kept = false;
      for (const n of [4000, 1500, 500]) {
        if (store.set(KEY_RESULTS + id, { t: after, docs: docs.slice(-n) })) { kept = true; break; }
      }
      if (!kept) store.del(KEY_RESULTS + id);
      const opened = await Promise.all(docs.map((x) => openResult(priv, id, x[2]).then((r) => ({ id: x[0], t: x[1], r: r }), () => null)));
      opened.forEach((x) => { if (x) out.push(x); });
    }
    return { list: out, failed: failed, offline: offline };
  }

  window.TMClasse = {
    ready: READY,
    readHash: readHash,
    studentHash: studentHash,
    studentLink: studentLink,
    teacherLink: teacherLink,
    cleanName: cleanName,
    cleanClassName: cleanClassName,
    MAX_NAMES: MAX_NAMES,
    NAME_MAX: NAME_MAX,
    loadClass: loadClass,
    myIndex: myIndex,
    myAge: myAge,
    setMyIndex: setMyIndex,
    rememberStudentClass: rememberStudentClass,
    lastStudentClass: lastStudentClass,
    sendResult: sendResult,
    flush: flush,
    pending: () => queue().length,
    mine: mine,
    saveMine: saveMine,
    remember: remember,
    newer: newer,
    forget: forget,
    createClass: createClass,
    results: results,
    STRATS: STRATS,
    MAX_RULES: MAX_RULES,
    cleanSheet: cleanSheet,
    cleanSheets: cleanSheets,
    ruleFor: ruleFor,
    sheetFor: sheetFor,
    loadSheets: loadSheets,
    saveSheets: saveSheets
  };
})();
