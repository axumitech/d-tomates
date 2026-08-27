# Déploiement D'Tomate

La production cible un hébergement MySQL 8.0+ avec HTTPS. Activez `utf8mb4` / `utf8mb4_unicode_ci` afin de conserver correctement les accents, les symboles et les données du Carnet. Ne copiez jamais `.env` ou un secret dans Git.

1. Créer les secrets à partir de `.env.production.example`, avec `APP_DEBUG=false` et `DTOMATE_ALLOW_REGISTRATION=false`.
2. Installer les dépendances et compiler : `composer install --no-dev --optimize-autoloader`, puis `npm ci && npm run build`.
3. Exécuter `php artisan migrate --force`, `php artisan storage:link`, `php artisan optimize` et `php artisan dtomate:health --strict`.
4. Démarrer un worker persistant : `php artisan queue:work --tries=3 --max-time=3600`; lancer `php artisan schedule:work` ou un cron chaque minute.
5. Vérifier `/up`, les journaux, la réception d’un e-mail de test et la sauvegarde/restauration.

Sur un hébergement mutualisé, n’exécutez pas de worker permanent si l’offre ne le permet pas : configurez plutôt un cron toutes les minutes pour `php artisan schedule:run`. Les index et triggers MySQL des migrations sont automatiquement créés par `php artisan migrate --force`.

Le compte SQL de l’application doit seulement avoir `SELECT`, `INSERT` et les droits nécessaires aux tables transactionnelles ; les triggers de migration bloquent toute mise à jour ou suppression des registres en ajout seul.
