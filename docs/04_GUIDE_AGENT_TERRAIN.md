# 04 — Guide Utilisateur des Agents de Terrain (Android & Web)

## 1. Connexion & Premier accès
- Connectez-vous avec votre **matricule** (ex. `SA-0102`) ou votre **e-mail** et le mot de passe temporaire remis par le Chef d'équipe.
- Lors de la première connexion, définissez votre nouveau mot de passe personnel.

## 2. Consulter toutes les tâches vs Mes missions
- **Tâches** : tous les agents actifs du District peuvent consulter la liste globale des interventions (transparence et coordination d'équipe).
- **Mes missions** : affiche uniquement les tâches qui vous sont **affectées** avec de grands boutons tactiles adaptés au terrain.
- Un agent non affecté à une tâche ne peut **ni modifier son statut ni soumettre de compte-rendu** sur cette tâche.

## 3. Réaliser une intervention sur le terrain
1. Ouvrez votre mission dans **Mes missions**.
2. Cliquez sur **Accepter la tâche** (`ACCEPTÉE`), puis sur **Démarrer l'intervention** (`EN COURS`).
3. En cas d'imprévu :
   - **Mettre en attente** (`EN ATTENTE`) avec **motif obligatoire** (ex. abonné absent, pièce attendue).
   - **Signaler un blocage** (`BLOQUÉE`) avec **motif obligatoire** (ex. refus d'accès, danger immédiat).
4. En fin d'intervention :
   - Cliquez sur **Terminer l'intervention** (`TERMINÉE`).
   - Joignez vos **photos AVANT et APRÈS** (compressées automatiquement sur l'appareil).
   - Remplissez et envoyez votre **Compte-rendu** (travail effectué, résultat, difficultés, matériel utilisé, travaux restants, recommandations, durée en minutes).

## 4. Fonctionnement Hors Connexion & Synchronisation (`Synchronisation`)
- Si le réseau mobile est absent sur le terrain, un bandeau **Mode hors connexion actif** apparaît :
  - Vos changements de statut, vos photos et vos comptes-rendus sont **enregistrés de façon persistante dans IndexedDB** sur votre téléphone avec un identifiant unique (`UUID`).
  - Dès le retour d'Internet, l'application synchronise automatiquement votre file d'attente vers le serveur central **sans aucun doublon**.
- Vous pouvez consulter l'état exact de chaque opération (`EN ATTENTE`, `SYNCHRONISÉ`, `ERREUR`, `CONFLIT`) dans l'écran **Synchronisation**.
- En cas de **CONFLIT** (le Chef a modifié la tâche pendant votre coupure réseau), les deux versions sont comparées clairement : vous choisissez de **Forcer avec la dernière version** ou d'**Abandonner** la modification locale.

## 5. Notifications & Profil
- Consultez l'icône cloche en haut de l'écran (**Notifications**) pour vos nouvelles affectations, tâches urgentes, retards et validations/refus de comptes-rendus.
