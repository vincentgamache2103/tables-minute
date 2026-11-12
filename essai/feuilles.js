/* Tables minute · « La feuille de vos élèves » : l'éditeur des feuilles de la classe.
   Sans dépendance. Aucun appel au serveur, aucun localStorage, aucun innerHTML.
   window.SheetsEditor.create(opts) → { setSheets, setRoster, open, summary, isDirty }
   opts.onOpen (facultatif) : appelé par le bouton de la carte à la place de open(), pour reprendre un brouillon. */
(function () {
  'use strict';

  var NB = ' ';
  var OP_KEYS = ['mul', 'div', 'add', 'sub'];
  var OPS = {
    mul: { sym: '×', name: 'Multiplication' },
    div: { sym: '÷', name: 'Division' },
    add: { sym: '+', name: 'Addition' },
    sub: { sym: '−', name: 'Soustraction' }
  };
  var KINDS = [['product', 'Trouver la réponse'], ['missing', 'Trouver le nombre manquant'], ['mix', 'Les deux, mélangées']];
  var KIND_NAME = { product: 'Trouver la réponse', missing: 'Trouver le nombre manquant', mix: 'Les deux, mélangées' };
  var MINUTES = [2, 3, 4];
  var COUNTS = [12, 24, 36];
  var TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  var MAX_RULES = 12;
  var LETTERS = 'ABCDEFGHIJKL';
  var ID_RE = /^[a-z0-9]{1,8}$/;
  var DEFAULT_SHEET = { o: ['mul'], t: [2, 3, 4, 5], st: [], m: 2, k: 'mix', q: 24 };

  /* ---------- Petits outils ---------- */
  var arr = function (v) { return Array.isArray(v) ? v : []; };
  var has = function (list, v) { return list.indexOf(v) >= 0; };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var plural = function (n, one, many) { return n + NB + (n > 1 ? many : one); };
  var isMD = function (k) { return k === 'mul' || k === 'div'; };
  function listFr(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1];
  }
  function tablesWords(list) {
    var t = list.slice().sort(function (a, b) { return a - b; });
    if (!t.length) return '';
    var run = t.length > 2;
    for (var i = 1; i < t.length; i++) if (t[i] !== t[i - 1] + 1) run = false;
    return (t.length === 1 ? 'table de ' : 'tables ') + (run ? t[0] + ' à ' + t[t.length - 1] : listFr(t.map(String)));
  }
  // Un élément du DOM, sans innerHTML : le texte passe toujours par textContent.
  function h(tag, p, kids) {
    var el = document.createElement(tag);
    if (p) Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function create(opts) {
    opts = opts || {};
    var root = opts.root;
    var card = opts.card || null;
    if (!root) throw new Error('SheetsEditor : opts.root manque.');
    var roster = arr(opts.roster).map(function (n) { return typeof n === 'string' ? n.trim() : ''; });
    var strats = arr(opts.strats).filter(function (s) { return s && typeof s.key === 'string'; });
    var SKEYS = strats.map(function (s) { return s.key; });
    var SHORT = {};
    strats.forEach(function (s) { SHORT[s.key] = s.short || s.name || s.key; });
    var uid = 'sh' + Math.random().toString(36).slice(2, 7);
    var $ = function (name) { return root.querySelector('[data-sh="' + name + '"]'); };

    var el = {
      board: $('board'), toast: $('toast'), status: $('status'), undo: $('undo'),
      bar: $('bar'), selN: $('sel-n'), placeWrap: $('place-wrap'), place: $('place'),
      save: $('save'), reset: $('reset'), dirty: $('dirty'), saveStatus: $('save-status'),
      backStatus: $('back-status'), title: root.querySelector('h2')
    };
    // Une région aria-live toujours présente annonce les déplacements.
    var sr = $('sr');
    if (!sr) { sr = h('p', { class: 'sh-sr', 'data-sh': 'sr', role: 'status', 'aria-live': 'polite' }); root.appendChild(sr); }

    /* ---------- Les feuilles : entrée, sortie ---------- */
    function inSheet(s) {
      s = s && typeof s === 'object' ? s : DEFAULT_SHEET;
      var o = OP_KEYS.filter(function (k) { return has(arr(s.o), k); });
      var st = o.every(isMD) ? SKEYS.filter(function (k) { return has(arr(s.st), k); }) : [];
      var t = TABLES.filter(function (n) { return has(arr(s.t).map(Number), n); });
      return {
        o: o, t: st.length ? [] : t, st: st, mode: st.length ? 'st' : 't',
        m: has(MINUTES, Number(s.m)) ? Number(s.m) : 2,
        k: KIND_NAME[s.k] ? s.k : 'mix',
        q: has(COUNTS, Number(s.q)) ? Number(s.q) : 24
      };
    }
    function outSheet(s) {
      var st = s.mode === 'st' && s.o.every(isMD) ? s.st.slice() : [];
      return { o: s.o.slice(), t: st.length || s.mode === 'st' ? [] : s.t.slice(), st: st, m: s.m, k: s.k, q: s.q };
    }
    var okPlace = function (i) { return Number.isInteger(i) && i >= 0 && i < roster.length && !!roster[i]; };
    function newId(d) {
      var id;
      do { id = Math.random().toString(36).slice(2, 8) || 'f'; } while (d.rules.some(function (r) { return r.id === id; }));
      return id;
    }
    function importSheets(x) {
      x = x && typeof x === 'object' ? x : {};
      var d = { all: x.all ? inSheet(x.all) : null, rules: [], by: {} };
      var map = {};
      arr(x.rules).slice(0, MAX_RULES).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var id = typeof r.id === 'string' && ID_RE.test(r.id) && !map[r.id] ? r.id : newId(d);
        map[r.id] = id;
        d.rules.push({ id: id, n: typeof r.n === 'string' ? r.n.slice(0, 40) : '', s: inSheet(r.s) });
      });
      var by = x.by && typeof x.by === 'object' ? x.by : {};
      Object.keys(by).forEach(function (k) {
        var i = Number(k);
        var id = map[by[k]];
        if (okPlace(i) && id) d.by[i] = id;
      });
      return d;
    }
    function exportSheets(d) {
      var by = {};
      Object.keys(d.by).forEach(function (k) {
        var i = Number(k);
        if (okPlace(i) && d.rules.some(function (r) { return r.id === d.by[k]; })) by[String(i)] = d.by[k];
      });
      return {
        all: d.all ? outSheet(d.all) : null,
        rules: d.rules.map(function (r) { return { id: r.id, n: r.n.trim(), s: outSheet(r.s) }; }),
        by: by
      };
    }
    var keyOf = function (d) { return JSON.stringify(exportSheets(d)); };

    function summary(sheet) {
      var s = sheet && typeof sheet === 'object' && sheet.mode ? outSheet(sheet) : outSheet(inSheet(sheet));
      if (!s.o.length) return 'Feuille sans opération';
      var ops = s.o.map(function (k) { return OPS[k].sym; }).join(' ');
      var what = s.st.length ? s.st.map(function (k) { return SHORT[k]; }).join(', ') : tablesWords(s.t);
      return ops + (what ? ' ' + what : '') + ' · ' + s.m + NB + 'min';
    }
    var detail = function (s) { return KIND_NAME[s.k] + ' · ' + s.q + NB + 'questions'; };
    function problem(s) {
      if (!s.o.length) return 'choisissez au moins une opération.';
      if (s.mode === 'st' && s.o.every(isMD)) return s.st.length ? '' : 'choisissez au moins une stratégie.';
      return s.t.length ? '' : 'choisissez au moins une table.';
    }

    /* ---------- État ---------- */
    var saved = importSheets(null);
    var draft = clone(saved);
    var sel = [];                 // places sélectionnées, dans l'ordre du toucher
    var openId = null;            // 'all' ou l'id de la feuille dont le réglage est ouvert
    var menu = null;              // { type: 'place' } ou { type: 'more', id }
    var confirmDel = null;        // id de la feuille à supprimer
    var undoSnap = null;          // { d, open } : une seule étape
    var msg = { text: '', err: false };
    var saveMsg = { text: '', err: false };
    var keepAll = null;           // la feuille de la classe, gardée si le prof repasse à « Les élèves choisissent »
    var rove = {};                // dernier élève touché par groupe (tabindex mobile)
    var lastKid = -1;
    var pendingFocus = null;
    var focusMenu = false;
    var busy = false;
    var backArmed = false;

    var isSel = function (i) { return sel.indexOf(i) >= 0; };
    var placeOf = function (i) { return draft.by[i] || 'all'; };
    var ruleById = function (id) { return draft.rules.filter(function (r) { return r.id === id; })[0] || null; };
    var places = function () { var out = []; roster.forEach(function (n, i) { if (n) out.push(i); }); return out; };
    var members = function (dest) { return places().filter(function (i) { return placeOf(i) === dest; }); };
    var allTitle = function () { return draft.rules.length ? 'Le reste de la classe' : 'Toute la classe'; };
    var ruleName = function (r) { return r.n.trim() || summary(r.s); };
    var destName = function (dest) { var r = ruleById(dest); return r ? ruleName(r) : allTitle(); };

    /* ---------- Changements ---------- */
    function snapshot(f) { undoSnap = { d: clone(draft), open: openId, f: f || null }; }
    function changed() {
      backArmed = false;
      if (!saveMsg.err) saveMsg = { text: '', err: false };
      if (el.backStatus) el.backStatus.textContent = '';
      if (typeof opts.onChange === 'function') { try { opts.onChange(exportSheets(draft)); } catch (e) { /* rien */ } }
    }
    function tell(text, withUndo, err) {
      msg = { text: text, err: !!err };
      if (!withUndo) undoSnap = null;
      sr.textContent = '';
      // Un court délai : le lecteur d'écran annonce même un texte identique au précédent.
      setTimeout(function () { sr.textContent = text; }, 30);
    }

    function place(ids, dest) {
      var real = ids.filter(okPlace);
      if (dest === 'new') {
        if (draft.rules.length >= MAX_RULES) { tell('Vous avez déjà 12 feuilles, le maximum.', false, true); render(); return; }
      }
      var moving = real.filter(function (i) { return placeOf(i) !== dest; });
      if (!moving.length) {
        tell(real.length > 1 ? 'Ces élèves sont déjà dans « ' + destName(dest) + ' ».' : roster[real[0]] + ' est déjà dans « ' + destName(dest) + ' ».', false);
        sel = [];
        render();
        return;
      }
      snapshot('kid-' + moving[0]);
      var fresh = false;
      if (dest === 'new') {
        var id = newId(draft);
        draft.rules.push({ id: id, n: '', s: draft.all ? clone(draft.all) : inSheet(DEFAULT_SHEET) });
        dest = id;
        openId = id;
        fresh = true;
      }
      moving.forEach(function (i) {
        if (dest === 'all') delete draft.by[i]; else draft.by[i] = dest;
      });
      sel = sel.filter(function (i) { return moving.indexOf(i) < 0 && real.indexOf(i) < 0; });
      rove[dest] = moving[0];
      var where = fresh ? 'une nouvelle feuille, « ' + destName(dest) + ' ». Réglez-la ci-dessous' : '« ' + destName(dest) + ' »';
      tell((moving.length > 1 ? moving.length + NB + 'élèves placés dans ' : roster[moving[0]] + ' est maintenant dans ') + where + '.', true);
      changed();
      render();
    }
    function undo() {
      if (!undoSnap) return;
      draft = undoSnap.d;
      openId = undoSnap.open;
      pendingFocus = undoSnap.f;
      undoSnap = null;
      confirmDel = null;
      sel = sel.filter(okPlace);
      tell('C’est annulé.', false);
      changed();
      render();
    }

    /* ---------- Rendu ---------- */
    function activeKey() {
      var a = document.activeElement;
      return a && root.contains(a) && a.getAttribute('data-k') ? a.getAttribute('data-k') : null;
    }
    function focusKey(k) {
      if (!k) return false;
      var t = root.querySelector('[data-k="' + k + '"]');
      if (!t || !t.getClientRects().length) return false;
      try { t.focus({ preventScroll: false }); } catch (e) { t.focus(); }
      return true;
    }

    function choice(type, name, f, id, value, checked, kids, cls, label) {
      return h('label', { class: 'sh-choice ' + cls }, [
        h('input', { type: type, name: name, 'data-f': f, 'data-id': id, value: value, checked: checked, 'data-k': 'f-' + id + '-' + f + '-' + value, 'aria-label': label || null }),
        h('span', null, kids)
      ]);
    }

    function form(s, id, rule) {
      var pre = uid + '-f-' + id;
      var onlyMD = s.o.length > 0 && s.o.every(isMD);
      var mode = onlyMD && s.mode === 'st' ? 'st' : 't';
      var bad = problem(s);
      var fields = [];
      if (rule) {
        fields.push(h('div', { class: 'sh-field' }, [
          h('label', { class: 'sh-label', for: pre + '-n' }, ['Nom ', h('span', { text: '(pour vous seulement)' })]),
          h('input', { class: 'input', id: pre + '-n', type: 'text', maxlength: 40, autocomplete: 'off', spellcheck: 'false', 'data-f': 'n', 'data-id': id, 'data-k': 'f-' + id + '-n', value: rule.n, placeholder: summary(s), 'aria-describedby': pre + '-nh' }),
          h('p', { class: 'hint', id: pre + '-nh', text: 'Vide, la feuille prend un nom tiré de son contenu. Vos élèves ne voient jamais ce nom.' })
        ]));
      }
      fields.push(h('div', { class: 'sh-field' }, [
        h('p', { class: 'sh-label', id: pre + '-o', text: 'Opérations' }),
        h('div', { class: 'sh-ops', role: 'group', 'aria-labelledby': pre + '-o' }, OP_KEYS.map(function (k) {
          return choice('checkbox', pre + '-o', 'o', id, k, has(s.o, k), [h('b', { class: 'sh-sym', 'aria-hidden': 'true', text: OPS[k].sym }), OPS[k].name], 'sh-op');
        }))
      ]));
      var what = [];
      if (onlyMD && SKEYS.length) {
        what.push(h('div', { class: 'sh-opts', role: 'radiogroup', 'aria-labelledby': pre + '-w' }, [
          choice('radio', pre + '-mode', 'mode', id, 't', mode === 't', ['Les tables'], 'sh-opt'),
          choice('radio', pre + '-mode', 'mode', id, 'st', mode === 'st', ['Les stratégies'], 'sh-opt')
        ]));
      }
      if (mode === 't') {
        what.push(h('div', { class: 'sh-bubbles', role: 'group', 'aria-labelledby': pre + '-w' }, TABLES.map(function (n) {
          return choice('checkbox', pre + '-t', 't', id, n, has(s.t, n), [String(n)], 'sh-bub', 'Table de ' + n);
        })));
      } else {
        what.push(h('div', { class: 'sh-strats', role: 'group', 'aria-labelledby': pre + '-w' }, strats.map(function (st) {
          return choice('checkbox', pre + '-st', 'st', id, st.key, has(s.st, st.key), [st.name], 'sh-opt');
        })));
      }
      what.push(h('p', { class: 'hint' + (bad ? ' sh-warn' : ''), text: bad ? 'Pas encore complète : ' + bad
        : !onlyMD && SKEYS.length ? 'Les stratégies sont offertes avec × et ÷ seulement.'
          : mode === 'st' ? 'Une ou plusieurs stratégies.' : 'Une ou plusieurs tables.' }));
      fields.push(h('div', { class: 'sh-field' }, [h('p', { class: 'sh-label', id: pre + '-w', text: onlyMD && SKEYS.length ? 'Quoi pratiquer?' : 'Tables' })].concat(what)));
      fields.push(h('div', { class: 'sh-field sh-field--row' }, [
        h('div', { class: 'sh-field' }, [
          h('p', { class: 'sh-label', id: pre + '-m', text: 'Durée' }),
          h('div', { class: 'sh-opts', role: 'radiogroup', 'aria-labelledby': pre + '-m' }, MINUTES.map(function (m) {
            return choice('radio', pre + '-m', 'm', id, m, s.m === m, [m + NB + 'min'], 'sh-opt');
          }))
        ]),
        h('div', { class: 'sh-field' }, [
          h('p', { class: 'sh-label', id: pre + '-q', text: 'Questions' }),
          h('div', { class: 'sh-opts', role: 'radiogroup', 'aria-labelledby': pre + '-q' }, COUNTS.map(function (q) {
            return choice('radio', pre + '-q', 'q', id, q, s.q === q, [String(q)], 'sh-opt');
          }))
        ])
      ]));
      fields.push(h('div', { class: 'sh-field' }, [
        h('p', { class: 'sh-label', id: pre + '-k', text: 'Sorte de questions' }),
        h('div', { class: 'sh-opts', role: 'radiogroup', 'aria-labelledby': pre + '-k' }, KINDS.map(function (k) {
          return choice('radio', pre + '-k', 'k', id, k[0], s.k === k[0], [k[1]], 'sh-opt');
        }))
      ]));
      fields.push(h('div', { class: 'row' }, [
        h('button', { type: 'button', class: 'btn', 'data-act': 'done', 'data-id': id, 'data-k': 'done-' + id, text: 'Terminé' })
      ]));
      return h('div', { class: 'sh-form', role: 'group', 'aria-label': 'Réglage de la feuille' }, fields);
    }

    function kids(dest, labelId) {
      var list = members(dest);
      if (!list.length) {
        return h('p', { class: 'sh-drop-hint', text: dest === 'all'
          ? 'Tous vos élèves ont une feuille à eux.'
          : 'Aucun élève pour l’instant. Glissez des prénoms ici, ou touchez-les puis « Placer dans… ».' });
      }
      var tab = list.indexOf(rove[dest]) >= 0 ? rove[dest] : list[0];
      return h('div', { class: 'sh-kids', role: 'group', 'aria-labelledby': labelId, 'data-group': dest }, list.map(function (i) {
        return h('button', {
          type: 'button', class: 'chip sh-kid', 'data-kid': i, 'data-k': 'kid-' + i,
          'aria-pressed': String(isSel(i)), tabindex: i === tab ? '0' : '-1', text: roster[i]
        });
      }));
    }

    function menuEl(items, cls, label) {
      return h('div', { class: 'sh-menu ' + cls, role: 'menu', 'aria-label': label }, items.map(function (it) {
        return h('button', {
          type: 'button', role: 'menuitem', class: 'sh-mi' + (it.danger ? ' sh-mi--danger' : ''), tabindex: '-1',
          'data-act': it.act, 'data-id': it.id || null, 'aria-disabled': it.off ? 'true' : null,
          'data-k': 'mi-' + it.act + '-' + (it.id || '')
        }, [
          it.letter ? h('span', { class: 'sh-letter sh-letter--sm', 'aria-hidden': 'true', text: it.letter }) : null,
          h('span', { class: 'sh-mi-text' }, [it.text, it.sub ? h('small', { text: it.sub }) : null])
        ]);
      }));
    }

    function zoneAll() {
      var tid = uid + '-t-all';
      var n = members('all').length;
      var open = openId === 'all';
      var pick = !!draft.all;
      var body = [
        h('div', { class: 'sh-zone-head' }, [
          h('h3', { id: tid, text: allTitle() }),
          h('span', { class: 'sh-count', text: plural(n, 'élève', 'élèves') })
        ]),
        h('div', { class: 'row sh-mode', role: 'group', 'aria-labelledby': tid }, [
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!pick), 'data-act': 'mode-choose', 'data-k': 'mode-choose', text: 'Les élèves choisissent' }),
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pick), 'data-act': 'mode-pick', 'data-k': 'mode-pick', text: 'Je choisis la feuille' })
        ])
      ];
      if (pick) {
        var bad = problem(draft.all);
        body.push(h('div', { class: 'sh-line' }, [
          h('p', { class: 'sh-what' }, [h('b', { text: summary(draft.all) }), h('span', { text: detail(draft.all) })]),
          open ? null : h('button', { type: 'button', class: 'btn sh-btn', 'data-act': 'edit', 'data-id': 'all', 'data-k': 'edit-all', 'aria-label': 'Modifier la feuille de ' + allTitle().toLowerCase(), text: 'Modifier' })
        ]));
        if (bad && !open) body.push(h('p', { class: 'hint sh-warn', text: 'Pas encore complète : ' + bad }));
        if (open) body.push(form(draft.all, 'all', null));
      } else {
        body.push(h('p', { class: 'hint', text: draft.rules.length
          ? 'Ces élèves choisissent leur feuille au début, comme sur le site.'
          : 'Vos élèves choisissent leur feuille au début, comme sur le site.' }));
      }
      body.push(kids('all', tid));
      return h('section', { class: 'card card--quiet sh-card sh-card--all' + (open ? ' is-open' : ''), 'data-drop': 'all', 'aria-labelledby': tid }, body);
    }

    function ruleCard(r, idx) {
      var id = r.id;
      var tid = uid + '-t-' + id;
      var open = openId === id;
      var name = ruleName(r);
      var auto = !r.n.trim();
      var n = members(id).length;
      var bad = problem(r.s);
      var moreOpen = menu && menu.type === 'more' && menu.id === id;
      var body = [
        h('div', { class: 'sh-card-head' }, [
          h('span', { class: 'sh-letter', 'aria-hidden': 'true', text: LETTERS[idx] }),
          h('div', { class: 'sh-card-title' }, [
            h('h4', { id: tid, class: 'sh-name', text: name }),
            h('p', { class: 'sh-meta', text: (auto ? '' : summary(r.s) + ' · ') + detail(r.s) }),
            h('span', { class: 'sh-count sh-count--pill', text: plural(n, 'élève', 'élèves') })
          ]),
          h('div', { class: 'sh-actions' }, [
            open ? null : h('button', { type: 'button', class: 'btn sh-btn', 'data-act': 'edit', 'data-id': id, 'data-k': 'edit-' + id, 'aria-label': 'Modifier la feuille ' + LETTERS[idx], text: 'Modifier' }),
            h('div', { class: 'sh-menu-wrap' }, [
              h('button', { type: 'button', class: 'sh-more', 'data-act': 'more', 'data-id': id, 'data-k': 'more-' + id, 'aria-haspopup': 'menu', 'aria-expanded': String(!!moreOpen), 'aria-label': 'Autres actions pour la feuille ' + LETTERS[idx], text: '⋯' }),
              moreOpen ? menuEl([
                { act: 'dup', id: id, text: 'Dupliquer', off: draft.rules.length >= MAX_RULES, sub: draft.rules.length >= MAX_RULES ? '12 feuilles au plus' : '' },
                { act: 'del', id: id, text: 'Supprimer', danger: true }
              ], 'sh-menu--down', 'Feuille ' + LETTERS[idx]) : null
            ])
          ])
        ])
      ];
      if (bad && !open) body.push(h('p', { class: 'hint sh-warn', text: 'Pas encore complète : ' + bad }));
      if (confirmDel === id) {
        var cid = uid + '-c-' + id;
        var who = n === 0 ? 'Elle n’a aucun élève.'
          : (n > 1 ? 'Ses ' + n + NB + 'élèves ' : 'Son élève ') +
            (draft.all ? (n > 1 ? 'feront' : 'fera') + ' la feuille de toute la classe.' : (n > 1 ? 'choisiront' : 'choisira') + ' sa feuille, comme le reste de la classe.');
        body.push(h('div', { class: 'sh-confirm', role: 'group', 'aria-labelledby': cid }, [
          h('p', { id: cid, text: 'Supprimer cette feuille? ' + who }),
          h('div', { class: 'row' }, [
            h('button', { type: 'button', class: 'btn sh-btn btn--danger', 'data-act': 'del-yes', 'data-id': id, 'data-k': 'del-yes-' + id, text: 'Supprimer' }),
            h('button', { type: 'button', class: 'btn btn--link', 'data-act': 'del-no', 'data-id': id, 'data-k': 'del-no-' + id, text: 'Garder la feuille' })
          ])
        ]));
      }
      if (open) body.push(form(r.s, id, r));
      body.push(kids(id, tid));
      return h('section', { class: 'card card--quiet sh-card' + (open ? ' is-open' : ''), 'data-drop': id, 'aria-labelledby': tid }, body);
    }

    function zoneRules() {
      var tid = uid + '-t-rules';
      var full = draft.rules.length >= MAX_RULES;
      var cards = draft.rules.map(ruleCard);
      return h('section', { class: 'sh-zone', 'aria-labelledby': tid }, [
        h('div', { class: 'sh-zone-head' }, [
          h('h3', { id: tid, text: 'Feuilles pour certains élèves' }),
          h('span', { class: 'sh-count', text: draft.rules.length ? plural(draft.rules.length, 'feuille', 'feuilles') + ' sur 12' : '12 au plus' })
        ]),
        draft.rules.length ? null : h('p', { class: 'hint', text: 'Une feuille plus facile, ou plus difficile, pour quelques élèves? Ajoutez-la ici.' })
      ].concat(cards, [
        h('button', { type: 'button', class: 'sh-add', 'data-act': 'add', 'data-drop': full ? null : 'new', 'data-k': 'add', disabled: full }, [
          h('span', { class: 'sh-add-plus', 'aria-hidden': 'true', text: '+' }),
          h('span', { class: 'sh-add-text' }, [
            h('b', { text: 'Ajouter une feuille pour certains élèves' }),
            h('small', { text: full ? 'Vous avez 12 feuilles, le maximum.' : 'Ou déposez des prénoms ici : ils auront leur propre feuille.' })
          ])
        ])
      ]));
    }

    function renderDock() {
      var n = sel.length;
      el.toast.hidden = !msg.text;
      el.status.textContent = msg.text;
      el.status.classList.toggle('is-err', msg.err);
      el.undo.hidden = !undoSnap;
      el.bar.hidden = !n;
      el.selN.textContent = n > 1 ? n + NB + 'sélectionnés' : n + NB + 'sélectionné';
      var open = !!(menu && menu.type === 'place' && n);
      el.place.setAttribute('aria-expanded', String(open));
      var old = el.placeWrap.querySelector('.sh-menu');
      if (old) old.remove();
      if (open) {
        var here = sel.map(placeOf);
        var all = function (dest) { return here.every(function (p) { return p === dest; }); };
        var items = [{ act: 'to', id: 'all', text: allTitle(), sub: all('all') ? 'Ils y sont déjà' : draft.all ? summary(draft.all) : 'Les élèves choisissent', off: all('all') }];
        draft.rules.forEach(function (r, i) { items.push({ act: 'to', id: r.id, letter: LETTERS[i], text: ruleName(r), sub: all(r.id) ? 'Ils y sont déjà' : plural(members(r.id).length, 'élève', 'élèves'), off: all(r.id) }); });
        var full = draft.rules.length >= MAX_RULES;
        items.push({ act: 'to', id: 'new', text: 'Nouvelle feuille avec ces élèves', sub: full ? '12 feuilles au plus' : '', off: full });
        el.placeWrap.appendChild(menuEl(items, 'sh-menu--up', 'Placer dans'));
      }
    }
    function renderFoot() {
      var dirty = isDirty();
      el.dirty.hidden = !dirty;
      el.reset.disabled = !dirty || busy;
      el.save.disabled = busy;
      el.saveStatus.textContent = saveMsg.text;
      el.saveStatus.classList.toggle('is-err', saveMsg.err);
    }
    function render() {
      var k = pendingFocus || activeKey();
      pendingFocus = null;
      el.board.textContent = '';
      el.board.appendChild(zoneAll());
      el.board.appendChild(zoneRules());
      renderDock();
      renderFoot();
      if (focusMenu) {
        focusMenu = false;
        var first = root.querySelector('.sh-menu [role="menuitem"]:not([aria-disabled="true"])') || root.querySelector('.sh-menu [role="menuitem"]');
        if (first) { first.focus(); return; }
      }
      if (k && !focusKey(k) && el.title) el.title.focus();
    }

    /* ---------- La carte repliée (ce qui est enregistré) ---------- */
    function renderCard() {
      if (!card) return;
      var sum = card.querySelector('[data-sh="sum"]');
      var btn = card.querySelector('[data-sh="open"]');
      var d = saved;
      var count = function (id) { return places().filter(function (i) { return (d.by[i] || 'all') === id; }).length; };
      var lines = [];
      var name = function (r) { return r.n.trim() || summary(r.s); };
      if (d.rules.length <= 2) {
        d.rules.forEach(function (r) { lines.push([name(r), plural(count(r.id), 'élève', 'élèves')]); });
      } else {
        lines.push([name(d.rules[0]), plural(count(d.rules[0].id), 'élève', 'élèves')]);
        var rest = d.rules.slice(1).reduce(function (a, r) { return a + count(r.id); }, 0);
        lines.push(['Et ' + (d.rules.length - 1) + NB + 'autres feuilles', plural(rest, 'élève', 'élèves')]);
      }
      var who = d.rules.length ? 'Le reste de la classe' : 'Toute la classe';
      var classLine = d.all ? h('li', null, [who + NB + ': ', h('b', { text: summary(d.all) })])
        : h('li', null, [d.rules.length ? 'Les autres élèves choisissent leur feuille.' : 'Vos élèves choisissent leur feuille.']);
      if (sum) {
        sum.textContent = '';
        lines.forEach(function (l) { sum.appendChild(h('li', null, [h('b', { text: l[0] }), ' ', h('span', { class: 'sh-sum-n', text: l[1] })])); });
        sum.appendChild(classLine);
      }
      if (btn) btn.textContent = d.all || d.rules.length ? 'Modifier' : 'Choisir la feuille';
    }

    /* ---------- Enregistrer ---------- */
    function failText(e) {
      return (e && e.offline ? 'Pas de connexion Internet. ' : 'Le serveur n’a pas répondu comme prévu. ') +
        'Rien n’est perdu : vos changements restent ici. Réessayez dans un moment.';
    }
    function save() {
      if (busy) return;
      var bad = null;
      if (draft.all && problem(draft.all)) bad = { id: 'all', name: allTitle(), why: problem(draft.all) };
      draft.rules.forEach(function (r) { if (!bad && problem(r.s)) bad = { id: r.id, name: ruleName(r), why: problem(r.s) }; });
      if (bad) {
        openId = bad.id;
        saveMsg = { text: 'La feuille « ' + bad.name + ' » n’est pas complète : ' + bad.why, err: true };
        render();
        return;
      }
      var out = exportSheets(draft);
      busy = true;
      saveMsg = { text: '', err: false };
      el.save.textContent = 'Enregistrement…';
      renderFoot();
      Promise.resolve().then(function () { return opts.onSave(clone(out)); }).then(function () {
        saved = importSheets(out);
        saveMsg = { text: 'Enregistré. Vos élèves verront la nouvelle feuille la prochaine fois qu’ils ouvriront le lien. Le lien ne change pas.', err: false };
        renderCard();
        backArmed = false;
        if (el.backStatus) el.backStatus.textContent = '';
      }, function (e) {
        saveMsg = { text: failText(e), err: true };
      }).then(function () {
        busy = false;
        el.save.textContent = 'Enregistrer pour les élèves';
        renderFoot();
      });
    }

    /* ---------- Actions ---------- */
    function sheetFor(id) { if (id === 'all') return draft.all; var r = ruleById(id); return r ? r.s : null; }
    function closeMenu(focusTrigger) {
      var m = menu;
      menu = null;
      if (focusTrigger && m) pendingFocus = m.type === 'place' ? null : 'more-' + m.id;
      render();
      if (focusTrigger && m && m.type === 'place') el.place.focus();
    }
    function act(name, id, btn) {
      var r;
      switch (name) {
        case 'mode-choose':
          if (!draft.all) return;
          snapshot();
          keepAll = draft.all;
          draft.all = null;
          if (openId === 'all') openId = null;
          tell(draft.rules.length ? 'Les autres élèves choisiront leur feuille.' : 'Vos élèves choisiront leur feuille.', true);
          break;
        case 'mode-pick':
          if (!draft.all) { draft.all = keepAll || inSheet(DEFAULT_SHEET); msg = { text: '', err: false }; undoSnap = null; }
          openId = 'all';
          pendingFocus = 'mode-pick';
          break;
        case 'edit': openId = id; confirmDel = null; pendingFocus = id === 'all' ? 'f-all-o-mul' : 'f-' + id + '-n'; render(); return;
        case 'done': openId = null; pendingFocus = 'edit-' + id; render(); return;
        case 'more':
          if (menu && menu.type === 'more' && menu.id === id) { closeMenu(true); return; }
          menu = { type: 'more', id: id };
          focusMenu = true;
          render();
          return;
        case 'dup':
          if (btn && btn.getAttribute('aria-disabled') === 'true') return;
          r = ruleById(id);
          if (!r || draft.rules.length >= MAX_RULES) return;
          snapshot();
          var copy = { id: newId(draft), n: r.n.trim() ? (r.n.trim().slice(0, 32) + ' (copie)') : '', s: clone(r.s) };
          draft.rules.splice(draft.rules.indexOf(r) + 1, 0, copy);
          menu = null;
          openId = copy.id;
          pendingFocus = 'f-' + copy.id + '-n';
          tell('Feuille dupliquée, sans élèves. Glissez-y des prénoms.', true);
          break;
        case 'del': menu = null; confirmDel = id; pendingFocus = 'del-no-' + id; render(); return;
        case 'del-no': confirmDel = null; pendingFocus = 'more-' + id; render(); return;
        case 'del-yes':
          r = ruleById(id);
          if (!r) return;
          snapshot('more-' + id);
          var gone = members(id);
          draft.rules.splice(draft.rules.indexOf(r), 1);
          gone.forEach(function (i) { delete draft.by[i]; });
          if (openId === id) openId = null;
          confirmDel = null;
          pendingFocus = 'add';
          tell('Feuille supprimée.' + (gone.length ? ' ' + plural(gone.length, 'élève', 'élèves') + ' ' + (gone.length > 1 ? 'sont revenus' : 'est revenu') + ' dans « ' + allTitle() + ' ».' : ''), true);
          break;
        case 'add':
          if (draft.rules.length >= MAX_RULES) return;
          snapshot();
          var nid = newId(draft);
          draft.rules.push({ id: nid, n: '', s: draft.all ? clone(draft.all) : inSheet(DEFAULT_SHEET) });
          openId = nid;
          pendingFocus = 'f-' + nid + '-n';
          tell('Feuille ajoutée. Réglez-la, puis glissez-y des prénoms.', true);
          break;
        case 'place':
          if (menu && menu.type === 'place') { closeMenu(true); return; }
          menu = { type: 'place' };
          focusMenu = true;
          render();
          return;
        case 'to':
          if (btn && btn.getAttribute('aria-disabled') === 'true') return;
          var ids = sel.slice();
          menu = null;
          pendingFocus = 'kid-' + ids[0];
          place(ids, id);
          return;
        case 'clear':
          sel = [];
          menu = null;
          pendingFocus = lastKid >= 0 ? 'kid-' + lastKid : null;
          render();
          return;
        case 'undo': undo(); return;
        case 'save': save(); return;
        case 'reset':
          if (!isDirty()) return;
          snapshot();
          draft = clone(saved);
          openId = null;
          confirmDel = null;
          sel = [];
          tell('Changements annulés. Voici la feuille enregistrée.', true);
          saveMsg = { text: '', err: false };
          break;
        case 'back':
          if (isDirty() && !backArmed) {
            backArmed = true;
            if (el.backStatus) {
              el.backStatus.classList.add('is-err');
              el.backStatus.textContent = 'Vos changements ne sont pas encore enregistrés. Touchez encore « Ma classe » pour partir sans les enregistrer.';
            }
            return;
          }
          leave();
          return;
        default: return;
      }
      changed();
      render();
    }
    function leave() {
      cancelDrag();
      menu = null;
      confirmDel = null;
      backArmed = false;
      if (el.backStatus) el.backStatus.textContent = '';
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    function toggleKid(chip) {
      var i = Number(chip.getAttribute('data-kid'));
      if (!okPlace(i)) return;
      if (isSel(i)) sel = sel.filter(function (x) { return x !== i; }); else sel.push(i);
      chip.setAttribute('aria-pressed', String(isSel(i)));
      lastKid = i;
      rove[placeOf(i)] = i;
      setRove(chip);
      if (menu && menu.type === 'place') menu = null;
      renderDock();
    }
    function setRove(chip) {
      var g = chip.closest('.sh-kids');
      if (!g) return;
      Array.prototype.forEach.call(g.querySelectorAll('[data-kid]'), function (c) { c.setAttribute('tabindex', c === chip ? '0' : '-1'); });
    }

    root.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-kid]');
      if (chip && root.contains(chip)) {
        if (e.detail !== 0 && Date.now() - suppressAt < 800) { e.preventDefault(); return; }
        toggleKid(chip);
        return;
      }
      var b = e.target.closest('[data-act]');
      if (!b || !root.contains(b) || b.disabled) return;
      act(b.getAttribute('data-act'), b.getAttribute('data-id'), b);
    });
    root.addEventListener('change', function (e) {
      var t = e.target;
      var f = t.getAttribute && t.getAttribute('data-f');
      if (!f || f === 'n') return;
      var s = sheetFor(t.getAttribute('data-id'));
      if (!s) return;
      var v = t.value;
      if (f === 'o') {
        s.o = OP_KEYS.filter(function (k) { return k === v ? t.checked : has(s.o, k); });
        if (!s.o.every(isMD)) s.mode = 't';
      } else if (f === 't') {
        var n = Number(v);
        s.t = TABLES.filter(function (x) { return x === n ? t.checked : has(s.t, x); });
      } else if (f === 'st') {
        s.st = SKEYS.filter(function (x) { return x === v ? t.checked : has(s.st, x); });
      } else if (f === 'mode') s.mode = v === 'st' ? 'st' : 't';
      else if (f === 'm' || f === 'q') s[f] = Number(v);
      else if (f === 'k') s.k = v;
      undoSnap = null;
      msg = { text: '', err: false };
      changed();
      render();
    });
    root.addEventListener('input', function (e) {
      var t = e.target;
      if (!t.getAttribute || t.getAttribute('data-f') !== 'n') return;
      var r = ruleById(t.getAttribute('data-id'));
      if (!r) return;
      r.n = t.value.slice(0, 40);
      var title = document.getElementById(uid + '-t-' + r.id);
      if (title) title.textContent = ruleName(r);
      changed();
      renderFoot();
    });

    /* ---------- Clavier ---------- */
    root.addEventListener('keydown', function (e) {
      var t = e.target;
      if (e.key === 'Escape') {
        if (drag && drag.active) { cancelDrag(); e.preventDefault(); return; }
        if (menu) { closeMenu(true); e.preventDefault(); return; }
        if (confirmDel) { var c = confirmDel; confirmDel = null; pendingFocus = 'more-' + c; render(); e.preventDefault(); return; }
        if (sel.length && t.closest && t.closest('.sh-kids, .sh-bar')) { act('clear'); e.preventDefault(); }
        return;
      }
      var mi = t.closest && t.closest('[role="menuitem"]');
      if (mi) {
        var items = Array.prototype.slice.call(mi.parentNode.querySelectorAll('[role="menuitem"]'));
        var at = items.indexOf(mi);
        var go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
        if (go != null) { e.preventDefault(); items[(go + items.length) % items.length].focus(); return; }
        if (e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
        return;
      }
      var chip = t.closest && t.closest('[data-kid]');
      if (chip) {
        var list = Array.prototype.slice.call(chip.parentNode.querySelectorAll('[data-kid]'));
        var i = list.indexOf(chip);
        var to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
        if (to == null) return;
        e.preventDefault();
        to = Math.max(0, Math.min(list.length - 1, to));
        setRove(list[to]);
        list[to].focus();
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!menu || root.hidden) return;
      if (e.target.closest && e.target.closest('.sh-menu, [data-act="more"], [data-act="place"]')) return;
      menu = null;
      render();
    }, true);

    /* ---------- Glisser-déposer (Pointer Events) ----------
       Souris et stylet : le glisser commence après 6 px.
       Doigt : un toucher court sélectionne, un balayage fait défiler la page,
       et un appui de 220 ms soulève le prénom ; on peut alors le glisser. */
    var drag = null;
    var suppressAt = 0;
    var HOLD_MS = 220;
    function dropAt(x, y) {
      var t = document.elementFromPoint(x, y);
      var z = t && t.closest ? t.closest('[data-drop]') : null;
      return z && root.contains(z) ? z : null;
    }
    function setOver(z) {
      if (drag.over === z) return;
      if (drag.over) drag.over.classList.remove('is-over');
      drag.over = z;
      if (z) z.classList.add('is-over');
    }
    function startDrag() {
      var i = drag.kid;
      drag.active = true;
      drag.ids = isSel(i) ? sel.slice() : [i];
      if (menu) { menu = null; renderDock(); }
      drag.ids.forEach(function (k) {
        var c = root.querySelector('[data-kid="' + k + '"]');
        if (c) c.classList.add('is-dragging');
      });
      drag.chip.classList.remove('is-lifted');
      var more = drag.ids.length - 1;
      drag.ghost = h('div', { class: 'sh-ghost', 'aria-hidden': 'true' }, [
        h('span', { text: roster[i] }),
        more ? h('b', { text: '+' + more }) : null
      ]);
      document.body.appendChild(drag.ghost);
      document.documentElement.classList.add('sh-dragging');
      moveGhost();
      tick();
    }
    function moveGhost() {
      if (!drag || !drag.ghost) return;
      drag.ghost.style.transform = 'translate(' + Math.round(drag.x + 10) + 'px,' + Math.round(drag.y - 28) + 'px) rotate(-2deg)';
      setOver(dropAt(drag.x, drag.y));
    }
    function tick() {
      if (!drag || !drag.active) return;
      var H = window.innerHeight, top = 70, bottom = 96, v = 0;
      if (drag.y < top) v = -Math.ceil((top - drag.y) / 3);
      else if (drag.y > H - bottom) v = Math.ceil((drag.y - (H - bottom)) / 3);
      if (v) { window.scrollBy(0, v); setOver(dropAt(drag.x, drag.y)); }
      drag.raf = window.requestAnimationFrame(tick);
    }
    function endDrag() {
      if (!drag) return;
      clearTimeout(drag.timer);
      if (drag.raf) window.cancelAnimationFrame(drag.raf);
      if (drag.over) drag.over.classList.remove('is-over');
      if (drag.ghost) drag.ghost.remove();
      if (drag.chip) drag.chip.classList.remove('is-lifted');
      Array.prototype.forEach.call(root.querySelectorAll('.is-dragging'), function (c) { c.classList.remove('is-dragging'); });
      document.documentElement.classList.remove('sh-dragging');
      try { if (drag.chip.hasPointerCapture(drag.pid)) drag.chip.releasePointerCapture(drag.pid); } catch (e) { /* rien */ }
      drag = null;
    }
    function cancelDrag() {
      if (drag && drag.active) suppressAt = Date.now();
      endDrag();
    }
    root.addEventListener('pointerdown', function (e) {
      suppressAt = 0;   // seul le clic qui suit un glisser est ignoré
      var chip = e.target.closest && e.target.closest('[data-kid]');
      if (!chip || !root.contains(chip) || e.button > 0 || !e.isPrimary) return;
      if (drag) endDrag();
      var touch = e.pointerType === 'touch';
      drag = { pid: e.pointerId, chip: chip, kid: Number(chip.getAttribute('data-kid')), x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, touch: touch, armed: !touch, active: false, over: null };
      try { chip.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
      if (touch) {
        drag.timer = setTimeout(function () {
          if (!drag || drag.chip !== chip) return;
          drag.armed = true;
          chip.classList.add('is-lifted');
          try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* rien */ }
        }, HOLD_MS);
      }
    });
    root.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.x = e.clientX;
      drag.y = e.clientY;
      var dist = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
      if (!drag.active) {
        if (!drag.armed) { if (dist > 10) endDrag(); return; }   // le doigt fait défiler la page
        if (dist < (drag.touch ? 4 : 6)) return;
        startDrag();
      }
      e.preventDefault();
      moveGhost();
    });
    root.addEventListener('pointerup', function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.active) { endDrag(); return; }        // un simple toucher : le clic sélectionne
      drag.x = e.clientX;
      drag.y = e.clientY;
      var z = dropAt(drag.x, drag.y);
      var ids = drag.ids;
      suppressAt = Date.now();
      endDrag();
      if (z) place(ids, z.getAttribute('data-drop'));
    });
    root.addEventListener('pointercancel', function (e) {
      if (drag && e.pointerId === drag.pid) cancelDrag();
    });
    // Une fois le prénom soulevé, le doigt ne fait plus défiler la page.
    root.addEventListener('touchmove', function (e) {
      if (drag && (drag.active || (drag.touch && drag.armed)) && e.cancelable) e.preventDefault();
    }, { passive: false });
    root.addEventListener('contextmenu', function (e) {
      if (e.target.closest && e.target.closest('[data-kid]')) e.preventDefault();
    });

    /* ---------- Méthodes publiques ---------- */
    function isDirty() { return keyOf(draft) !== keyOf(saved); }
    // Une autre classe (ou une liste de prénoms modifiée) : on repart de cette liste, sans brouillon.
    function setRoster(list, x) {
      roster = arr(list).map(function (n) { return typeof n === 'string' ? n.trim() : ''; });
      saved = importSheets(x || { all: null, rules: [], by: {} });
      draft = clone(saved);
      sel = [];
      renderCard();
      if (!root.hidden) render();
    }
    function setSheets(x) {
      var wasDirty = isDirty();
      saved = importSheets(x);
      if (!wasDirty) draft = clone(saved);
      renderCard();
      if (!root.hidden) render();
    }
    function open(fromDraft) {
      draft = fromDraft ? importSheets(fromDraft) : clone(saved);
      sel = [];
      openId = null;
      menu = null;
      confirmDel = null;
      undoSnap = null;
      msg = { text: '', err: false };
      saveMsg = { text: '', err: false };
      backArmed = false;
      if (el.backStatus) el.backStatus.textContent = '';
      // Les autres vues de la page (section#v-…) se cachent.
      if (root.parentNode) Array.prototype.forEach.call(root.parentNode.children, function (c) {
        if (c !== root && c.tagName === 'SECTION' && /^v-/.test(c.id)) c.hidden = true;
      });
      root.hidden = false;
      render();
      try { window.scrollTo({ top: 0 }); } catch (e) { window.scrollTo(0, 0); }
      if (el.title) { el.title.setAttribute('tabindex', '-1'); el.title.focus({ preventScroll: true }); }
    }
    if (card) {
      var ob = card.querySelector('[data-sh="open"]');
      if (ob) ob.addEventListener('click', function () { if (typeof opts.onOpen === 'function') opts.onOpen(); else open(); });
    }
    renderCard();

    return {
      setSheets: setSheets,
      setRoster: setRoster,
      open: open,
      summary: function (sheet) { return summary(sheet); },
      isDirty: isDirty
    };
  }

  window.SheetsEditor = { create: create };
})();
