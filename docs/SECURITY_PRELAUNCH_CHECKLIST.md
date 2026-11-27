# ScholarHub — checklist de sécurité avant lancement public

Ce document suit les contrôles à effectuer sur l'API, le panneau d'administration et l'application mobile/web. Une modification de code ne vaut pas validation en production : les cases ci-dessous doivent être cochées après vérification réelle.

## 1. Bloquants avant mise en production

- [ ] Configurer `NODE_ENV=production` sur l'hébergement de l'API.
- [ ] Générer un `JWT_SECRET` aléatoire d'au moins 32 caractères (par exemple `openssl rand -base64 48`). Ne jamais le placer dans Git, un ticket ou une conversation.
- [ ] Configurer `DATABASE_URL` avec un compte PostgreSQL dédié et des droits minimaux.
- [ ] Configurer `FRONTEND_URL` et `CORS_ORIGINS` avec les URL HTTPS exactes des interfaces réellement utilisées. Ne pas mettre `*`.
- [ ] Configurer les clés de messagerie et les clés IA uniquement dans les variables d'environnement de l'hébergeur.
- [ ] Vérifier que les secrets précédemment exposés dans un dépôt, un historique Git, un journal ou un fichier partagé ont été révoqués et renouvelés.
- [ ] Vérifier les sauvegardes PostgreSQL et réaliser un test de restauration.
- [ ] Appliquer les migrations Prisma sur la base de production : `npx prisma migrate deploy`, puis `npx prisma generate`.
- [ ] Vérifier que les migrations incluent bien `tokenVersion` et le caractère nullable de `scholarships.deadline`.
- [ ] Vérifier que l'application démarre correctement avec les vraies variables de production avant d'ouvrir l'accès au public.

## 2. Comptes, connexion et autorisations

- [ ] Tester inscription, vérification d'e-mail, connexion, déconnexion, mot de passe oublié et réinitialisation.
- [ ] Vérifier que les limites de tentatives de connexion, d'inscription et de réinitialisation bloquent les abus.
- [ ] Vérifier qu'un lien de réinitialisation est à usage unique, expire et ne fonctionne plus après utilisation.
- [ ] Vérifier qu'un ancien jeton est refusé après changement de mot de passe, déconnexion ou changement de rôle.
- [ ] Vérifier qu'un utilisateur standard ne peut jamais accéder aux routes d'administration.
- [ ] Vérifier qu'un administrateur ne peut pas supprimer ou rétrograder le dernier compte administrateur.
- [ ] Créer des comptes administrateurs nominatifs, avec des mots de passe uniques et forts. Ne pas partager un compte.
- [ ] Activer une authentification multifacteur pour les comptes administrateurs dès qu'une solution adaptée est disponible.

## 3. Données personnelles et confidentialité

- [ ] Tester l'export des données d'un compte et la suppression du compte.
- [ ] Vérifier qu'un utilisateur ne peut lire, modifier ou supprimer que ses propres tickets, notifications, favoris, candidatures et conversations.
- [ ] Vérifier que les réponses publiques ne contiennent ni mots de passe, ni jetons, ni jetons FCM, ni champs internes.
- [ ] Définir une durée de conservation pour les conversations, tickets, journaux, sauvegardes et comptes inactifs.
- [ ] Vérifier les conditions de traitement, la conservation et les transferts de données des fournisseurs d'e-mail, d'hébergement et d'IA (notamment Groq et Gemini si le mécanisme de secours les utilise).
- [ ] Informer clairement les utilisateurs lorsque leurs messages au chatbot peuvent être transmis à un fournisseur d'IA externe.
- [ ] Publier une politique de confidentialité et des conditions d'utilisation adaptées aux pays ciblés, puis faire vérifier les obligations légales applicables.
- [ ] Vérifier les procédures de demande d'accès, de rectification, d'export et d'effacement.

## 4. API, données et attaques courantes

