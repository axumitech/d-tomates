<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Task;
use App\Models\TaskEvent;
use App\Models\User;
use App\Notifications\DailyTaskNotification;
use App\Services\TaskNotificationSender;
use App\Services\TaskReviewService;
use App\Support\ServerClock;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class SendTaskReviewMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $deliveryId) {}

    public function handle(): void
    {
        Cache::lock('task-review-notice:'.$this->deliveryId, 120)->block(5, function (): void {
            $delivery = DB::table('task_review_notice_deliveries')->where('id', $this->deliveryId)->first();
            if ($delivery === null || $delivery->sent_at !== null) {
                return;
            }
            $event = TaskEvent::query()->whereKey($delivery->event_id)->first();
            $task = $event === null ? null : Task::query()->with('zone')->find($event->task_id);
            $user = User::query()->whereKey($delivery->user_id)->first();
            if ($task === null || $user === null || ! $user->isActive() || $user->site_id !== $task->site_id) {
                return;
            }
            $payload = $event->payload;
            if ($event->event === 'submitted') {
                $allowed = app(TaskReviewService::class)->canReview($user, $task) && $event->id === $task->events()->where('event', 'submitted')->max('id');
                if (! $allowed || $task->status !== Task::PENDING_REVIEW) {
                    return;
                }
                $subject = 'Preuve à examiner — '.$task->title;
                $lines = ['Une exécution a été déclarée dans '.($task->zone->name ?? 'la zone').'.', 'Examinez les photos, puis validez ou demandez une correction.'];
            } else {
                if ($user->id !== $task->assigned_to) {
                    return;
                }
                $subject = $event->event === 'review_approved' ? 'Exécution validée — '.$task->title : 'Correction demandée — '.$task->title;
                $lines = [$task->title.' — '.($task->zone->name ?? 'Zone'), $payload['note'] ?? 'La preuve a été examinée par votre responsable.'];
            }
            app(TaskNotificationSender::class)->send($user, new DailyTaskNotification($subject, $lines, ServerClock::today()->toDateString()), 'review:'.$delivery->id);
            DB::table('task_review_notice_deliveries')->where('id', $delivery->id)->update(['sent_at' => ServerClock::now()->utc(), 'updated_at' => ServerClock::now()->utc()]);
        });
    }
}
