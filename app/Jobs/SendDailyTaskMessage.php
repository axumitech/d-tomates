<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Enums\Role;
use App\Models\Task;
use App\Models\User;
use App\Notifications\DailyTaskNotification;
use App\Services\TaskNotificationSender;
use App\Services\TaskReviewService;
use App\Support\ServerClock;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class SendDailyTaskMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public string $kind, public int $deliveryId) {}

    public function handle(): void
    {
        $table = $this->kind === 'report' ? 'task_report_deliveries' : 'task_reminder_deliveries';
        Cache::lock($table.':'.$this->deliveryId, 120)->block(5, function () use ($table): void {
            $delivery = DB::table($table)->where('id', $this->deliveryId)->first();
            if ($delivery === null || $delivery->sent_at !== null) {
                return;
            }
            $user = User::query()->whereKey($delivery->user_id)->first();
            if ($user === null || ! $user->isActive() || ($this->kind === 'report' && $user->role !== Role::Direction)) {
                return;
            }
            if ($this->kind === 'report') {
                $snapshot = json_decode($delivery->snapshot, true, 512, JSON_THROW_ON_ERROR);
                if ($snapshot['site_id'] !== $user->site_id) {
                    return;
                }
                $lines = $snapshot['lines'];
                $subject = 'Rapport journalier des tâches — '.$delivery->work_date;
            } else {
                $query = Task::query()->with('zone')->where('site_id', $user->site_id)->where('origin', 'crop_registry')->whereDate('work_date', '<=', $delivery->work_date)->whereIn('status', Task::OPEN_STATUSES);
                if (! in_array($user->role, [Role::Direction, Role::Superviseur], true)) {
                    $query->where('assigned_to', $user->id)->whereIn('status', Task::RESPONSE_STATUSES);
                } elseif ($user->role === Role::Superviseur) {
                    $query->where(fn ($q) => $q->where('assigned_to', $user->id)->when($user->department_id !== null, fn ($q) => $q->orWhere('department_id', $user->department_id)));
                }
                $tasks = $query->get();
                if ($delivery->slot === 'review') {
                    $tasks = $tasks->filter(fn (Task $task): bool => $task->status === Task::PENDING_REVIEW && app(TaskReviewService::class)->canReview($user, $task));
                }
                $lines = $tasks->map(fn (Task $task): string => ($task->zone->name ?? 'Zone').' — '.$task->title.' — '.($task->assigned_to === null ? 'NON ATTRIBUÉE' : match ($task->status) {
                    Task::PENDING_REVIEW => 'PREUVE À VALIDER', Task::CORRECTION_REQUESTED => 'CORRECTION ATTENDUE', default => 'preuve ou justification attendue'
                }).' — '.$task->deadlineAtSite()->format('d/m/Y H:i'))->all();
                if ($lines === []) {
                    DB::table($table)->where('id', $delivery->id)->update(['sent_at' => ServerClock::now()->utc()]);

                    return;
                }
                $subject = $delivery->slot === 'review' ? 'Revue du soir : '.$tasks->count().' preuve(s) à examiner' : 'Rappel quotidien : '.$tasks->count().' tâche(s) à suivre';
            }
            app(TaskNotificationSender::class)->send($user, new DailyTaskNotification($subject, $lines, $delivery->work_date), $table.':'.$delivery->id);
            DB::table($table)->where('id', $delivery->id)->update(['sent_at' => ServerClock::now()->utc(), 'updated_at' => ServerClock::now()->utc()]);
        });
    }
}