- [ ] Tester les filtres et recherches avec des caractères spéciaux, des chaînes très longues et des paramètres mal formés.
- [ ] Vérifier l'absence de requêtes SQL brutes non paramétrées et de construction dynamique de requêtes à partir d'entrées utilisateur.
- [ ] Tester les limites globales et les limites spécifiques des routes sensibles (authentification, support, administration, chatbot et scraper).
- [ ] Vérifier que les erreurs serveur renvoient un message générique en production, sans pile d'appels ni détails de base de données.
- [ ] Vérifier que les journaux ne contiennent ni mots de passe, ni jetons, ni données personnelles inutiles.
- [ ] Tester les liens fournis par les administrateurs et les pages récupérées par le scraper : seuls HTTP/HTTPS doivent être acceptés et les adresses privées ne doivent pas être récupérées par le serveur.
- [ ] Vérifier que les contenus externes et les réponses IA sont traités comme des données non fiables.
- [ ] Vérifier les en-têtes de sécurité, CORS, HTTPS et les limites de taille des requêtes.
- [ ] Il n'existe actuellement pas de fonctionnalité d'envoi de fichiers dans l'API. Si elle est ajoutée, prévoir une validation du type réel du fichier, une limite de taille, un stockage privé et une analyse antivirus.

## 5. Panneau d'administration et application mobile/web

- [ ] Vérifier que le panneau d'administration ne conserve plus le jeton dans un stockage persistant du navigateur après migration.
- [ ] Tester connexion, navigation, déconnexion et expiration de session dans plusieurs onglets.
- [ ] Vérifier les en-têtes CSP et les autres en-têtes de sécurité sur le domaine réellement déployé.
- [ ] Vérifier que les liens de candidature ouverts depuis le panneau et l'application n'acceptent que HTTP/HTTPS.
- [ ] Sur Android, vérifier le stockage sécurisé, l'interdiction du trafic HTTP non chiffré et la désactivation des sauvegardes automatiques de l'application.
- [ ] Sur iOS, vérifier que toutes les connexions réseau utilisent HTTPS et que le jeton est conservé dans le Keychain via le stockage sécurisé.
- [ ] Sur le web, tester le stockage sécurisé, les notifications, le service worker et la politique CSP sur le domaine HTTPS final.
- [ ] Restreindre les clés Firebase publiques aux applications, domaines et API nécessaires dans la console Google Cloud/Firebase. Ces clés client ne sont pas des secrets serveur, mais elles doivent être restreintes.
- [ ] Vérifier que les règles Firebase n'autorisent pas l'accès public à des données privées.

## 6. Scraper, bourses et chatbot

- [ ] Vérifier que les bourses non validées ou désactivées restent invisibles du public.
- [ ] Tester la file de modération et vérifier qu'une annonce douteuse ou expirée ne se publie pas automatiquement.
- [ ] Vérifier que les deadlines absentes restent « Non communiquée » et ne sont jamais inventées.
- [ ] Tester le verrou du scraper et vérifier qu'un lancement manuel ne provoque pas plusieurs traitements simultanés.
- [ ] Pour plusieurs instances serveur, prévoir un verrou partagé en base ou Redis avant d'augmenter le nombre d'instances.
- [ ] Tester les limites du chatbot, les injections de prompt, les résultats d'outils et les indisponibilités des fournisseurs IA.
- [ ] Vérifier que les messages envoyés aux fournisseurs IA respectent la politique de confidentialité annoncée aux utilisateurs.

## 7. Vérifications techniques à exécuter

- [ ] Backend : installer les dépendances depuis le lockfile, lancer les tests disponibles et vérifier le démarrage sur une base de test.
- [ ] Backend : exécuter `npm audit` et examiner chaque vulnérabilité pertinente avant lancement.
- [ ] Admin : exécuter `npm ci`, `npm run lint` et `npm run build`.
- [ ] Mobile : exécuter `flutter pub get`, `flutter analyze` et `flutter test`.
- [ ] Tester les parcours critiques sur Android, iOS et navigateur, pas seulement dans un émulateur.
- [ ] Faire réaliser un audit indépendant ou un test d'intrusion avant un déploiement à grande échelle.

## État des travaux dans le dépôt

Déjà modifié dans le code : protections d'authentification et de sessions, limites de requêtes, durcissement du chatbot, minimisation de certaines réponses API, validation de liens, protection SSRF du récupérateur de pages, échappement de contenus d'e-mails, en-têtes web, stockage sécurisé du jeton mobile et limitation du stockage de session admin.

À ne pas considérer comme validé tant que les contrôles ci-dessus ne sont pas exécutés : compilation complète des trois projets, tests d'intégration, tests sur appareils, audit de dépendances, configuration des variables d'environnement, migrations en production, vérification des contrats des fournisseurs et déploiement. Aucun de ces contrôles ne doit être déclaré réussi sur la seule base d'une vérification de syntaxe.
