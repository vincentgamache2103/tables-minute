// Lance tous les tests, l'un après l'autre : `node tests/run.js`.
// Chaque test démarre le site en local, avec un faux Firestore; rien ne part sur Internet.
const { spawnSync } = require('child_process');
const path = require('path');
const RUNS = [
  ['pages.test.js'],
  ['arreter-et-pratique.test.js', ''],
  ['arreter-et-pratique.test.js', 'essai/'],
  ['boite-a-idees-classe.test.js'],
  ['resultats-par-operation.test.js', ''],
  ['resultats-par-operation.test.js', 'essai/'],
  ['limite-serveur.test.js', ''],
  ['limite-serveur.test.js', 'essai/'],
  ['feuille-du-prof.test.js'],
  ['classe-simplifiee.test.js']
];
let failed = 0;
for (const [file, page] of RUNS) {
  const label = file + (page !== undefined ? ' (' + (page || 'site public') + ')' : '');
  console.log('\n▶ ' + label);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)].concat(page !== undefined ? [page] : []), { stdio: 'inherit', timeout: 240000 });
  if (r.status !== 0) { failed += 1; console.log('✗ ÉCHEC : ' + label); }
}
console.log(failed ? '\n' + failed + ' test(s) en échec' : '\nTous les tests passent');
process.exit(failed ? 1 : 0);
