# Family App Frontend

Application mobile nommée provisoirement **Family Flow** développée avec **Expo / React Native**.

Ce projet consomme l’API Laravel du backend pour proposer une expérience mobile complète autour de la vie d’un foyer : tableau de bord, tâches, calendrier, budget, repas, recettes, listes de courses et notifications.

---

## À propos

**Family App Frontend** est la partie mobile du projet.

Objectifs principaux :

- offrir une interface mobile claire et rapide pour les parents et les enfants ;
- respecter le contexte de foyer actif (multi-foyer) ;
- refléter les règles métier exposées par l’API ;
- fournir une base maintenable et testable pour les évolutions du TFE.

L’application est pensée dans une logique **mobile-first** avec navigation typée via Expo Router.

---

## Stack technique

- **TypeScript**
- **React Native 0.81**
- **Expo SDK 54**
- **Expo Router**
- **TanStack React Query**
- **Zustand**
- **Jest + Testing Library**
- **Maestro** (smoke e2e)
- **Pusher JS (Reverb compatible)** pour le temps réel

---

## Architecture du projet

### Structure principale

- `app/` : routes Expo Router (auth, tabs, écrans applicatifs)
- `src/features/` : logique par domaine métier (`tasks`, `budget`, `calendar`, `meals`, etc.)
- `src/services/` : accès API par module
- `src/api/client.ts` : client HTTP partagé, gestion erreurs + token + `X-Household-Id`
- `src/store/` : état global (auth/session)
- `src/realtime/` : abonnement aux canaux temps réel (foyer/utilisateur)
- `tests/` : tests unitaires et d’intégration front

### Principes de structuration

- les écrans restent focalisés sur l’UI et la composition ;
- la logique métier front est regroupée par feature ;
- les appels réseau passent par des services dédiés ;
- les états serveur sont gérés via React Query ;
- les états client persistants transitent par le store session/auth.

---

## Configuration API (local / online)

Créer le fichier `.env` à partir de `.env.example` :

```bash
cp .env.example .env
```

Variables publiques principales :

- `EXPO_PUBLIC_API_MODE` (`local` ou `online`)
- `EXPO_PUBLIC_API_URL_LOCAL`
- `EXPO_PUBLIC_API_URL_ONLINE`
- `EXPO_PUBLIC_REVERB_HOST_LOCAL` / `EXPO_PUBLIC_REVERB_HOST_ONLINE`
- `EXPO_PUBLIC_REVERB_PORT_LOCAL` / `EXPO_PUBLIC_REVERB_PORT_ONLINE`
- `EXPO_PUBLIC_REVERB_SCHEME_LOCAL` / `EXPO_PUBLIC_REVERB_SCHEME_ONLINE`
- `EXPO_PUBLIC_REVERB_KEY_LOCAL` / `EXPO_PUBLIC_REVERB_KEY_ONLINE`
- `EXPO_PUBLIC_PUSHER_APP_CLUSTER`

Le mode actif détermine automatiquement quelle URL API et quels paramètres realtime sont utilisés.

---

## Installation

Depuis `frontend/` :

```bash
npm install
```

---

## Lancement en local

### Démarrage standard

```bash
npm run start
```

### Démarrage avec mode explicite

```bash
npm run start:local
npm run start:online
```

### Plateformes

```bash
npm run android
npm run ios
npm run web
```

---

## Qualité et tests

### Vérifications qualité

```bash
npm run typecheck
npm run lint
npm run quality:check
```

### Tests

```bash
npm run test
npm run test:unit
npm run test:legacy
npm run test:e2e:smoke
```

---

## Domaines couverts côté frontend

Le frontend expose actuellement des écrans et flux pour :

- **Auth / Session**
- **Home / Dashboard**
- **Household Setup**
- **Tasks**
- **Calendar**
- **Budget**
- **Meals / Polls**
- **Recipes**
- **Shopping List**
- **Notifications**

---

## Temps réel

Les mises à jour temps réel s’appuient sur des canaux privés :

- foyer (`private-household.{householdId}`)
- utilisateur (`private-App.Models.User.{userId}`)

Le token d’authentification est injecté côté client pour autoriser les abonnements.

---

## État actuel du projet

Le frontend est organisé pour rester aligné avec l’API backend et les contraintes métier (rôles parent/enfant, contexte de foyer actif, modules fonctionnels).

Axes de consolidation en continu :

- homogénéisation UI sur certains écrans ;
- réduction des styles inline signalés par le lint ;
- extension de la couverture de tests sur les parcours critiques.
