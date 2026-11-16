# 02 — Déploiement Web Windows & Génération de l'APK Android

## 1. Déploiement Web sur Windows (PC Chef d'équipe ou Serveur District)

### Lancement rapide (Windows)
1. Copiez le projet sur le poste Windows et configurez `.env` depuis `.env.example`.
2. Exécutez en PowerShell :
   ```powershell
   .\scripts\deploy-windows.ps1
   ```
   Ou double-cliquez sur `scripts\start-windows.bat` une fois les dépendances installées et `npm run build` exécuté.
3. L'application est accessible sur `http://localhost:3000` (ou via un reverse proxy HTTPS IIS / Nginx / Caddy sur le réseau du District).

### HTTPS obligatoire en production
- Pour activer les fonctionnalités PWA hors connexion (Service Worker), la géolocalisation GPS et l'installation sur navigateur Windows/Android, placez un reverse proxy HTTPS (ex. Caddy ou Nginx) devant le port `3000` :
  ```caddyfile
  gaz-sidiali.sonelgaz.local {
      reverse_proxy 127.0.0.1:3000
  }
  ```

### Installation PWA sur Windows (Edge / Chrome)
- Ouvrez l'application sous HTTPS -> cliquez sur **Installer l'application** dans l'en-tête (ou l'icône d'installation dans la barre d'adresse) pour l'utiliser comme application bureau Windows.

---

## 2. Génération de l'Application Android APK via GitHub Actions (Recommandé)

Le projet est préconfiguré pour **Capacitor Android** (`capacitor.config.json`, dossier `android/`) et inclut le workflow automatique `.github/workflows/android-apk.yml`.

### Étapes pour compiler l'APK directement sur GitHub (sans installer Android Studio)
1. Poussez le code source complet sur votre dépôt GitHub (branche `main` ou `master`).
2. *(Optionnel)* Dans **Settings > Secrets and variables > Actions > Variables**, créez `VITE_API_BASE_URL` contenant l'URL HTTPS de votre serveur central (par défaut, le workflow utilise l'URL de l'application publiée).
3. Ouvrez l'onglet **Actions** sur GitHub -> sélectionnez **Build Android APK (Sonelgaz Gaz Sidi Ali)** -> cliquez sur **Run workflow** (ou déclenchez automatiquement à chaque `push`).
   - Choix `debug` (par défaut) : génère un APK directement installable sur tout téléphone Android.
   - Choix `release` : génère un APK de production (signé automatiquement si les secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD` sont renseignés).
4. À la fin du workflow (~2 minutes), téléchargez l'artefact **`SONELGAZ-SIDI-ALI-android-apk`** et installez le fichier `.apk` sur les smartphones des agents du District.

### Compilation locale (optionnelle avec Android Studio / SDK)
```bash
npm install
VITE_API_BASE_URL="https://votre-serveur-https" npm run android:sync
cd android
./gradlew assembleDebug
```
L'APK est généré dans `android/app/build/outputs/apk/debug/app-debug.apk`.
Sur l'écran de connexion de l'APK, le bouton **Configurer serveur central (APK Android)** permet également de modifier l'adresse HTTPS du serveur sans recompiler l'application.
