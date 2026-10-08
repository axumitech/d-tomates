# Déploiement D'Tomate

La production cible un hébergement MySQL 8.0+ avec HTTPS. Activez `utf8mb4` / `utf8mb4_unicode_ci` afin de conserver correctement les accents, les symboles et les données du Carnet. Ne copiez jamais `.env` ou un secret dans Git.

1. Créer les secrets à partir de `.env.production.example`, avec `APP_DEBUG=false` et `DTOMATE_ALLOW_REGISTRATION=false`.
2. Installer les dépendances et compiler : `composer install --no-dev --optimize-autoloader`, puis `npm ci && npm run build`.
3. Exécuter `php artisan migrate --force`, `php artisan storage:link`, `php artisan optimize` et `php artisan dtomate:health --strict`.
4. Démarrer un worker persistant : `php artisan queue:work --tries=3 --max-time=3600`; lancer `php artisan schedule:work` ou un cron chaque minute.
5. Vérifier `/up`, les journaux, la réception d’un e-mail de test et la sauvegarde/restauration.

Sur un hébergement mutualisé, n’exécutez pas de worker permanent si l’offre ne le permet pas : configurez plutôt un cron toutes les minutes pour `php artisan schedule:run`. Les index et triggers MySQL des migrations sont automatiquement créés par `php artisan migrate --force`.

Le compte SQL de l’application doit seulement avoir `SELECT`, `INSERT` et les droits nécessaires aux tables transactionnelles ; les triggers de migration bloquent toute mise à jour ou suppression des registres en ajout seul.

## Accès authentifié

Toutes les pages métier et l’API du carnet exigent désormais une session utilisateur. Les visiteurs sont redirigés vers `/login` ; l’API renvoie HTTP 401 sans session, même avec le bon code site. L’inscription publique est fermée. Le code site reste requis pour les opérations qui le demandaient déjà.

Avant de basculer en production, définir un mot de passe personnel pour chaque compte existant avec `php artisan dtomate:set-password adresse@exemple.com`. La commande demande le secret sans l’afficher. Le mot de passe de démonstration `password` est refusé à la connexion. Ne pas relancer les seeders de démonstration en production : ils remplacent les mots de passe existants.

Après livraison du code, exécuter `npm run build`, puis `php artisan optimize:clear` et `php artisan optimize`. Vérifier en navigation privée que `/`, `/carnet`, `/registres`, `/administration` et `/maintenance` mènent à la connexion. Tester connexion, synchronisation du carnet et déconnexion. Les pages privées ne sont plus mises en cache par le service worker ; les anciens caches sont supprimés à son activation et une connexion réseau est requise pour ouvrir une page.


## Mise à jour du socle du 14 septembre 2026

Le paquet `socle-dtomate 3` est intégré à Laravel 13 / React existant. Les écrans Pointage, Administration et Maintenance existants portent les fonctions des ressources Filament du paquet. Ne pas exécuter son installateur Laravel 12 sur cette application, remplacer `.env`, ni réinitialiser la base.

1. Sauvegarder la base, puis exécuter `php artisan migrate --force`. Les quatre nouvelles migrations ajoutent les métadonnées d'import, les conditionnements et les registres historiques avec protection SQL.
2. Exécuter `php artisan test --filter=GardeFous`, `php artisan test --filter=RepriseCarnet` et `php artisan socle:doctor`.
3. Garder le cron et le worker existants. `socle:health` est un alias du battement `dtomate:scheduler-heartbeat`. Un lancement manuel ne prouve pas que le cron fonctionne durablement.

Pour reprendre une sauvegarde exportée du carnet :

```bash
php artisan carnet:import /chemin/sauvegarde.json --site=NTETEMA --dry-run
php artisan carnet:import /chemin/sauvegarde.json --site=NTETEMA
```

L'analyse exécute les mêmes validations dans une transaction annulée, sans données persistées. L'import réel est atomique. Les articles déjà utilisés dans le stock courant provoquent un refus demandant un rapprochement ; les articles de référence sans mouvement sont raccordés à leur identifiant historique. Un fichier identique, même avec `--force`, ne duplique rien. Les données déjà reprises restent inchangées dans les sauvegardes suivantes. Photos et codes d'accès sont ignorés. Les unités ambiguës sont signalées par `needs_unit_review`. Les journaux d'import sont dans `legacy_imports`, les journées dans `legacy_days` et les autres archives dans `legacy_records` ; ils ne remplacent pas les données synchronisées du carnet actuel.

