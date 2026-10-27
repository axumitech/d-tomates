<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Attendance;
use App\Models\CarnetRecord;
use App\Models\Item;
use App\Models\Task;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;

final class DailyTaskReport
{
    /** @return array<string, mixed> */
    public function snapshot(CarbonImmutable $date, int $siteId): array
    {
        $tasks = Task::query()->with(['zone', 'assignee', 'reviewer', 'events', 'template'])->where('site_id', $siteId)
            ->where('origin', 'crop_registry')->whereDate('work_date', '<=', $date)
            ->where(fn ($q) => $q->whereDate('work_date', $date)->orWhereIn('status', Task::OPEN_STATUSES)->orWhereBetween('closed_at', [$date->startOfDay()->utc(), $date->endOfDay()->utc()]))
            ->orderBy('work_date')->orderBy('zone_id')->get();
        $lines = ['État observé le '.ServerClock::now()->format('d/m/Y H:i').' ('.config('dtomate.timezone').').', 'Rapport des tâches du '.$date->format('d/m/Y').'. Les tâches sans réponse des jours précédents restent incluses.'];
        foreach ($tasks->groupBy('zone_id') as $zoneTasks) {
            $lines[] = 'ZONE : '.($zoneTasks->first()->zone->name ?? 'Zone non renseignée');
            foreach ($zoneTasks as $task) {
                $status = match ($task->status) {
                    Task::DONE => 'EXÉCUTÉE / VALIDÉE — '.count($task->evidence['photos'] ?? []).' photo(s) — par '.($task->reviewer->name ?? 'responsable').' le '.$task->reviewed_at?->setTimezone((string) config('dtomate.timezone'))->format('d/m/Y H:i'),
                    Task::PENDING_REVIEW => 'EXÉCUTION DÉCLARÉE / PREUVE À VALIDER — '.count($task->evidence['photos'] ?? []).' photo(s)',
                    Task::CORRECTION_REQUESTED => 'EXÉCUTION NON VALIDÉE / CORRECTION DEMANDÉE — '.$task->review_note,
                    Task::JUSTIFIED => 'NON EXÉCUTÉE / JUSTIFIÉE — '.$task->non_completion_reason.' : '.$task->justification,
                    Task::UNJUSTIFIED => 'NON EXÉCUTÉE / SANS JUSTIFICATION',
                    default => 'NON EXÉCUTÉE / SANS RÉPONSE',
                };
                $lines[] = $task->title.' — '.($task->assignee->name ?? 'NON ATTRIBUÉE').' — échéance '.$task->deadlineAtSite()->format('d/m/Y H:i').' — '.$status;
                if ($task->submitted_at !== null) {
                    $lines[] = 'Preuve déposée le '.$task->submitted_at->setTimezone((string) config('dtomate.timezone'))->format('d/m/Y H:i').'.';
                }
                foreach ($task->events->where('event', 'replanned') as $reprise) {
                    $lines[] = 'Reprise programmée pour le '.$reprise->payload['work_date'].'.';
                }
                if ($task->completion_note) {
                    $lines[] = 'Observation : '.$task->completion_note;
                }
            }
        }
        $done = $tasks->where('status', Task::DONE)->count();
        $pendingReview = $tasks->where('status', Task::PENDING_REVIEW)->count();
        $corrections = $tasks->where('status', Task::CORRECTION_REQUESTED)->count();
        $justified = $tasks->where('status', Task::JUSTIFIED)->count();
        $unanswered = $tasks->whereIn('status', [Task::TODO, Task::UNJUSTIFIED])->count();
        $unassigned = $tasks->whereNull('assigned_to')->count();
        $recommendations = [];
        $invalidAssignees = $tasks->filter(fn (Task $task): bool => $task->isOutstanding() && $task->assigned_to !== null && ($task->assignee === null || ! $task->assignee->isActive() || $task->assignee->site_id !== $siteId))->count();
        if ($invalidAssignees > 0) {
            $recommendations[] = 'Réattribuer les '.$invalidAssignees.' tâche(s) dont le responsable est devenu inactif ou a changé de site.';
        }
        $reviewers = User::query()->where('site_id', $siteId)->get();
        $withoutReviewer = $tasks->where('status', Task::PENDING_REVIEW)->filter(fn (Task $task): bool => ! $reviewers->contains(fn (User $user): bool => app(TaskReviewService::class)->canReview($user, $task)))->count();
        if ($withoutReviewer > 0) {
            $recommendations[] = 'Désigner un autre responsable habilité pour examiner les '.$withoutReviewer.' preuve(s) sans validateur disponible ; aucune auto-validation n’est autorisée.';
        }
        if ($pendingReview > 0) {
            $recommendations[] = 'Examiner les '.$pendingReview.' preuve(s) en attente : elles ne comptent pas encore comme des exécutions validées.';
        }
        if ($corrections > 0) {
            $recommendations[] = 'Faire corriger les '.$corrections.' preuve(s) refusées en précisant ce qui manque ; conserver la première preuve dans l’historique.';
        }
        if ($unassigned) {
            $recommendations[] = "Attribuer les {$unassigned} tâche(s) sans responsable et définir un responsable de zone pour les prochains jours.";
        }
        if ($unanswered) {
            $recommendations[] = "Obtenir une preuve ou une justification pour les {$unanswered} tâche(s) sans réponse ; prioriser les échéances dépassées avec le responsable.";
        }
        foreach ($tasks->where('status', Task::JUSTIFIED)->groupBy('non_completion_reason') as $reason => $group) {
            $recommendations[] = match ($reason) {
                'stockout' => 'Vérifier les stocks et faire valider le réapprovisionnement avant de reprogrammer les tâches bloquées.',
                'equipment_failure' => 'Ouvrir ou vérifier le bon de maintenance, puis reprogrammer après remise en service.',
                'weather' => 'Faire confirmer une nouvelle date adaptée aux conditions par le responsable de culture.',
                'safety_incident' => 'Faire vérifier les conditions de sécurité avant toute reprise.',
                'zone_access' => 'Lever le blocage d’accès avec le responsable de zone.',
                default => 'Faire valider la nouvelle consigne et la reprogrammation par le responsable.',
            };
        }
        $record = CarnetRecord::query()->where('storage_key', 'dt:reg:cultures')->first();
        if ($record === null) {
            $recommendations[] = 'Registre des cultures absent : ce rapport ne garantit pas la couverture du calendrier. Synchroniser le carnet.';
        } else {
            foreach (json_decode($record->value, true, 512, JSON_THROW_ON_ERROR) as $zone => $culture) {
                if ($culture['aConfirmer'] ?? false) {
                    $recommendations[] = $zone.' : confirmer la date de départ ; le calendrier est encore approximatif.';
                }
                if (! TaskTemplate::query()->where('crop_type', $culture['type'])->where('is_active', true)->exists()) {
                    $recommendations[] = $zone.' : aucune règle active pour '.$culture['type'].'. Compléter le registre.';
                }
            }
        }
        if ($tasks->isEmpty()) {
            $lines[] = 'Aucune tâche enregistrée pour cette journée.';
        }
        $lines[] = "BILAN : {$tasks->count()} tâche(s), {$done} exécution(s) validée(s), {$pendingReview} preuve(s) à examiner, {$corrections} correction(s) demandée(s), {$justified} non exécutée(s) justifiée(s), {$unanswered} sans réponse ou sans justification, {$unassigned} non attribuée(s).";
        $lines[] = 'RECOMMANDATIONS DE SUIVI';
        foreach (array_unique($recommendations) as $recommendation) {
            $lines[] = $recommendation;
        }
        if ($recommendations === []) {
            $lines[] = 'Contrôler les preuves déposées et préparer les attributions du lendemain.';
        }

        $details = $lines;
        $categories = [];
        foreach ($tasks->groupBy(fn (Task $task) => $task->template->category ?? 'Autres') as $category => $group) {
            $categories[] = [
                'name' => $category, 'total' => $group->count(),
                'done' => $group->where('status', Task::DONE)->count(),
                'pending' => $group->where('status', Task::PENDING_REVIEW)->count(),
                'not_done' => $group->whereNotIn('status', [Task::DONE, Task::PENDING_REVIEW])->count(),
                'tasks' => $group->map(fn (Task $task) => [
                    'id' => $task->id, 'title' => $task->title, 'status' => $task->status,
                    'zone' => $task->zone?->name, 'assignee' => $task->assignee?->name,
                ])->values()->all(),
            ];
        }
        $staff = User::query()->where('site_id', $siteId)
            ->where(fn ($q) => $q->whereNull('employed_from')->orWhereDate('employed_from', '<=', $date))
            ->where(fn ($q) => $q->whereNull('employed_until')->orWhereDate('employed_until', '>=', $date))->get();
        $attendance = Attendance::query()->where('site_id', $siteId)->whereDate('work_date', $date)->get()->keyBy('user_id');
        $people = $staff->map(fn (User $person) => [
            'name' => $person->name,
            'status' => $attendance->get($person->id)?->status->label() ?? 'Non pointé',
        ])->values();
        $present = $people->where('status', 'Présent')->count();
        $unrecorded = $people->where('status', 'Non pointé')->count();
        $absent = $people->count() - $present - $unrecorded;
        $stocks = Item::query()->where('is_active', true)
            ->whereColumn('balance_base', '<=', 'alert_threshold_base')->orderBy('name')
            ->get(['name', 'balance_base', 'alert_threshold_base']);
        $lines = ['RAPPORT SYNTHÉTIQUE — '.$date->format('d/m/Y'),
            'Activités dues : '.$tasks->count().' · exécutées / validées : '.$done.' · à valider : '.$pendingReview.' · non exécutées : '.($tasks->count() - $done - $pendingReview),
            'Inclut les activités ouvertes des jours précédents.'];
        foreach ($categories as $category) {
            $lines[] = $category['name'].' : '.$category['total'].' dues · '.$category['done'].' exécutées · '.$category['pending'].' à valider · '.$category['not_done'].' non exécutées';
        }
        $lines[] = 'Personnel : '.$present.' présent(s) · '.$absent.' non présent(s) · '.$unrecorded.' non pointé(s).';
        $lines[] = 'Stocks en alerte : '.$stocks->count().' (stock global, état actuel).';
        $lines[] = 'Détails : '.url('/taches?date='.$date->toDateString());

        return ['site_id' => $siteId, 'date' => $date->toDateString(), 'lines' => $lines, 'details' => $details, 'categories' => $categories, 'people' => $people->all(), 'stock_alerts' => $stocks->toArray(), 'recommendations' => array_values(array_unique($recommendations)), 'total' => $tasks->count(), 'done' => $done, 'pending_review' => $pendingReview, 'corrections' => $corrections, 'justified' => $justified, 'unanswered' => $unanswered, 'unassigned' => $unassigned];
    }
}
