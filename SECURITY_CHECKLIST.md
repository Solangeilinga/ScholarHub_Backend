# ScholarHub — checklist de sécurité avant lancement

Dernière mise à jour : 27 novembre 2026

Ce document distingue les protections déjà ajoutées au code des opérations qui nécessitent un accès aux environnements de production ou des tests réels. Une modification de code ne constitue pas, à elle seule, une certification de sécurité.

## 1. Protections ajoutées au code

### API et backend
- [x] En-têtes de sécurité HTTP avec Helmet.
- [x] CORS limité aux origines déclarées ; validation stricte des origines HTTPS en production.
- [x] Vérification au démarrage de la présence d'un JWT_SECRET fort et de DATABASE_URL en production.
- [x] Limitation de la taille des corps JSON et formulaires.
- [x] Limitation globale des requêtes et limites dédiées à la connexion, l'inscription, la réinitialisation, le chatbot, le support, les opérations admin et le lancement manuel du scraper.
- [x] Réponses d'erreur génériques en production ; détails conservés dans les journaux serveur.
- [x] Validation et plafonnement des paramètres de recherche et de pagination des bourses.
- [x] Validation des URL de candidature et des logos avant enregistrement.
- [x] Vérification des permissions et cloisonnement des données personnelles par utilisateur.
- [x] Révocation des sessions JWT après changement/réinitialisation du mot de passe, déconnexion et changement de rôle.
- [x] Hachage des jetons de vérification d'adresse email et de réinitialisation avant stockage en base ; compatibilité temporaire avec les anciens jetons non hachés.
- [x] Contrôle SSRF du récupérateur de pages du scraper : protocoles, DNS/IP, redirections, taille et type de contenu.
- [x] Échappement des contenus externes insérés dans les e-mails automatiques.
- [x] Recherche statique du code backend : aucun usage de $queryRawUnsafe ou $executeRawUnsafe trouvé dans les fichiers JavaScript analysés.
- [x] Aucun endpoint d'envoi de fichier utilisateur identifié dans le backend actuel.

### Panneau d'administration
- [x] Page de connexion administrateur ; les comptes non-admin sont refusés.
- [x] Jeton conservé dans sessionStorage plutôt que dans le stockage persistant du navigateur.
- [x] Cache des données privées vidé lors de la connexion, de la déconnexion et d'une réponse 401.
- [x] Déconnexion avec révocation de la session côté API.
- [x] En-têtes de sécurité et politique CSP configurés dans Next.js.
- [x] Génération des mots de passe avec l'API cryptographique du navigateur.

### Application Flutter
- [x] Jeton migré de SharedPreferences vers Flutter Secure Storage (Keychain iOS / Keystore Android).
- [x] Suppression du logger HTTP qui pouvait afficher les en-têtes, jetons, mots de passe et réponses API.
- [x] Déconnexion avec révocation de la session côté API.
- [x] Trafic HTTP en clair désactivé dans le manifeste Android.
- [x] Sauvegarde automatique des données de l'application désactivée sur Android.
- [x] Vérification des URL avant ouverture des liens de candidature.
- [x] En-têtes de sécurité configurés pour le déploiement web Netlify.

### Base de données et migrations
- [x] Migration Prisma ajoutée pour rendre la date limite des bourses nullable.
- [x] Migration Prisma existante ajoutant tokenVersion pour la révocation des sessions.

## 2. Actions obligatoires avant le déploiement public

### Variables d'environnement — Railway/Render
- [ ] Définir NODE_ENV=production.
- [ ] Définir un JWT_SECRET aléatoire d'au moins 32 caractères ; ne jamais utiliser la valeur d'exemple.
- [ ] Vérifier DATABASE_URL et DIRECT_URL (connexion directe adaptée aux migrations).
- [ ] Définir FRONTEND_URL avec l'URL HTTPS exacte du panneau admin.
- [ ] Définir CORS_ORIGINS avec les autres origines web HTTPS exactes, si nécessaire.
- [ ] Configurer les clés serveur Resend, Firebase Admin, Groq/Gemini et Brave Search dans le gestionnaire de secrets, jamais dans Git ou dans l'application mobile.
- [ ] Vérifier que les clés Google Search ne sont conservées que si le secours temporaire est encore nécessaire.
- [ ] Faire tourner toute clé qui aurait été publiée accidentellement dans un dépôt, un log ou une capture d'écran.

