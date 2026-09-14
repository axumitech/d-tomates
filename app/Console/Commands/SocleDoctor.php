<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Asset;
use App\Models\Item;
use App\Models\MaintenancePlan;
use App\Models\Requisition;
use App\Models\Site;
use App\Models\StockMovement;
use App\Models\User;
use App\Support\ServerClock;
use App\Support\UnitConverter;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Diagnostic complet de l'installation.
 *
 *   php artisan socle:doctor
 *   php artisan socle:doctor --mail=adresse@exemple.com   (envoi réel de test)
 *
 * Chaque contrôle répond VERT, ORANGE ou ROUGE, avec la commande exacte à
 * lancer pour corriger. Aucune interprétation à faire : on lit et on applique.
 *
 * Sort en code 1 si au moins un contrôle est ROUGE, pour que install.sh
 * puisse s'arrêter dessus.
 */
final class SocleDoctor extends Command
{
    protected $signature = 'socle:doctor {--mail= : Envoie un e-mail de test à cette adresse}';

    protected $description = "Vérifie que l'installation est complète et opérationnelle";

    private int $rouges = 0;

    private int $oranges = 0;

    public function handle(): int
    {
        $this->rouges = 0;
        $this->oranges = 0;
        $this->newLine();
        $this->line('  <options=bold>DIAGNOSTIC DU CARNET D\'TOMATE</>');
        $this->line('  '.ServerClock::now()->format('d/m/Y H:i').' — '.config('dtomate.site'));
        $this->newLine();

        $this->section('Environnement');
        $this->verifier('Version de PHP', version_compare(PHP_VERSION, '8.3.0', '>='),
            PHP_VERSION, 'sudo apt install -y php8.3-cli');
        $this->verifier('Fuseau horaire', config('app.timezone') === config('dtomate.timezone'),
            config('app.timezone'), 'Mettre APP_TIMEZONE='.config('dtomate.timezone').' dans .env', true);
        $this->verifier('Mode débogage désactivé', ! config('app.debug'),
            config('app.debug') ? 'APP_DEBUG=true — expose les erreurs aux visiteurs' : 'APP_DEBUG=false',
            'Mettre APP_DEBUG=false dans .env');
        $this->verifier('Clé d\'application', ! empty(config('app.key')),
            empty(config('app.key')) ? 'absente' : 'définie', 'php artisan key:generate');

        $this->section('Base de données');
        try {
            DB::connection()->getPdo();
            $this->verifier('Connexion', true, DB::connection()->getDatabaseName(), '');
        } catch (Throwable $e) {
            $this->verifier('Connexion', false, $e->getMessage(), 'Vérifier DB_* dans .env');

            return $this->conclure();
        }

        $tables = ['sites', 'departments', 'cost_centres', 'zones', 'users', 'units', 'items',
            'packagings', 'stock_movements', 'audit_logs', 'attendances', 'assets',
            'maintenance_plans', 'work_orders', 'work_order_parts', 'work_order_labour',
            'work_order_events', 'meter_readings', 'sequences', 'legacy_days', 'legacy_records', 'legacy_imports'];
        $absentes = array_values(array_filter($tables, fn (string $t): bool => ! Schema::hasTable($t)));
        $this->verifier('Tables créées', $absentes === [],
            $absentes === [] ? count($tables).' tables' : 'manquantes : '.implode(', ', $absentes),
            'php artisan migrate --force');

        if ($absentes !== []) {
            return $this->conclure();
        }

        $this->section('Données de départ');
        $this->verifier('Site', Site::query()->exists(),
            (string) (Site::query()->value('name') ?? 'aucun'),
            'php artisan db:seed --class=Database\\\\Seeders\\\\DatabaseSeeder');
        $this->verifier('Équipe', User::query()->count() >= 2,
            User::query()->count().' compte(s)', 'Même commande que ci-dessus');
        $this->verifier('Direction active', User::query()->where('role', 'direction')->get()->contains(fn (User $user): bool => $user->isActive()),
            'compte de Direction', 'Créer un compte Direction : sans lui, personne ne peut administrer');
        $this->verifier('Catalogue d\'articles', Item::query()->count() > 0,
            Item::query()->count().' article(s)', 'Même commande que ci-dessus');
        $this->verifier('Parc matériel', Asset::query()->count() > 0,
            Asset::query()->count().' bien(s) · '.MaintenancePlan::query()->count().' plan(s)',
            'php artisan db:seed --class=Database\\\\Seeders\\\\MaintenanceSeeder', true);

        $this->section('Garde-fous');
        $this->verifierImmuabilite();
        $this->verifierUnites();
        $this->verifierDelegation();

        $this->section('Services');
        $this->verifierOrdonnanceur();
        $this->verifierFile();
        $this->verifierMail();

        $this->section('Écriture sur disque');
        foreach (['storage/logs', 'storage/framework', 'bootstrap/cache'] as $d) {
            $this->verifier($d, is_writable(base_path($d)),
                is_writable(base_path($d)) ? 'accessible' : 'lecture seule',
                'chmod -R ug+rwX storage bootstrap/cache');
        }

        return $this->conclure();
    }