`socle:doctor` vérifie la base, les garde-fous, le cron et la configuration des services. Sans `--mail`, il n'envoie aucun message. Le diagnostic peut signaler le mode debug, l'absence de cron et le transport e-mail de développement sur une installation locale ; configurer ces services au déploiement. Le diagnostic ne configure pas les notifications métier.

## Suivi quotidien des tâches du registre

La migration `2026_10_08_000100_create_daily_task_tracking` ajoute le registre modifiable, les occurrences par zone et cycle, les notifications et les instantanés des rapports. Sur la base locale, une sauvegarde a été créée avant la migration. En production, sauvegarder la base puis exécuter :

```bash
php artisan migrate --force
php artisan tasks:daily import
php artisan optimize:clear
npm run build
```

`tasks:daily import` complète les 137 règles extraites du carnet sans remplacer une modification ou réactiver une règle désactivée. La direction peut ajouter, modifier et désactiver les règles dans **Tâches quotidiennes → Registre des tâches**. L’identité d’une règle reste fixe ; créer une nouvelle règle pour changer de culture ou d’identifiant. Les consignes et attributions déjà générées restent historisées. Les changements de cycle et de date de départ dans le carnet sont réservés à la direction par le serveur ; les agents conservent la mise à jour des effectifs.

Le registre source est `dt:reg:cultures`, synchronisé dans `carnet_records`. Il ne faut pas utiliser `legacy_records` ou les valeurs du navigateur comme source de production. Si le registre n’existe pas, la génération échoue explicitement : ouvrir et synchroniser le carnet avec un compte direction. Le carnet historique correspond à un seul site : `DTOMATE_TASK_SITE_CODE=NTETEMA`. Configurer ce code si le site a été renommé.

Après synchronisation, exécuter `php artisan tasks:daily generate` ou **Actualiser depuis le registre**. Les zones du carnet absentes du socle sont créées au même site. Définir les responsables dans **Responsables de zone**, puis attribuer les tâches déjà générées : le responsable automatique s’applique aux prochaines occurrences. Sans responsable actif du même site, la tâche reste non attribuée, visible par sa hiérarchie et signalée dans les rappels et rapports. Aucun agent n’est choisi au hasard. Les superviseurs gèrent leur département ; la direction gère tout le site. Seul l’agent effectivement attribué peut déposer la réponse.

Chaque tâche quotidienne ou récurrente possède une occurrence par date ; une tâche ponctuelle possède une occurrence par cycle et garde sa date limite de fenêtre. Les périodes démarrent à l’âge minimum, puis reviennent tous les N jours. Un retard ne décale pas le calendrier suivant. Une occurrence non répondue reste visible et rappelée. La première activation démarre aujourd’hui : elle ne fabrique pas rétroactivement toutes les journées précédentes. Les tâches ponctuelles oubliées sont toutefois émises avec leur échéance dépassée. Après activation, les dates manquées sont rattrapées à partir de la dernière génération, en utilisant les révisions historiques du registre lorsqu’elles existent. Sans source historique, le rattrapage s’arrête avec un message d’erreur plutôt que d’inventer les cultures présentes ce jour-là. Les règles modifiées s’appliquent aux générations suivantes, y compris un rattrapage ; faire revoir tout rattrapage après modification du calendrier.

Les anciennes déclarations « FAIT » sans preuve ne sont pas transformées en nouvelles exécutions validées. La direction doit rapprocher les tâches ponctuelles historiques et leurs justificatifs. Le carnet affiche désormais les réponses du serveur et renvoie vers le dépôt de preuves.

Les tâches exécutées exigent 1 à 5 photos JPEG, PNG ou WebP, jusqu’à 10 Mo chacune. Les photos sont stockées sur le disque privé `local`, sous `storage/app/private/task-evidence`, et servies par une route authentifiée qui vérifie le site et la responsabilité. Sauvegarder ce dossier avec la base. Sur plusieurs serveurs, il faut un volume privé partagé. Ajuster les limites PHP et du proxy : `upload_max_filesize=10M`, `post_max_size=64M`. Une non-exécution exige un motif fermé et une explication d’au moins 10 caractères ; les photos y sont facultatives. Une justification est comptée séparément et n’est jamais une exécution. Une preuve déposée passe au statut **Preuve à valider**. Un autre responsable actif du même site doit examiner les photos et confirmer explicitement leur examen : direction, ou superviseur du département. L’agent et l’auteur de la preuve ne peuvent pas se valider eux-mêmes. Un refus exige une explication d’au moins 10 caractères, notifie l’agent et lui permet de déposer une nouvelle preuve ou de justifier une non-exécution. Les anciennes photos et décisions restent privées et consultables dans l’historique. Une exécution validée et une justification restent définitives ; une reprise crée une nouvelle tâche. La migration `2026_10_08_000200_add_task_proof_review` remet les déclarations avec photo antérieures en attente de revue humaine. Si leur journée était clôturée, suivre la procédure de réouverture approuvée par la direction. Une journée ne peut plus être clôturée avec des tâches échues sans réponse, en correction ou en attente de validation.

