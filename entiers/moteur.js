/* Entiers minute : moteur des questions (sans affichage).
   Notation québécoise : vrai signe moins (U+2212); un négatif qui suit un opérateur va entre parenthèses
   (5 − (−3), −6 × (−2), 42 ÷ (−7)); pas de parenthèses en tête (−8 + 3); jamais de (+4) ni de −0.
   En algèbre : 3x, −x, 2x − 7 = 11. */
(function (root) {
  'use strict';
  const MINUS = '−';
  const SYM = { add: '+', sub: MINUS, mul: '×', div: '÷' };

  const MODULES = {
    as: { name: '+ et −', ops: ['add', 'sub'], max: 12, count: 24, typed: true, ex: MINUS + '7 + 4' },
    md: { name: '× et ÷', ops: ['mul', 'div'], max: 10, count: 24, typed: true, ex: MINUS + '6 × 7' },
    all: { name: 'Les 4 opérations', ops: ['add', 'sub', 'mul', 'div'], max: 10, count: 24, typed: true, ex: '4 − (−5), −3 × (−4)…' },
    x1: { name: 'Trouve x', eq: 1, count: 24, typed: false, ex: 'x + 9 = 4' },
    x2: { name: 'Trouve x en 2\u00a0étapes', eq: 2, count: 12, typed: false, ex: '2x − 7 = 11' }
  };
  const TYPES = { mix: ['result', 'missing'], res: ['result'], miss: ['missing'] };

  // Hasard remplaçable : une feuille préparée par le prof doit être identique pour tout le groupe.
  let random = Math.random;
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setSeed(seed) { random = seed === null || seed === undefined ? Math.random : seeded(seed); }
  const rnd = (n) => Math.floor(random() * n);
  const sign = () => (random() < 0.5 ? -1 : 1);
  const nz = (max) => 1 + rnd(max); // 1..max
  const between = (lo, hi) => lo + rnd(hi - lo + 1);

  function calc(op, a, b) {
    if (op === 'add') return a + b;
    if (op === 'sub') return a - b;
    if (op === 'mul') return a * b;
    return a / b;
  }
  const z = (n) => (Object.is(n, -0) ? 0 : n);

  /* ---------- Calcul : a op b = c ---------- */
  // Au moins un négatif (dans un terme ou la réponse). Environ le tiers des soustractions retranchent un négatif.
  function makeFact(op, max) {
    for (let tries = 0; tries < 40; tries++) {
      let a, b;
      if (op === 'add' || op === 'sub') {
        a = nz(max) * sign();
        b = nz(max);
        // 0,28 au tirage : les questions sans négatif sont refusées, ce qui remonte la part vers 1/3.
        if (op === 'sub') b = random() < 0.28 ? -b : b;
        else b *= sign();
      } else if (op === 'mul') {
        a = nz(max) * sign();
        b = nz(max) * sign();
      } else {
        const q = nz(max) * sign();
        b = nz(max) * sign();
        a = q * b;
      }
      const c = calc(op, a, b);
      if (a < 0 || b < 0 || c < 0) return { op: op, a: z(a), b: z(b), c: z(c) };
    }
    const b = nz(max), a = op === 'div' ? -nz(max) * b : -nz(max);
    return { op: op, a: a, b: b, c: z(calc(op, a, b)) };
  }
  function makeCalc(op, max, kind, hide) {
    const q = makeFact(op, max);
    q.type = 'calc';
    if (hide) q.hide = hide;
    else if (kind === 'missing') q.hide = random() < 0.5 ? 'a' : 'b';
    else q.hide = 'c';
    q.answer = q[q.hide];
    return q;
  }

  /* ---------- Trouve x ---------- */
  // Une étape : x + b = c, b + x = c, ax = c. Deux étapes : ax + b = c. Solution entière de −10 à 10, jamais 0.
  // Toujours au moins un négatif (coefficient, terme, résultat ou solution) : on pratique les nombres entiers.
  function makeEq(level) {
    let q = makeEqOnce(level);
    for (let t = 0; t < 40 && !(q.a < 0 || q.b < 0 || q.c < 0 || q.x < 0); t++) q = makeEqOnce(level);
    return q;
  }
  function makeEqOnce(level) {
    const x = nz(10) * sign();
    if (level === 2) {
      const a = between(2, 9) * sign();
      const b = nz(12) * sign();
      return { type: 'eq', form: 'ax+b', a: a, b: b, c: a * x + b, x: x, hide: 'x', answer: x };
    }
    const f = rnd(3);
    if (f === 2) {
      const a = between(2, 9) * sign();
      return { type: 'eq', form: 'ax', a: a, b: 0, c: a * x, x: x, hide: 'x', answer: x };
    }
    const b = nz(12) * sign();
    return { type: 'eq', form: f === 0 ? 'x+b' : 'b+x', a: 1, b: b, c: x + b, x: x, hide: 'x', answer: x };
  }

  /* ---------- Feuille ---------- */
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }
  function spread(list, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[i % list.length]);
    return shuffle(out);
  }
  const keyOf = (q) => (q.type === 'eq' ? 'eq:' + q.form + ':' + q.a + ':' + q.b + ':' + q.c : q.op + ':' + q.a + ':' + q.b + ':' + q.hide);

  function makeOne(mod, op, kind) {
    return mod.eq ? makeEq(mod.eq) : makeCalc(op, mod.max, kind);
  }
  function buildSheet(moduleKey, typeKey, count) {
    const mod = MODULES[moduleKey] || MODULES.as;
    const n = count || mod.count;
    const ops = mod.eq ? new Array(n).fill(null) : spread(mod.ops, n);
    const kinds = spread(TYPES[typeKey] || TYPES.mix, n);
    const out = [];
    for (let i = 0; i < n; i++) {
      let q = makeOne(mod, ops[i], kinds[i]);
      for (let t = 0; t < 10 && out.some((p) => keyOf(p) === keyOf(q)); t++) q = makeOne(mod, ops[i], kinds[i]);
      out.push(q);
    }
    return out;
  }

  // Question jumelle : même structure (opération, case cachée, signes), d'autres nombres.
  function twin(q, moduleKey) {
    const mod = MODULES[moduleKey] || MODULES.as;
    const sig = (n) => Math.sign(n);
    for (let t = 0; t < 200; t++) {
      let p;
      if (q.type === 'eq') {
        p = makeEq(q.form === 'ax+b' ? 2 : 1);
        if (p.form !== q.form || sig(p.a) !== sig(q.a) || sig(p.b) !== sig(q.b) || sig(p.x) !== sig(q.x)) continue;
      } else {
        p = makeCalc(q.op, mod.max || 10, '', q.hide);
        if (sig(p.a) !== sig(q.a) || sig(p.b) !== sig(q.b)) continue;
      }
      if (keyOf(p) !== keyOf(q)) return p;
    }
    if (q.type === 'eq') { let p = makeEq(q.form === 'ax+b' ? 2 : 1); for (let t = 0; t < 30 && p.form !== q.form; t++) p = makeEq(q.form === 'ax+b' ? 2 : 1); return p; }
    return makeCalc(q.op, mod.max || 10, '', q.hide);
  }

  /* ---------- Écriture ---------- */
  const neg = (n) => MINUS + (-n);
  function numText(n, afterOp) {
    if (n >= 0) return String(n);
    return afterOp ? '(' + neg(n) + ')' : neg(n);
  }
  function coefX(a) {
    if (a === 1) return 'x';
    if (a === -1) return MINUS + 'x';
    return (a < 0 ? neg(a) : String(a)) + 'x';
  }
  function signed(b) { return b < 0 ? ' ' + MINUS + ' ' + (-b) : ' + ' + b; }
  // Côté gauche d'une équation : « 2x − 7 », « −5 + x », « x + 9 », « −3x ».
  function eqLeft(q) {
    if (q.form === 'ax') return coefX(q.a);
    if (q.form === 'b+x') return numText(q.b, false) + ' + x';
    if (q.form === 'x+b') return 'x' + signed(q.b);
    return coefX(q.a) + signed(q.b);
  }
  // Morceaux de la question : { t } texte, { op } signe, { box } case à remplir.
  function parts(q) {
    if (q.type === 'eq') return [{ t: eqLeft(q) }, { op: '=' }, { t: numText(q.c, false) }];
    const p = (key, afterOp) => (key === q.hide ? { box: true, key: key } : { t: numText(q[key], afterOp), key: key });
    return [p('a', false), { op: SYM[q.op] }, p('b', true), { op: '=' }, p('c', false)];
  }
  function text(q, fill) {
    const box = fill === undefined ? '▢' : fill;
    const main = parts(q).map((x) => (x.op ? x.op : (x.box ? box : x.t))).join(' ');
    return q.type === 'eq' ? main + ' ; x = ' + box : main;
  }
  // Pour la lecture vocale : « 5 moins négatif 3 égale combien ».
  function spoken(q) {
    const words = { add: 'plus', sub: 'moins', mul: 'fois', div: 'divisé par' };
    const n = (v) => (v < 0 ? 'négatif ' + (-v) : String(v));
    if (q.type === 'eq') {
      const ax = q.a === 1 ? 'x' : (q.a === -1 ? 'négatif x' : n(q.a) + ' x');
      let left;
      if (q.form === 'ax') left = ax;
      else if (q.form === 'b+x') left = n(q.b) + ' plus x';
      else left = ax + (q.b < 0 ? ' moins ' + (-q.b) : ' plus ' + q.b);
      return left + ' égale ' + n(q.c) + '. Trouve x.';
    }
    const w = (key) => (key === q.hide ? 'combien' : n(q[key]));
    return w('a') + ' ' + words[q.op] + ' ' + w('b') + ' égale ' + w('c');
  }

  /* ---------- Saisie et correction ---------- */
  // « -7 », « −7 », « +8 », « 8 » ; un « − » seul n'est pas une réponse.
  function parse(v) {
    const s = String(v === undefined || v === null ? '' : v).trim().replace(/[−‒–—]/g, '-').replace(/^\+/, '');
    if (!/^-?\d{1,3}$/.test(s)) return null;
    return z(Number(s));
  }
  function check(q, v) {
    const n = parse(v);
    if (n === null) return 'blank';
    return n === q.answer ? 'right' : 'wrong';
  }
  // Erreurs classiques : pour dire quoi travailler.
  // 'subneg' : 5 − (−3) = 2 · 'apart' : −4 − 6 = 10 · 'mixsign' : −7 + 4 = −11 (signes différents additionnés)
  // 'sign' : bonne valeur, mauvais signe · 'calc' : le reste.
  function errorKind(q, v) {
    const n = parse(v);
    if (n === null || n === q.answer) return null;
    if (q.type === 'calc' && q.hide === 'c') {
      if (q.op === 'sub' && q.b < 0 && n === q.a + q.b) return 'subneg';
      if (q.op === 'sub' && q.a < 0 && q.b > 0 && n === -q.answer) return 'apart';
      if (q.op === 'add' && Math.sign(q.a) * Math.sign(q.b) < 0 && Math.abs(n) === Math.abs(q.a) + Math.abs(q.b)) return 'mixsign';
    }
    if (n === -q.answer) return 'sign';
    return 'calc';
  }
  // Conseil court (tutoiement, sans « Oups! »), avec les nombres de la question.
  // Espaces insécables avant le deux-points et dans les guillemets (typographie du Québec).
  const NB = '\u00a0';
  function tip(q, kind) {
    if (kind === 'subneg') return 'Soustraire ' + numText(q.b, false) + ', c’est additionner ' + (-q.b) + NB + ': ' + numText(q.a, false) + ' + ' + (-q.b) + ' = ' + numText(q.c, false) + '.';
    if (kind === 'apart') return 'Tu pars de ' + numText(q.a, false) + ' et tu recules encore de ' + q.b + NB + ': tu arrives à ' + numText(q.c, false) + '.';
    if (kind === 'mixsign') {
      const big = Math.max(Math.abs(q.a), Math.abs(q.b)), small = Math.min(Math.abs(q.a), Math.abs(q.b));
      const far = Math.abs(q.a) >= Math.abs(q.b) ? q.a : q.b;
      if (big === small) return 'Un positif et un négatif à la même distance de 0 s’annulent' + NB + ': la réponse est 0.';
      return 'Un positif et un négatif' + NB + ': fais ' + big + ' ' + MINUS + ' ' + small + ' = ' + (big - small) + ', puis garde le signe du nombre le plus loin de 0, ici ' + numText(far, false) + '.';
    }
    if (kind === 'sign') {
      const head = 'Bon calcul, mauvais signe' + NB + ': ';
      if (q.type === 'eq') return head + 'remplace x par ta réponse dans l’équation pour vérifier.';
      if (q.op === 'mul' || q.op === 'div') {
        if (q.hide !== 'c') {
          // Terme manquant : il est positif si le résultat et l'autre nombre ont le même signe.
          const other = q.hide === 'a' ? q.b : q.a;
          return head + (Math.sign(other) === Math.sign(q.c)
            ? 'le résultat et l’autre nombre ont le même signe, donc le nombre manquant est positif.'
            : 'le résultat et l’autre nombre n’ont pas le même signe, donc le nombre manquant est négatif.');
        }
        return head + (q.a < 0 && q.b < 0 ? 'négatif par négatif donne positif.' : 'un seul négatif, la réponse est négative.');
      }
      if (q.hide !== 'c') return head + 'mets ta réponse dans la case et refais le calcul pour vérifier.';
      if (q.op === 'sub') return head + numText(q.a, false) + ' ' + MINUS + ' ' + numText(q.b, true) + ', c’est ' + numText(q.a, false) + ' + ' + numText(-q.b, true) + '. Le nombre le plus loin de 0 donne son signe à la réponse.';
      return head + 'le nombre le plus loin de 0 donne son signe à la réponse.';
    }
    return '';
  }
  const KIND_LABEL = { subneg: 'soustraire un négatif', apart: 'un négatif moins un positif', mixsign: 'additionner un positif et un négatif', sign: 'le signe de la réponse', calc: 'le calcul' };

  const api = { MINUS, SYM, MODULES, TYPES, setSeed, buildSheet, twin, parts, text, spoken, numText, parse, check, errorKind, tip, KIND_LABEL, calc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Moteur = api;
})(typeof window !== 'undefined' ? window : this);