    private function verifierImmuabilite(): void
    {
        $mouvement = DB::table('stock_movements')->first();

        if ($mouvement === null) {
            $this->verifier('Registres en ajout seul', true, 'aucun mouvement à tester — contrôle reporté', '', true);

            return;
        }

        DB::beginTransaction();
        try {
            StockMovement::query()->first()?->update(['reason' => 'test']);
            $this->verifier('Registres en ajout seul', false, 'UNE MODIFICATION A ÉTÉ ACCEPTÉE', 'Vérifier le trait AppendOnly');
        } catch (\RuntimeException $e) {
            $refus = str_contains($e->getMessage(), 'Registre en ajout seul');
            $this->verifier('Registres en ajout seul', $refus, $e->getMessage(), 'Vérifier le trait AppendOnly');
        } finally {
            DB::rollBack();
        }
    }

    private function verifierUnites(): void
    {
        $article = Item::query()->where('dimension', 'mass')->first();

        if ($article === null) {
            $this->verifier('Contrôle des unités', true, 'aucun article en masse — contrôle reporté', '', true);

            return;
        }

        try {
            UnitConverter::toBase($article, 'l', 1);
            $this->verifier('Contrôle des unités', false,
                'DES LITRES ONT ÉTÉ ACCEPTÉS SUR UN ARTICLE EN KILOS',
                'UnitConverter ne contrôle pas la dimension — signaler immédiatement');
        } catch (\InvalidArgumentException $e) {
            $this->verifier('Contrôle des unités', str_contains($e->getMessage(), 'Unité incompatible'), $e->getMessage(), 'Vérifier les unités de base');
        }
    }

    private function verifierDelegation(): void
    {
        $sup = User::query()->where('role', 'superviseur')->first();

        if ($sup === null) {
            $this->verifier('Délégation d\'autorité', true, 'aucun superviseur — contrôle reporté', '', true);

            return;
        }

        $demande = new Requisition(['requested_by' => $sup->id, 'amount_cents' => 1000]);
        $sienne = Gate::forUser($sup)->allows('approve-requisition', $demande);

        $autre = new Requisition(['requested_by' => $sup->id + 9999, 'amount_cents' => 1000]);
        $possible = Gate::forUser($sup)->allows('approve-requisition', $autre);

        $this->verifier('Nul n\'approuve sa propre demande', ! $sienne && $possible,
            $sienne ? 'IL PEUT APPROUVER LA SIENNE' : 'refusé sur la sienne, permis sur celle d\'un autre',
            'Enregistrer DtomateServiceProvider dans bootstrap/providers.php');
    }

    private function verifierOrdonnanceur(): void
    {
        $battement = Cache::get('dtomate.scheduler.last_beat');

        if ($battement === null) {
            $this->verifier('Ordonnanceur (cron)', false, 'aucun battement enregistré',
                'crontab -e puis : * * * * * cd '.base_path().' && php artisan schedule:run >> /dev/null 2>&1');

            return;
        }

        $minutes = ServerClock::now()->diffInMinutes(CarbonImmutable::parse($battement), true);
        $this->verifier('Ordonnanceur (cron)', $minutes <= 10,
            'dernier battement il y a '.(int) $minutes.' min',
            'Le cron ne tourne plus. Sans lui, aucune escalade ne part.');
    }

