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
