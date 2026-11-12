# Tables minute

Feuille de tables minute chronométrée, pensée pour la tablette.

- Multiplication, division, addition et soustraction, seules ou mélangées
- Tables au choix (1 à 10), chrono de 2, 3 ou 4 minutes, 12, 24 ou 36 questions
- Questions « 4 × 7 = ? », « 4 × ? = 28 », « 28 ÷ 4 = ? », « ? − 4 = 7 »…
- Clavier à l'écran, correction à la fin, faits à revoir et reprise des erreurs
- Boîte à idées : les suggestions arrivent par courriel (Web3Forms)
- Réglages et derniers essais gardés sur l'appareil

Site : https://vincentgamache2103.github.io/tables-minute/ · Notes de version : `CHANGELOG.md`

Statistiques de visites anonymes avec GoatCounter (aucun témoin, aucune adresse IP conservée).
Événements comptés : nouvel-appareil, visite-de-retour, feuille-commencee, feuille-terminee,
operation-*, suggestion-envoyee. Attention : le total du tableau GoatCounter additionne les pages et les
événements; pour les visites, regarder la ligne de l'accueil (`/tables-minute`).

Badge « 60+ classes créées » (`#count-badge` dans `classe.html`) : chiffres écrits à la main, à mettre à
jour chaque semaine. Source : GoatCounter, événements `classe-creee` (classes) et `classe-resultat` (feuilles
d'élèves, une par feuille, pas une par classe) depuis le 5 novembre, arrondis vers le bas.

## Pages pour Google

- `division.html` et `addition-soustraction.html` : « tables minute de division », « d'addition et de
  soustraction », avec les calculs de chaque table. Leurs boutons ouvrent le site avec `?ops=div` (ou
  `add-sub`, `add`, `sub`, `mul-div`) : l'opération est choisie, rien n'est verrouillé.
- `compteur.js` : le compteur GoatCounter hébergé sur le site (remplace count.js, aucun script d'un autre site).

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
- **En essai, seulement à `essai/` (pas encore pour tous)** : https://vincentgamache2103.github.io/tables-minute/essai/ma-classe.html.
  Le dossier `essai/` a ses propres `index.html`, `ma-classe.html`, `classe.js` et `feuilles.js` (non indexés par Google);
  le reste vient de la racine. Pour la mettre pour tous : recopier ces quatre fichiers à la racine (liens `../` à retirer).
- La feuille de vos élèves (`essai/feuilles.js`, carte du tableau du prof) : le prof choisit la feuille de toute la classe, et des
  feuilles pour certains élèves (12 au plus), qu'il remplit en touchant ou en glissant leurs prénoms. Chaque enregistrement
  ajoute un document `classes/<première version>/s/<id>`, chiffré avec la clé de la classe et signé par le prof (ECDSA P-256,
  la même clé que pour les résultats); l'élève prend le plus récent qui est bien signé. Le lien des élèves ne change pas.
  Ordre : la feuille de l'élève, sinon un lien de groupe, sinon la feuille de toute la classe, sinon l'élève choisit.
  L'élève ne voit jamais le nom de sa feuille, et ne peut pas la changer.
- Stratégies (× et ÷) : les simples (×1), les doubles (×2), les carrés (2×2 à 5×5), les ×5, les ×10, les ×9, les autres
  (5×3, 5×4, 5×6, 5×7, 6×3, 6×4, 6×6, 6×7, 7×3, 7×4, 7×8, 8×3, 8×4, 8×6, 3×4), dans l'ordre d'une enseignante. Lien de groupe : `st=s2-sq`.

Événements comptés : classe-creee, classe-prenom, classe-resultat, classe-tableau (à chaque lecture du
tableau), classe-retour (un prof qui revient un autre jour), classe-active-10 (une classe atteint 10 élèves
actifs), classe-lien-eleves, classe-lien-prof, classe-lien-prof-courriel, classe-csv, classe-liste-modifiee,
classe-filtre-operation (le prof filtre les résultats par opération), classe-feuille-ouverte, classe-feuille-enregistree, classe-feuille-regles (des feuilles pour certains élèves),
classe-feuille-prof (un élève commence la feuille du prof), strategie-<clé>.
Trois événements de récurrence partent du navigateur du prof, une seule fois par classe et par appareil, à
partir des résultats qu'il vient de lire (aucun code de classe ni prénom) : classe-premiere-feuille (un
premier résultat), classe-2-jours (des feuilles sur au moins 2 jours) et classe-2-semaines (sur au moins
2 semaines).

### Lire GoatCounter : les indicateurs de récurrence des profs

Chaque semaine : (1) profs qui créent = `classe-creee`; (2) activation = `classe-premiere-feuille` ÷
`classe-creee`; (3) retour du prof = `classe-retour`; (4) `classe-2-jours`; (5) **classes actives sur
2 semaines** = `classe-2-semaines`, l'indicateur à surveiller; (6) `classe-active-10`.

Les autres événements, par rôle (ne rien renommer : l'historique repartirait à zéro) :
- familles : nouvel-appareil, visite-de-retour, feuille-commencee, feuille-terminee, feuille-arretee (« Arrêter » pendant une feuille, sans résultat), resultat-copie
  (le bouton « Copier mon résultat » du primaire), operation-* (filtre « operation- »);
- partage : partage-* (filtre « partage- »);
- profs, différenciation : tables-par-operation, feuille-groupe, lien-groupe-copie, trousse-creee,
  trousse-imprimee;
- diagnostic, hors indicateurs : navigateur-facebook, passage-navigateur;
- plus envoyés depuis le 10 novembre : barre-partager, menu-ouvert, ecran-accueil.
Les chiffres sont des planchers : un navigateur qui bloque GoatCounter n'est pas compté.
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