### Migrations et base de données
- [ ] Exécuter npx prisma migrate deploy sur la base de production.
- [ ] Exécuter npx prisma generate après installation des dépendances.
- [ ] Vérifier dans PostgreSQL que les migrations sont toutes appliquées et que scholarships.deadline accepte bien NULL.
- [ ] Activer des sauvegardes automatiques PostgreSQL.
- [ ] Effectuer un exercice réel de restauration d'une sauvegarde.
- [ ] Définir la durée de conservation des sauvegardes et les personnes autorisées à y accéder.

### Services tiers et confidentialité
- [ ] Vérifier les conditions de traitement, la conservation, la localisation et les sous-traitants de Resend, Firebase, Groq et Gemini.
- [ ] Déterminer quelles données du chatbot sont envoyées à chaque fournisseur IA, y compris lors du mécanisme de secours.
- [ ] Ne jamais envoyer de mot de passe, de jeton d'accès ou de données personnelles non nécessaires aux fournisseurs IA.
- [ ] Restreindre les clés Firebase/Google aux applications, domaines et API nécessaires.
- [ ] Vérifier les règles Firebase et activer App Check lorsque compatible avec les fonctionnalités utilisées.
- [ ] Définir une politique de conservation et de suppression pour les logs, les sauvegardes et les données chez les prestataires.

### Tests techniques
- [ ] Exécuter npm ci et npm audit dans le backend et le panneau admin ; corriger les vulnérabilités pertinentes.
- [ ] Exécuter npm run build et npm run lint dans le panneau admin.
- [ ] Exécuter flutter pub get, flutter analyze et flutter test dans l'application.
- [ ] Tester l'inscription, la vérification email, la connexion, la déconnexion, la réinitialisation et la révocation des sessions.
- [ ] Tester les accès interdits : utilisateur vers données d'un autre utilisateur, routes admin sans rôle admin, jetons expirés/révoqués.
- [ ] Tester les limites de requêtes, les corps trop volumineux, les filtres invalides et les URL non HTTP(S).
- [ ] Tester la récupération SSRF avec localhost, IP privées, redirections vers IP privées et URL malformées.
- [ ] Tester les e-mails avec des chaînes HTML malveillantes dans les noms et les données de bourses.
- [ ] Faire un test d'intrusion indépendant avant une ouverture à grande échelle.

## 3. Points d'architecture à surveiller

- Les limiteurs de requêtes utilisent actuellement leur stockage mémoire par processus. Avec plusieurs instances backend, installer un stockage partagé (par exemple Redis) pour que les limites soient cohérentes.
- Le verrou du scraper est local au processus. Avec plusieurs instances, utiliser un verrou partagé en base ou Redis et éviter de lancer plusieurs planifications cron simultanément.
- Le jeton du panneau admin reste accessible au JavaScript de la page dans sessionStorage. La CSP et l'échappement React réduisent le risque XSS, mais une authentification par cookie HttpOnly/Secure/SameSite serait une évolution plus robuste.
- Aucun endpoint d'upload n'est présent actuellement. Si des avatars, documents ou pièces jointes sont ajoutés, contrôler taille, extension, type MIME et signature réelle du fichier, puis stocker hors du répertoire public.
- Les clés Firebase intégrées aux applications clientes sont des identifiants de configuration publics, pas des secrets serveur. Leur sécurité dépend des restrictions API, des règles Firebase et d'App Check.

## 4. État des vérifications effectuées

- Vérification syntaxique JavaScript effectuée sur les fichiers backend modifiés : OK.
- Recherche statique des appels SQL Prisma non sûrs dans les fichiers JavaScript backend : aucun résultat trouvé.
- Les builds Next.js/Flutter, les tests d'intégration, les tests d'intrusion, l'audit des dépendances et le déploiement n'ont pas été exécutés dans cette session.
