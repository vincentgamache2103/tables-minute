/* Tables minute : le compteur de visites, hébergé sur le site lui-même.
 *
 * Aucun script d'un autre site n'est chargé : ce petit fichier remplace count.js de GoatCounter.
 * Il envoie à tablesminute.goatcounter.com ce que count.js envoie : le chemin de la page, son titre,
 * le site d'où l'on arrive, la taille de l'écran et la partie « ?ref=… » de l'adresse. Jamais ce qui
 * suit le « # » : les clés des liens de classe restent dans le navigateur.
 *
 * Une page compte un événement avec window.goatcounter.count({ path, title, event: true }).
 * Comme count.js, il ne compte rien en local, dans un cadre, ou si localStorage.skipgc vaut « t ».
 */
(function () {
  'use strict';
  var END = 'https://tablesminute.goatcounter.com/count';
  var gc = window.goatcounter = window.goatcounter || {};

  function off() {
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$|\.(local|localhost|test)$/.test(location.hostname)) return true;
    try { if (window.top !== window.self) return true; } catch (e) { return true; }
    try { if (window.localStorage.getItem('skipgc') === 't') return true; } catch (e) { /* rien */ }
    return false;
  }
  function bot() {
    var w = window, d = document;
    if (w.callPhantom || w._phantom || w.phantom) return 150;
    if (w.__nightmare) return 151;
    if (d.__selenium_unwrapped || d.__webdriver_evaluate || d.__driver_evaluate) return 152;
    if (navigator.webdriver) return 153;
    return 0;
  }
  // Le chemin de la page : l'adresse canonique si elle est sur ce site, comme count.js.
  function path() {
    var loc = location;
    var c = document.querySelector('link[rel="canonical"][href]');
    if (c) {
      var a = document.createElement('a');
      a.href = c.href;
      if (a.hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '')) loc = a;
    }
    return (loc.pathname + loc.search) || '/';
  }
  function count(vars) {
    vars = vars || {};
    if (off()) return;
    var data = {
      p: vars.path || path(),
      r: vars.referrer || document.referrer,
      t: vars.title || document.title,
      e: vars.event ? 'true' : '',
      s: [window.screen.width, window.screen.height, window.devicePixelRatio || 1].join(','),
      b: bot() || '',
      q: location.search,
      rnd: Math.random().toString(36).slice(2, 7)
    };
    var parts = [];
    for (var k in data) {
      if (data[k] !== '' && data[k] !== null && data[k] !== undefined) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(data[k]));
    }
    var url = END + '?' + parts.join('&');
    try { if (navigator.sendBeacon && navigator.sendBeacon(url)) return; } catch (e) { /* l'image ci-dessous */ }
    var img = new Image();
    img.src = url;
  }
  gc.count = count;

  // La visite de la page (après le prérendu, s'il y en a un).
  if (!gc.no_onload) {
    if (document.visibilityState === 'prerender') {
      var once = function () {
        if (document.visibilityState === 'prerender') return;
        document.removeEventListener('visibilitychange', once);
        count();
      };
      document.addEventListener('visibilitychange', once);
    } else {
      count();
    }
  }
})();
