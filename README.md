# F1 Live, suivi de la saison F1 2026

Application web (installable) de suivi de la saison de Formule 1 : tableau de bord, classements, Grands Prix, rejeu de course, pilotes, écuries, qualifications, météo, actualités et comparateur de pilotes.

Site statique : aucun serveur, aucune compilation. Hébergé avec GitHub Pages (Settings → Pages → branche `main`, dossier `/`).

## Données

| Source | Sert à |
|---|---|
| [Jolpica F1](https://api.jolpi.ca/ergast/f1) | calendrier, classements, résultats, qualifications, sprints, tours, arrêts aux stands |
| [OpenF1](https://openf1.org) | essais libres, pneus, direction de course, météo mesurée |
| [Open-Meteo](https://open-meteo.com) | prévisions météo des circuits |

Rien n'est inventé : si une donnée n'est pas fournie, la page l'indique. La date de dernière actualisation est affichée en haut, et les données se rafraîchissent toutes les 15 minutes.

## Limites connues

- **Pas de temps réel.** OpenF1 réserve le direct aux comptes sponsors. La page « Direct » rejoue donc la dernière course, tour par tour.
- **Actualités** : résumés construits à partir des résultats et liens vers les sources officielles, aucun article recopié.
- La température de piste n'existe que dans les mesures OpenF1 (pas dans les prévisions).

## Structure

`index.html`, `css/app.css`, `js/` (modules ES : `api`, `model`, `charts`, `util`, `views/*`), `sw.js` (hors ligne), `manifest.webmanifest`.
