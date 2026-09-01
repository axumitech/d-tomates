<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\WorkOrder;
use App\Services\MaintenanceScheduler;
use Illuminate\Console\Command;

final class EmitMaintenance extends Command
{
    protected $signature = 'maintenance:emit {--dry-run : Liste les plans échus sans rien créer}';

    protected $description = "Émet les bons de travail préventifs dont l'échéance est atteinte";

    public function handle(MaintenanceScheduler $scheduler): int
    {
        if ($this->option('dry-run')) {
            $plans = $scheduler->duePlans();

            $this->table(
                ['Bien', 'Plan', 'Échéance', 'Retard (j)'],
                $plans->map(fn ($p): array => [
                    $p->asset->code,
                    $p->name,
                    $p->next_due_on?->toDateString() ?? ($p->next_due_meter.' '.$p->asset->meter_unit),
                    $p->overdueDays(),
                ])->all(),
            );

            return self::SUCCESS;
        }

        $r = $scheduler->emit();

        $this->info(sprintf(
            '%d bon(s) émis, %d plan(s) ignorés car déjà ouverts. %s',
            $r['emis'],
            $r['ignores'],
            $r['references'] === [] ? '' : implode(', ', $r['references']),
        ));

        $retard = WorkOrder::query()->overdue()->count();

        if ($retard > 0) {
            $this->warn($retard.' bon(s) de travail dépassent leur délai d\'intervention.');
        }

        return self::SUCCESS;
    }
}
