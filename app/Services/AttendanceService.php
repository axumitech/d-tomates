<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\AttendanceStatus;
use App\Models\Attendance;
use App\Models\Site;
use App\Models\User;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class AttendanceService
{
    /**
     * Pointe un agent pour une journée. Idempotent : repointer le même agent
     * le même jour met à jour la ligne au lieu d'en créer une seconde.
     */
    public function record(
        Site $site,
        CarbonImmutable $workDate,
        User $agent,
        AttendanceStatus $status,
        float $hours = 8.0,
        ?User $recordedBy = null,
        ?string $note = null,
    ): Attendance {
        if (ServerClock::workDateNeedsApproval($workDate)) {
            throw new RuntimeException(sprintf(
                'Pointage du %s : au-delà de %d h d\'antériorité, ou dans le futur. Une approbation est requise.',
                $workDate->toDateString(),
                (int) config('dtomate.backdate_tolerance_hours', 24),
            ));
        }

        if (! $agent->isActive()) {
            throw new RuntimeException(sprintf(
                '%s ne fait plus partie de l\'effectif depuis le %s : il ne peut plus être pointé.',
                $agent->name,
                $agent->employed_until?->toDateString() ?? '?',
            ));
        }

        $heures = $status->isWorking() ? max(0.0, min(24.0, $hours)) : 0.0;
        $taux = (int) ($agent->daily_rate_cents ?? 0);

        return DB::transaction(function () use ($site, $workDate, $agent, $status, $heures, $taux, $note, $recordedBy): Attendance {
            $attendance = Attendance::query()
                ->where('site_id', $site->id)
                ->whereDate('work_date', $workDate->toDateString())
                ->where('user_id', $agent->id)
                ->lockForUpdate()
                ->first() ?? new Attendance([
                    'site_id' => $site->id,
                    'work_date' => $workDate->toDateString(),
                    'user_id' => $agent->id,
                ]);

            $taux = $attendance->exists ? (int) $attendance->daily_rate_cents : $taux;
            $attendance->fill([
                'status' => $status,
                'hours' => $heures,
                'daily_rate_cents' => $taux,
                'cost_cents' => (int) round(($heures / 8) * $taux),
                'note' => $note,
                'recorded_by' => $recordedBy?->id,
            ])->save();

            return $attendance;
        });
    }

    /**
     * Les agents effectivement présents ce jour-là, sur tout le site.
     *
     * C'est la source unique pour les listes « qui a fait le travail » de
     * TOUS les modules : serre, bananeraie, poulailler, magasin. Le pointage
     * se fait une fois et vaut partout.
     *
     * @return Collection<int,User>
     */
    public function presentOn(Site $site, CarbonImmutable $workDate): Collection
    {
        return User::query()
            ->whereIn('id', Attendance::query()
                ->where('site_id', $site->id)
                ->whereDate('work_date', $workDate->toDateString())
                ->working()
                ->pluck('user_id'))
            ->orderBy('name')
            ->get();
    }

    /** Un agent était-il pointé présent ce jour-là ? Sert au contrôle de cohérence. */
    public function wasPresent(Site $site, CarbonImmutable $workDate, User $agent): bool
    {
        return Attendance::query()
            ->where('site_id', $site->id)
            ->whereDate('work_date', $workDate->toDateString())
            ->where('user_id', $agent->id)
            ->working()
            ->exists();
    }

    /** Coût de main-d'œuvre du site pour la journée, en centimes. */
    public function labourCostCents(Site $site, CarbonImmutable $workDate): int
    {
        return (int) Attendance::query()
            ->where('site_id', $site->id)
            ->whereDate('work_date', $workDate->toDateString())
            ->sum('cost_cents');
    }

    /** Agents actifs non encore pointés : ce qui empêche de clôturer la journée. */
    public function missingOn(Site $site, CarbonImmutable $workDate): Collection
    {
        $pointes = Attendance::query()
            ->where('site_id', $site->id)
            ->whereDate('work_date', $workDate->toDateString())
            ->pluck('user_id');

        return User::query()
            ->where('site_id', $site->id)
            ->where(fn ($query) => $query->whereNull('employed_from')->orWhereDate('employed_from', '<=', $workDate->toDateString()))
            ->where(fn ($query) => $query->whereNull('employed_until')->orWhereDate('employed_until', '>=', $workDate->toDateString()))
            ->whereNotIn('id', $pointes)
            ->orderBy('name')
            ->get();
    }
}
