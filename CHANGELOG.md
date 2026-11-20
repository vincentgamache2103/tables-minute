# Notes de version

Le numéro change seulement pour une nouveauté qu'un prof ou un parent remarque (1.5 → 1.6).
Les petits correctifs n'ont pas de numéro : ils s'ajoutent sous la version en cours.
Le numéro s'affiche au pied de l'accueil et de « Ma classe » (`id="version"`).
Chaque version a son commit, noté ci-dessous. Les `?v=` des scripts servent seulement au cache.

À chaque nouvelle version :
1. ajouter la section ici, avec la date, ce qui change pour les profs et les familles, et les règles Firebase si elles changent ;
2. changer le numéro dans `index.html` et `ma-classe.html` (et dans `essai/` s'il y a lieu) ;
3. noter le commit en ligne à côté de la version (et, si on veut, créer la « Release » v1.x dans GitHub, sur ce commit) ;
4. pour une nouveauté utile aux profs : courriel « Les nouveautés » de 3 lignes aux inscrits.

## 1.6 · 20 novembre 2026 · `c956d6d`
Pour tous depuis le 20 novembre (en essai à `essai/` depuis le 12). La page `essai/` reste en ligne, identique, pour les liens déjà partagés.
- **La feuille de vos élèves** : le prof choisit la feuille de toute la classe et, au besoin, des feuilles
  pour certains élèves, en glissant ou en touchant leurs prénoms. Les élèves la trouvent prête et ne peuvent
  pas la changer ; ils ne voient jamais le nom de leur feuille. Le lien de la classe ne change pas. (#17)
- **Les tables par stratégie** : les simples (×1), les doubles (×2), les carrés, les ×5, les ×10, les ×9,
  les autres, dans l'ordre d'une enseignante. Les carrés vont de 2×2 à 10×10. Pour les familles aussi. (#1)
- Avec une feuille préparée par le prof, l'élève voit seulement cette feuille et « Commencer ».
- **Note, pourcentage ou les deux** : à la fin de la feuille, l'élève voit sa note (18/24), son pourcentage (75 %)
  ou les deux. Le prof choisit pour toute sa classe dans « La feuille de vos élèves »; les familles, dans les
  réglages de la feuille. Par défaut : les deux. Le CSV du prof garde toujours la note et le pourcentage. (#26)
- **Retour à la classe** : un appareil qui a déjà servi au lien de la classe, ouvert sans ce lien (favori,
  historique), montre en haut un gros bouton « Retourner à ta classe ». L'élève peut encore « Pratiquer sans
  ma classe »; à la fin, il lit « Ce résultat n'est pas allé à ton prof », avec le même bouton.
- **Appareils partagés** : dans « La feuille de vos élèves », le prof peut faire redemander le prénom après
  chaque feuille. Le résultat part au bon élève, et ses derniers essais ne restent pas sur l'appareil.
  Par défaut : non (le prénom est redemandé après une heure, comme avant).
- Règles Firebase : nouvelle collection `classes/{id}/s` (publiée le 12 novembre).

## 1.5 · 12 novembre 2026 · `19a3ffc`
Correctifs du 13 novembre (retours de la prof pilote) :
- Avec le lien de la classe, l'élève voit d'abord seulement la liste des prénoms; les derniers essais sont cachés.
- « Ma classe » : une prof dont l'appareil n'a rien gardé colle son lien de prof et retrouve sa classe et ses résultats.
- « Arrêter » pendant une feuille : retour à l'accueil sans résultat, rien n'est envoyé au prof. (#21)
- Après une pratique réussie : « Refaire ces questions, mélangées ». (#22)
- Tableau du prof : résultats par opération (× ÷ + −), dans le tableau, le détail de chaque élève et le CSV. (#2)
- Avec le lien de la classe, la boîte à idées est cachée. (#18)
- Limite du serveur atteinte : l'élève voit que son résultat est gardé et partira plus tard. (#14)

## 1.4 · 5 au 10 novembre 2026 · `456f22e`
- **Version classe, en essai, gratuite pour les profs** : le prof crée sa classe, chaque élève touche son
  prénom, et le prof voit le score, les tables difficiles et la progression. Prénoms et résultats chiffrés
  dans le navigateur.
- Pages pour Google : tables minute de division, d'addition et de soustraction.
- Page profs : badges « classes créées » et « feuilles d'élèves reçues ».
- Statistiques hébergées sur le site, sans script d'un autre site.

## 1.3 · 3 et 4 novembre 2026 · `261847a`
- **Entiers minute**, pour la 1re et la 2e secondaire : les nombres entiers positifs et négatifs.
- « Copier mon résultat », liens par groupe (une feuille par groupe d'élèves), conseil sur les nombres manquants.

## 1.2 · 3 novembre 2026 · `6569b00`
- Tables de 11 et 12.
- Choisir les tables pour chaque opération (différenciation en classe).
- Nouvelle présentation sur téléphone et tablette, page À propos, nouvelle icône.
- Premier témoignage d'une enseignante ; liste d'attente pour la version école.

## 1.1 · 30 octobre au 1er novembre 2026 · `17c799c`
- Division, addition et soustraction.
- Boîte à idées.
- Trousses de classe : page « Tables minute en classe », feuilles pour les parents et codes QR.
- Bloc « Faire connaître Tables minute ».

## 1.0 · 29 octobre 2026 · `2af0b92`
- Mise en ligne : feuilles minute de multiplication chronométrées, correction et reprise des erreurs.