    private function verifierFile(): void
    {
        $connexion = config('queue.default');

        if ($connexion === 'sync') {
            $this->verifier('File d\'attente', false, 'QUEUE_CONNECTION=sync',
                'Mettre QUEUE_CONNECTION=database dans .env — sinon un envoi lent bloque la saisie');

            return;
        }

        if ($connexion === 'database' && ! Schema::hasTable('jobs')) {
            $this->verifier('File d\'attente', false, 'table jobs absente',
                'php artisan queue:table && php artisan migrate --force');

            return;
        }

        $enAttente = Schema::hasTable('jobs') ? DB::table('jobs')->count() : 0;
        $echoues = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;

        $this->verifier('File d\'attente', $echoues === 0,
            $connexion.' · '.$enAttente.' en attente · '.$echoues.' échoué(s)',
            'php artisan queue:failed puis php artisan queue:retry all', $echoues > 0 && $echoues < 5);

        if ($enAttente > 20) {
            $this->verifier('Ouvrier de file', false, $enAttente.' tâches s\'accumulent',
                'L\'ouvrier ne tourne pas : php artisan queue:work --tries=3');
        }
    }

    private function verifierMail(): void
    {
        $pilote = config('mail.default');

        if ($pilote === 'log' || $pilote === 'array') {
            $this->verifier('Envoi d\'e-mail', false, 'MAIL_MAILER='.$pilote.' — rien ne part réellement',
                'Configurer MAIL_* avec le service d’envoi retenu');

            return;
        }

        $expediteur = config('mail.from.address');
        $this->verifier('Adresse d\'expédition', ! empty($expediteur) && $expediteur !== 'hello@example.com',
            (string) $expediteur, 'Renseigner MAIL_FROM_ADDRESS dans .env');

        $destinataire = $this->option('mail');

        if ($destinataire === null) {
            $this->verifier('Envoi réel', true,
                $pilote.' configuré — relancer avec --mail=adresse pour tester pour de vrai', '', true);

            return;
        }

        try {
            Mail::raw(
                "Test d'envoi du Carnet D'Tomate.\n\nCe message vérifie uniquement le transport des e-mails.\n"
                .'Envoyé le '.ServerClock::now()->format('d/m/Y à H:i').'.',
                fn ($m) => $m->to($destinataire)->subject('Test — Carnet D\'Tomate'),
            );
            $this->verifier('Envoi réel', true, 'message remis au service pour '.$destinataire,
                'Vérifiez la boîte de réception ET le dossier indésirables');
        } catch (Throwable $e) {
            $this->verifier('Envoi réel', false, mb_substr($e->getMessage(), 0, 120),
                'Vérifier MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD dans .env');
        }
    }

    private function section(string $titre): void
    {
        $this->newLine();
        $this->line('  <fg=cyan;options=bold>'.mb_strtoupper($titre).'</>');
    }

    private function verifier(string $libelle, bool $ok, string $valeur, string $remede, bool $orangeSiFaux = false): void
    {
        if ($ok) {
            $this->line(sprintf('  <fg=green>✓</> %-34s %s', $libelle, $valeur));

            return;
        }

        if ($orangeSiFaux) {
            $this->oranges++;
            $this->line(sprintf('  <fg=yellow>!</> %-34s %s', $libelle, $valeur));
        } else {
            $this->rouges++;
            $this->line(sprintf('  <fg=red>✗</> %-34s %s', $libelle, $valeur));
        }

        if ($remede !== '') {
            $this->line('      <fg=gray>→ '.$remede.'</>');
        }
    }

    private function conclure(): int
    {
        $this->newLine();

        if ($this->rouges === 0 && $this->oranges === 0) {
            $this->line('  <fg=green;options=bold>TOUT EST EN ORDRE.</> Le système est opérationnel.');
            $this->newLine();

            return self::SUCCESS;
        }

        if ($this->rouges === 0) {
            $this->line('  <fg=yellow;options=bold>'.$this->oranges.' point(s) à surveiller</>, rien de bloquant.');
            $this->newLine();

            return self::SUCCESS;
        }

        $this->line('  <fg=red;options=bold>'.$this->rouges.' point(s) bloquant(s)</>'
            .($this->oranges > 0 ? ' et '.$this->oranges.' à surveiller.' : '.'));
        $this->line('  Recopiez les lignes rouges ci-dessus dans la conversation.');
        $this->newLine();

        return self::FAILURE;
    }
}
