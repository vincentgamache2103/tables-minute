# Tables minute

Feuille de tables minute chronométrée, pensée pour la tablette.

- Multiplication, division, addition et soustraction, seules ou mélangées
- Tables au choix (1 à 10), chrono de 2, 3 ou 4 minutes, 12, 24 ou 36 questions
- Questions « 4 × 7 = ? », « 4 × ? = 28 », « 28 ÷ 4 = ? », « ? − 4 = 7 »…
- Clavier à l'écran, correction à la fin, faits à revoir et reprise des erreurs
- Boîte à idées : les suggestions arrivent par courriel (Web3Forms)
- Réglages et derniers essais gardés sur l'appareil

Site : https://vincentgamache2103.github.io/tables-minute/

Statistiques de visites anonymes avec GoatCounter (aucun témoin, aucune adresse IP conservée).
Événements comptés : nouvel-appareil, visite-de-retour, feuille-commencee, feuille-terminee,
operation-*, suggestion-envoyee.

## Version classe (gratuite pour les profs)

Le prof crée sa classe avec les prénoms de ses élèves (`ma-classe.html`), partage le lien de la classe,
et chaque élève touche son prénom avant sa feuille. Le tableau du prof montre le score, les tables
difficiles et la progression de chaque élève.

- Prénoms et résultats chiffrés dans le navigateur (`classe.js`) : la classe avec une clé AES-GCM qui reste
  dans le lien (après le #), chaque résultat pour le prof seul (ECDH P-256 + AES-GCM)
- Serveur : Google Firestore (projet `tables-minute`, Montréal), API REST sans clé; les règles sont dans
  `firestore.rules` (une classe ne change jamais, un résultat peut seulement être ajouté)
- Lien des élèves : `./#c=<classe>.<clé>`; lien du prof : `./ma-classe.html#p=<classe>.<clé>.<clé privée>`
- Hors ligne : le résultat chiffré attend sur l'appareil et part au retour de la connexion

Événements comptés : classe-creee, classe-prenom, classe-resultat, classe-tableau (à chaque lecture du
tableau), classe-retour (un prof qui revient un autre jour), classe-active-10 (une classe atteint 10 élèves
actifs), classe-lien-eleves, classe-lien-prof, classe-lien-prof-courriel, classe-csv, classe-liste-modifiee.
La page `ma-classe.html` ne charge aucun script ni police d'un autre site : ses compteurs partent par une image.

## Entiers minute (secondaire)

Dossier `entiers/` : la même idée pour les nombres entiers positifs et négatifs (1re et 2e secondaire).

- Modules : + et −, × et ÷, les 4 opérations, trouve x, trouve x en 2 étapes
- Notation québécoise : vrai signe moins, négatif entre parenthèses après un opérateur (5 − (−3))
- Correction avec l'erreur la plus fréquente et un conseil, reprise des erreurs avec des questions jumelles
- Lien de prof : même feuille pour tout le groupe, temps majoré d'un tiers, aucun compte
- Moteur des questions sans affichage dans `entiers/moteur.js`

Site : https://vincentgamache2103.github.io/tables-minute/entiers/

Événements comptés : entiers-feuille-commencee, entiers-feuille-terminee, entiers-module-*,
entiers-feuille-prof, entiers-lien-prof, entiers-resultat-copie, entiers-refaire.
