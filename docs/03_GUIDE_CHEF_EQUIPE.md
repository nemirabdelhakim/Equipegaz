# 03 — Guide Utilisateur du Chef d'équipe Gaz (Sidi Ali)

## 1. Connexion & Sécurité
- Connectez-vous avec votre **matricule** ou **adresse e-mail** (`nemirabdelhakim@gmail.com`) et votre mot de passe, ou via Google/Firebase.
- Depuis **Mon profil**, modifiez votre mot de passe et consultez vos appareils connectés.

## 2. Création et Gestion des Agents (`Agents`)
1. Ouvrez **Agents** -> cliquez sur **Nouvel agent**.
2. Saisissez le **matricule** (ex. `SA-0102`), nom, prénom, téléphone, fonction, e-mail, rôle (`AGENT` ou `CHEF`) et statut (`ACTIF`).
3. Un mot de passe temporaire sécurisé est généré une seule fois pour transmission à l'agent (qui devra le changer à sa première connexion).
4. Pour bloquer immédiatement l'accès d'un agent (départ, suspension), changez son statut en **INACTIF** ou **SUSPENDU** : toute session active sur Web et Android est immédiatement rejetée (`403`).

## 3. Création, Planification et Affectation des Tâches (`Tâches` & `Planning`)
1. Ouvrez **Tâches** -> **Nouvelle tâche**.
2. Renseignez le titre, la catégorie officielle (`FUG`, `VAN`, `ING`, `CPM`, `OUV`, `COU`, `RET`, `REL`, `PRE`, `PUR`, `RSF`), la **Commune** et la **DP**, l'adresse, les coordonnées GPS facultatives, la priorité (`URGENTE`, `HAUTE`, `NORMALE`, `BASSE`), les dates et heures prévues.
3. Cochez **un ou plusieurs agents** (travail individuel ou collectif). Le numéro `GAZ-SA-YYYY-NNNNNN` est attribué automatiquement et chaque agent affecté reçoit une notification.
4. Dans **Planning** (vues **Journalier**, **Hebdomadaire**, **Mensuel**), visualisez la charge, repérez les retards en haut de page pour les **Reporter**, et cliquez sur **Télécharger PDF officiel** pour éditer le programme du jour.

## 4. Contrôle et Validation des Comptes-rendus (`Comptes-rendus`)
- Lorsqu'un agent soumet un compte-rendu (statut **À VALIDER**), consultez les détails de l'intervention, la durée et les **photos AVANT / APRÈS** archivées.
- Cliquez sur **Valider** (la tâche passe à **VALIDÉE**) ou sur **Refuser avec motif** (la tâche repasse à **REFUSÉE** et l'agent peut soumettre une version `v2`, `v3`, etc. sans jamais écraser l'historique).

## 5. Tableau de bord, Suivi Individuel & Exports (`Statistiques` & `Exports PDF/XLSX`)
- **Indicateurs & Graphiques** : filtrez par date, commune, DP, catégorie, agent, priorité ou statut.
- **Suivi individuel** : analysez pour chaque agent son volume, ses retards, sa chronologie et la **complexité** (*Urgentes, Collectives, Individuelles, Complexes, Simples*).
- **Exports officiels** : choisissez parmi les **12 types de rapports** en **PDF**, **Excel XLSX** ou **CSV**, ajoutez des observations et téléchargez avec numéro officiel `RPT-SA-...`.

## 6. Sauvegardes Centrales (`Base Sheets`)
- Connectez Google Workspace pour synchroniser les 11 feuilles Google Sheets et archiver photos et sauvegardes JSON dans Google Drive.
- Une sauvegarde locale quotidienne est créée automatiquement ; vous pouvez déclencher une sauvegarde manuelle vers Drive ou restaurer un instantané à tout moment.
