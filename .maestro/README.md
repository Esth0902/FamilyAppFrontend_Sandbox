# Smoke tests Maestro

Prérequis:
- Installer Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- Avoir un simulateur/emulateur démarré
- Avoir l'application installée sur le simulateur/emulateur

Exécution:

```bash
maestro test .maestro/smoke-startup-login-navigation.yaml
```

Via script npm:

```bash
npm run test:e2e:smoke
```
