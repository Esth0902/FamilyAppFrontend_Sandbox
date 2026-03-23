# Build iOS avec Expo EAS

## 1) Informations déjà prêtes dans le projet

- Nom app Expo: `FamilyFlow`
- Slug Expo: `frontend`
- Bundle Identifier iOS: `com.esther0902.frontend`
- EAS Project ID: `80e3a14b-611a-4d47-a2dc-ea5917de9cc3`
- Profil EAS build (déjà présents): `development`, `preview`, `production`
- Profil EAS submit (déjà présent): `production`

Fichiers de référence:
- `app.json`
- `eas.json`

## 2) Pré-requis Apple à avoir

- Compte Apple Developer actif (payant).
- Accès App Store Connect.
- App créée dans App Store Connect avec le bundle ID `com.esther0902.frontend`.
- Team Apple Developer (Team ID).
- Clé API App Store Connect (recommandé pour `eas submit`):
  - `Issuer ID`
  - `Key ID`
  - fichier `.p8`

## 3) Pré-requis machine

- Node.js et npm installés.
- EAS CLI installé: `npm install -g eas-cli`
- Connecté à Expo: `eas login`

## 4) Commandes build iOS

Depuis le dossier `frontend/`:

```bash
npm install
eas build -p ios --profile preview
```

Build production:

```bash
eas build -p ios --profile production
```

Optionnel (si besoin de regénérer la config EAS):

```bash
eas build:configure
```

## 5) Commande submit App Store Connect

```bash
eas submit -p ios --profile production
```

Si EAS demande les credentials iOS:

```bash
eas credentials -p ios
```

## 6) Variables d’environnement build

Les profils `preview` et `production` dans `eas.json` embarquent déjà:

- `EXPO_PUBLIC_API_MODE=online`
- `EXPO_PUBLIC_API_URL_ONLINE=https://api.familyapp-devlab.ovh/api`
- `EXPO_PUBLIC_REVERB_PORT_ONLINE=443`
- `EXPO_PUBLIC_REVERB_SCHEME_ONLINE=https`
- `EXPO_PUBLIC_REVERB_KEY_ONLINE=familyapp-prod-key`
- `EXPO_PUBLIC_PUSHER_APP_CLUSTER=mt1`

Note: `EXPO_PUBLIC_REVERB_HOST_ONLINE` n’est pas obligatoire ici car l’app peut retomber sur l’hôte de l’API.

## 7) Check rapide avant build

- `bundleIdentifier` iOS inchangé et unique.
- Icône iOS présente: `./assets/images/logo.png`.
- `npm run lint` passe.
- Version app (`app.json > expo.version`) cohérente pour release.
- Pour production, vérifier la stratégie d’incrément de version (`autoIncrement: true` dans `eas.json`).
