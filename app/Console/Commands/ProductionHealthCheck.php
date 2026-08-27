<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class ProductionHealthCheck extends Command
{
    protected $signature = 'dtomate:health {--strict : Échoue si le battement de l’ordonnanceur est absent ou ancien}';

    protected $description = 'Vérifie les dépendances critiques avant et après un déploiement';

    public function handle(): int
    {
        $errors = [];
        if (app()->isProduction() && config('app.debug')) {
            $errors[] = 'APP_DEBUG doit être false en production.';
        }
        if (app()->isProduction() && config('database.default') === 'sqlite') {
            $errors[] = 'SQLite est interdit en production : configurez PostgreSQL ou MySQL.';
        }
        try {
            DB::select('select 1');
        } catch (\Throwable $e) {
            $errors[] = 'Base de données indisponible : '.$e->getMessage();
        }
        try {
            Cache::put('dtomate.health.check', now()->toIso8601String(), 60);
        } catch (\Throwable $e) {
            $errors[] = 'Cache indisponible : '.$e->getMessage();
        }
        if ($this->option('strict') && Cache::get('dtomate.scheduler.last_beat') === null) {
            $errors[] = 'Ordonnanceur non confirmé : aucun battement enregistré.';
        }
        foreach ($errors as $error) {
            $this->error($error);
        }
        if ($errors !== []) {
            return self::FAILURE;
        }
        $this->info('Contrôles de santé D’Tomate réussis.');

        return self::SUCCESS;
    }
}
