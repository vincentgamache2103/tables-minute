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
  const ROOT = READY ? 'projects/' + CFG.project + '/databases/(default)/documents' : '';
  const API = 'https://firestore.googleapis.com/v1/';

  const KEY_ME = 'tablesMinute.classMe.v1';
  const KEY_DOCS = 'tablesMinute.classDocs.v1';
  const KEY_QUEUE = 'tablesMinute.classQueue.v1';
  const KEY_MINE = 'tablesMinute.myClasses.v1';
  const KEY_RESULTS = 'tablesMinute.classResults.v1.';

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
      prev: (Array.isArray(raw.prev) ? raw.prev : []).filter((x) => ID_RE.test(x)).slice(0, 20),
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

  /* ---------- Serveur (API REST de Firestore) ---------- */
  function url(path) {
    return API + path + (API_KEY ? (path.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY) : '');
  }
  function fail(status, text) {
    const e = new Error('serveur ' + status);
    e.status = status;
    e.offline = status === 0;
    e.exists = status === 409 || /ALREADY_EXISTS|FAILED_PRECONDITION/.test(text || '');
    return e;
  }
  async function call(path, body, method) {
    let res;
    try {
      res = await fetch(url(path), body === undefined
        ? { method: method || 'GET', cache: 'no-store' }
        : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    } catch (e) { throw fail(0, ''); }
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
  // Les résultats arrivés après « after » (heure du serveur), du plus ancien au plus récent.
  async function queryResults(id, after) {
    const q = {
      from: [{ collectionId: 'r' }],
      orderBy: [{ field: { fieldPath: 't' }, direction: 'ASCENDING' }],
      limit: 300
    };
    if (after) q.where = { fieldFilter: { field: { fieldPath: 't' }, op: 'GREATER_THAN', value: { timestampValue: after } } };
    const rows = await call(ROOT + '/classes/' + id + ':runQuery', { structuredQuery: q });
    return (Array.isArray(rows) ? rows : []).filter((r) => r && r.document && r.document.fields).map((r) => {
      const f = r.document.fields;
      return { n: String(r.document.name || '').split('/').pop(), t: f.t && f.t.timestampValue, d: f.d && f.d.stringValue };
    }).filter((r) => typeof r.t === 'string' && typeof r.d === 'string');
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

  /* ---------- Élève : qui je suis dans cette classe ---------- */
  function myIndex(id) {
    const me = obj(store.get(KEY_ME, {}));
    const v = obj(me[id]);
    return Number.isInteger(v.i) ? v.i : -1;
  }
  function setMyIndex(id, i) {
    const me = obj(store.get(KEY_ME, {}));
    if (i < 0) delete me[id];
    else me[id] = { i: i, at: Date.now() };
    const keep = {};
    Object.keys(me).sort((a, b) => (obj(me[a]).at || 0) - (obj(me[b]).at || 0)).slice(-10).forEach((x) => { keep[x] = me[x]; });
    store.set(KEY_ME, keep);
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
        if (e.exists) { sent += 1; continue; }
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
      catch (e) { return { sent: !!e.exists, queued: 0, lost: !e.exists }; }
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
    const entry = { id: c.id, k: c.k, d: c.d, n: info ? info.n : '', cnt: info ? info.r.filter(Boolean).length : 0, prev: prev.slice(0, 20), at: (info && info.at) || Date.now() };
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
      prev = [from.id].concat(from.info.prev || []).slice(0, 20);
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
      if (!store.set(KEY_RESULTS + id, { t: after, docs: docs })) store.del(KEY_RESULTS + id);
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
    setMyIndex: setMyIndex,
    sendResult: sendResult,
    flush: flush,
    pending: () => queue().length,
    mine: mine,
    saveMine: saveMine,
    remember: remember,
    newer: newer,
    forget: forget,
    createClass: createClass,
    results: results
  };
})();
