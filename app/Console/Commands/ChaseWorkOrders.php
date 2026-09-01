<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\WorkOrder;
use App\Support\ServerClock;
use Illuminate\Console\Command;

/**
 * Relance des bons en retard. Le délai vient de la criticité du bien :
 * 4 h pour un bien vital, 24 h pour un bien important, 72 h sinon.
 *
 * Les envois réels (WhatsApp, e-mail) se branchent ici au lot 7. Tant qu'ils
 * n'existent pas, la commande écrit au journal : ne pas confondre une trace
 * avec une notification.
 */
final class ChaseWorkOrders extends Command
{
    protected $signature = 'maintenance:chase';

    protected $description = 'Relève les bons de travail en retard et prépare les relances';

    public function handle(): int
    {
        $retard = WorkOrder::query()->with(['asset', 'assignedTo'])->overdue()->get();

        if ($retard->isEmpty()) {
            $this->info('Aucun bon de travail en retard.');

            return self::SUCCESS;
        }

        foreach ($retard as $wo) {
            $heures = $wo->due_at?->diffInHours(ServerClock::now()) ?? 0;

            $this->warn(sprintf('%s — %s — %s — %d heure(s) de retard — %s',
                $wo->reference,
                $wo->asset->name,
                $wo->criticality->label(),
                $heures,
                $wo->assignedTo?->name ?? 'non assigné',
            ));

            // Lot 7 : envoi réel au responsable, puis à la Direction au-delà de 5 jours.
        }

        $this->error($retard->count().' bon(s) en retard, dont '
            .$retard->where('criticality.value', 'vital')->count().' sur bien vital.');

        return self::SUCCESS;
    }
}