Le planificateur utilise **le fuseau du site agricole** `DTOMATE_TZ` (par défaut `Africa/Lubumbashi`), indépendant du fuseau système ou de l’utilisateur. Horaires configurables :

```dotenv
DTOMATE_TASK_SITE_CODE=NTETEMA
DTOMATE_TASK_DEADLINE=17:00
DTOMATE_TASK_MORNING=06:00
DTOMATE_TASK_AFTERNOON=14:00
DTOMATE_TASK_REVIEW=17:30
DTOMATE_TASK_REPORT=18:00
```

Génération quotidienne à 05:45 ; rappel le matin et l’après-midi, revue des preuves par les responsables à 17:30 ; rapport du soir aux comptes direction actifs du site. Toute attribution envoie une notification dans l’application et un mail. Les notifications du soir conservent le rapport préparé : tâches par zone, responsables, exécutions validées avec nom du validateur, preuves à examiner, corrections demandées, tâches non exécutées, justifications et recommandations de suivi (attribution, stock, maintenance, météo, sécurité, accès). Les preuves restent privées et sont consultables depuis le lien vers les tâches. Les recommandations sont des règles de suivi des blocages ; les consignes agronomiques restent à valider par le responsable de culture.

Configurer un vrai transport mail, les adresses des comptes, `APP_URL` en HTTPS, le cron chaque minute et un worker avec `QUEUE_CONNECTION=database`. Un transport `log` ou `array` n’envoie pas de mail réel. Ne pas garder `QUEUE_CONNECTION=sync` en production : une panne SMTP pourrait perturber les requêtes d’attribution. Le worker peut être lancé avec `php artisan queue:work --tries=3 --max-time=3600`. Les essais automatiques utilisent des notifications simulées et ne démontrent pas la réception réelle d’un mail.

Les notifications dans l’application survivent à une panne SMTP et ne sont pas dupliquées lors de la relance. L’envoi mail fonctionne avec reprise, sans garantie absolue d’unicité si le processus tombe après acceptation du mail par le transport mais avant confirmation en base. Après une panne prolongée, examiner `php artisan queue:failed` et relancer les jobs concernés avec `php artisan queue:retry ID`. Un nouveau lancement de `tasks:daily report` reprend aussi les envois en attente pour la date indiquée et conserve l’instantané initial. Le planificateur ne renvoie pas automatiquement tous les anciens rapports non préparés : lancer `php artisan tasks:daily report --date=YYYY-MM-DD` pour une journée manquée après contrôle de sa source historique. Même principe pour les rappels : `php artisan tasks:daily remind --slot=afternoon`. Le rapport envoyé n’est pas une clôture comptable ; les corrections ultérieures restent visibles dans le suivi courant.

Recommandation d’exploitation : désigner un responsable et un remplaçant organisationnel pour chaque zone, contrôler les photos chaque soir, puis utiliser **Reprogrammer et notifier** pour les reprises des tâches justifiées. Une seule reprise ouverte est autorisée par tâche ; une reprise crée une nouvelle occurrence liée à la précédente ; la justification initiale reste conservée. Les réponses pour une date future sont refusées. Aucune justification ne doit être utilisée pour remettre implicitement une tâche au statut exécuté.

Les nouvelles preuves sont converties en WebP avant stockage : qualité 85 et côté maximum de 2 560 pixels, sans agrandissement ni recadrage. Les JPEG sont réorientés selon EXIF ; la transparence PNG est conservée. Le serveur ne conserve que le WebP pour chaque dépôt. Les anciennes preuves et les différentes versions de correction restent dans l’historique. Configurer `DTOMATE_TASK_PHOTO_QUALITY` (75–100) et `DTOMATE_TASK_PHOTO_MAX_EDGE` (640–4096) si nécessaire. Activer les extensions PHP GD avec support WebP et EXIF en production ; prévoir `memory_limit=512M` pour traiter les grandes photos de téléphone, avec suffisamment de RAM pour les requêtes simultanées. Les images trop volumineuses pour la mémoire disponible sont refusées avec un message explicite, sans conserver de dépôt incomplet.
