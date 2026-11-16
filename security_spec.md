# Spécification de sécurité Firestore – Phase 1

## 1. Invariants de données
1. **Default-Deny Global** : Aucun document hors des collections déclarées n'est accessible.
2. **Contrôle Admin/Chef vérifié** : Seul le Chef vérifié (`request.auth.token.email_verified == true` et présent dans `/admins/{uid}` ou email bootstrap `nemirabdelhakim@gmail.com`) peut créer, modifier ou désactiver un agent ou un paramètre.
3. **Isolation des PII (Pilier 6)** : `telephone` et `login_email` sont isolés dans `/agents/{agentId}/private/info`, accessibles uniquement au Chef ou au propriétaire authentifié.
4. **Immuabilité de l'historique** : Les entrées `/history/{historyId}` ne peuvent jamais être modifiées ni supprimées (`update, delete: if false`).
5. **Aucun contournement d'identité ou champ fantôme** : Toutes les écritures valident `hasAll` + `hasOnly`, la taille de chaque chaîne et le format `isValidId()` des identifiants.

## 2. Payloads de test (« Dirty Dozen ») devant retourner PERMISSION_DENIED
1. Lecture anonyme sur `/agents/agent-1` -> refusé.
2. Lecture par un utilisateur non vérifié (`email_verified: false`) avec email admin usurpé -> refusé.
3. Création d'un document dans `/admins/attacker` par un agent -> refusé.
4. Injection d'un champ fantôme (`isAdmin: true`) lors de la création d'un agent -> refusé.
5. Création d'un agent avec `agentId` de plus de 128 caractères ou caractères invalides (`../hack`) -> refusé.
6. Lecture des données privées `/agents/agent-1/private/info` par un autre agent (`agent-2`) -> refusé.
7. Modification du champ `role` par un agent sur sa propre fiche -> refusé.
8. Modification d'une entrée `/history/hist-1` -> refusé.
9. Suppression d'une entrée `/history/hist-1` -> refusé.
10. Suppression physique d'une fiche `/agents/agent-1` -> refusé (désactivation logique uniquement).
11. Création d'un paramètre avec une valeur de 5000 caractères (Resource Poisoning) -> refusé.
12. Requête `list` sur `/history` par un agent qui ne filtre pas sur `resource.data.user_id == request.auth.uid` -> refusé.
