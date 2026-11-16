# 01 — Installation, Configuration Google Sheets / Drive & Firebase

**Application :** GESTION ÉQUIPE GAZ – SIDI ALI  
**Entité :** Sonelgaz Distribution · Direction de Distribution de Mostaganem · District Gaz Sidi Ali  
**Fuseau horaire :** `Africa/Algiers` · Format date : `JJ/MM/AAAA` · Format heure : `24h`

---

## 1. Prérequis système
- **Node.js 22 LTS** (ou supérieur) + **npm 10+**
- Un projet **Firebase** (Authentication + Firestore activés)
- Un compte **Google Workspace** (Chef d'équipe) pour Google Sheets & Google Drive
- (Pour APK Android) **Android Studio**, **JDK 17+** et **Android SDK**

---

## 2. Installation initiale
```bash
git clone <url-du-depot>
cd gestion-equipe-gaz-sidi-ali
cp .env.example .env
npm ci
```

### Variables d'environnement (`.env`)
- `PORT=3000`
- `TZ="Africa/Algiers"`
- `SESSION_SECRET` : chaîne aléatoire secrète d'au moins 64 caractères hexadécimaux (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `INITIAL_CHIEF_EMAIL` : adresse e-mail du Chef d'équipe principal (par défaut `nemirabdelhakim@gmail.com`).
- `GOOGLE_SPREADSHEET_ID` / `GOOGLE_DRIVE_FOLDER_ID` *(optionnel si provisionné depuis l'écran Base Sheets du Chef)*.

> **Règle de sécurité :** Ne jamais commiter `.env`, clés privées ou jetons dans GitHub.

---

## 3. Configuration Google Sheets & Google Drive (11 feuilles)
Deux méthodes sont disponibles :

### Méthode A — Provisionnement intégré depuis l'application (recommandée)
1. Connectez-vous avec le compte **CHEF** dans l'application.
2. Ouvrez l'onglet **Base Sheets** dans le menu principal.
3. Cliquez sur **Connecter Google Workspace** (OAuth 2.0 côté client, scopes `spreadsheets` et `drive.file`).
4. Cliquez sur **Créer / Lier le classeur Google Sheets** : le backend crée automatiquement le classeur `GESTION_EQUIPE_GAZ_SIDI_ALI` avec les **11 feuilles officielles** et le dossier Drive `GESTION_EQUIPE_GAZ_SIDI_ALI_FICHIERS`.

### Méthode B — Script Google Apps Script (`scripts/google_sheets_init.gs`)
1. Ouvrez Google Sheets ou `script.google.com`.
2. Collez le contenu de `scripts/google_sheets_init.gs`.
3. Exécutez `setupDistrictGazWorkbook()` pour générer les 11 feuilles (`AGENTS`, `TACHES`, `AFFECTATIONS`, `COMPTES_RENDUS`, `PHOTOS`, `HISTORIQUE`, `PARAMETRES`, `NOTIFICATIONS`, `EQUIPEMENTS`, `SESSIONS_ET_APPAREILS`, `SYNCHRONISATION`) et le dossier Drive.
4. Reportez les identifiants dans `.env` ou dans l'écran **Base Sheets**.

---

## 4. Configuration Firebase
- Les règles de sécurité Firestore (`firestore.rules`) appliquent un **Default-Deny global**, l'isolation des données PII (`/agents/{agentId}/private/info`) et l'immuabilité de `/history`.
- Déployer les règles lors de la mise en production : `firebase deploy --only firestore:rules`.
