# 05 — Maintenance, Architecture Sécurité & Suite des 18 Tests Obligatoires

## 1. Architecture de Sécurité
- **Mots de passe** : hachage `crypto.scrypt` avec sel aléatoire 16 octets + comparaison constante (`timingSafeEqual`). Aucun mot de passe en clair n'est stocké ni exporté vers Google Sheets (`toPublicAgent` exclut systématiquement `password_hash`).
- **Sessions & Révocation immédiate** : jetons JWT signés (`HS256`, 12h) embarquant `token_version`. La réinitialisation d'accès ou le changement de statut (`INACTIF`, `SUSPENDU`, `ABSENT`, `CONGÉ`) incrémente `token_version` et bloque immédiatement toute requête existante (`401`/`403`).
- **Protection anti-force brute** : limitation de débit (`30` tentatives / 15 min) sur `/api/auth/login` et `/api/auth/firebase`.
- **RBAC strict côté serveur** :
  - Routes `CHEF` uniquement : création/modification/désactivation d'agents, création/modification/affectation/annulation de tâches, validation/refus de comptes-rendus, gestion référentiels, exports globaux, base Google Sheets & restauration.
  - Exécution terrain (`my-status`, `photos`, `reports`) : restreinte aux **agents affectés** (`403 NOT_ASSIGNED` sinon).
- **En-têtes HTTP & Traversée de chemins** : `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (sous HTTPS), validation stricte par regex sur les fichiers de sauvegarde (`backup-*.json`) et `path.basename` sur les photos.
- **Sauvegarde quotidienne** : vérification automatique au démarrage du serveur et toutes les 12 heures dans `database/backups/`.

---

## 2. Suite complète des 18 Tests obligatoires (et tests sécurité)

Exécution de l'ensemble de la suite de tests automatisés (Phases 1 à 8) :
```bash
npx tsx --test backend/tests/phase*.test.ts
```

### Couverture des 18 tests du cahier des charges
1. **TEST 1** : Le chef se connecte et crée un agent (`phase1.test.ts`, `phase8.test.ts`).
2. **TEST 2** : Le chef crée une tâche et l'affecte à deux agents (`phase3.test.ts`, `phase8.test.ts`).
3. **TEST 3** : Les deux agents reçoivent la notification (`phase3.test.ts`, `phase7.test.ts`, `phase8.test.ts`).
4. **TEST 4** : Tous les agents peuvent voir la tâche (`phase3.test.ts`, `phase8.test.ts`).
5. **TEST 5** : Un agent non affecté ne peut pas modifier la tâche (`phase4.test.ts`, `phase8.test.ts`).
6. **TEST 6** : Un agent affecté accepte et commence l'intervention (`phase4.test.ts`, `phase8.test.ts`).
7. **TEST 7** : Il perd Internet et continue son compte rendu hors connexion (`phase6.test.ts`, `phase8.test.ts`).
8. **TEST 8** : Il retrouve Internet et synchronise son compte rendu sans doublon (`phase6.test.ts`, `phase8.test.ts`).
9. **TEST 9** : Le chef reçoit le compte rendu et le valide (`phase5.test.ts`, `phase8.test.ts`).
10. **TEST 10** : Le deuxième agent transmet également son compte rendu (`phase8.test.ts`).
11. **TEST 11** : L'historique conserve les deux interventions (`phase4.test.ts`, `phase8.test.ts`).
12. **TEST 12** : Le tableau de bord actualise les statistiques (`phase7.test.ts`, `phase8.test.ts`).
13. **TEST 13** : Un agent désactivé ne peut plus se connecter et sa session active est rejetée (`phase1.test.ts`, `phase8.test.ts`).
14. **TEST 14** : Les données ne sont pas perdues après fermeture et redémarrage (`phase6.test.ts`, `phase8.test.ts`).
15. **TEST 15** : Plusieurs utilisateurs modifient des tâches différentes simultanément sans perte (`phase6.test.ts`, `phase8.test.ts`).
16. **TEST 16** : Un conflit de modification est détecté et signalé (`phase6.test.ts`, `phase8.test.ts`).
17. **TEST 17** : Les rapports PDF et Excel sont correctement générés (`phase7.test.ts`, `phase8.test.ts`).
18. **TEST 18** : Les interfaces Android et Web affichent les mêmes données après synchronisation (`phase8.test.ts`).
