<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\Role;
use App\Jobs\SendDailyTaskMessage;
use App\Jobs\SendTaskAssignment;
use App\Jobs\SendTaskReviewMessage;
use App\Models\Task;
use App\Models\User;
use App\Services\DailyTaskReport;
use App\Services\DailyTaskScheduler;
use App\Services\TaskTemplateRegistry;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class DailyTasks extends Command
{
    protected $signature = 'tasks:daily {action=generate : import, generate, remind ou report} {--date= : Date YYYY-MM-DD} {--slot=morning : morning, afternoon ou review}';

    protected $description = 'Génère les tâches du registre, rappelle les tâches ouvertes et envoie le rapport à la direction';

    public function handle(DailyTaskScheduler $scheduler, DailyTaskReport $report): int
    {
        $rawDate = $this->option('date');
        if ($rawDate !== null && (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $rawDate) || ! CarbonImmutable::hasFormatWithModifiers($rawDate, 'Y-m-d'))) {
            $this->error('Date invalide : format YYYY-MM-DD requis.');

            return self::FAILURE;
        }
        $date = $rawDate === null ? ServerClock::today() : CarbonImmutable::parse($rawDate, config('dtomate.timezone'));
        $action = $this->argument('action');
        if (! in_array($action, ['import', 'generate', 'remind', 'report'], true) || ! in_array($this->option('slot'), ['morning', 'afternoon', 'review'], true) || $date->isAfter(ServerClock::today())) {
            $this->error('Action, créneau ou date future invalide.');

            return self::FAILURE;
        }
        if ($action === 'import') {
            $this->info(app(TaskTemplateRegistry::class)->importDefaults().' règle(s) ajoutée(s), sans modifier les règles existantes.');

            return self::SUCCESS;
        }
        if ($rawDate === null) {
            $scheduler->catchUp();
        } else {
            $scheduler->generate($date);
        }
        // Reprend aussi les notifications d’attribution non envoyées après une panne du worker.
        foreach (Task::query()->where('origin', 'crop_registry')->where('status', Task::TODO)->whereNotNull('assigned_to')->whereNull('assignment_notified_at')->get() as $task) {
            SendTaskAssignment::dispatch($task->id, $task->assigned_to);
        }
        foreach (DB::table('task_review_notice_deliveries')->whereNull('sent_at')->get() as $notice) {
            SendTaskReviewMessage::dispatch($notice->id);
        }
        if ($action === 'generate') {
            $this->info('Tâches générées sans duplication.');

            return self::SUCCESS;
        }
        $users = User::query()->whereHas('site', fn ($q) => $q->where('code', config('dtomate.tasks.site_code')))->get()->filter(fn (User $user): bool => $user->isActive());
        if ($action === 'report') {
            $users = $users->filter(fn (User $user): bool => $user->role === Role::Direction);
            if ($users->isEmpty()) {
                $this->error('Aucun compte direction actif destinataire du rapport.');

                return self::FAILURE;
            }
        }
        if ($action === 'remind' && $this->option('slot') === 'review') {
            $users = $users->filter(fn (User $user): bool => in_array($user->role, [Role::Direction, Role::Superviseur], true));
        }
        foreach ($users as $user) {
            $table = $action === 'report' ? 'task_report_deliveries' : 'task_reminder_deliveries';
            $key = ['work_date' => $date->toDateString(), 'user_id' => $user->id];
            $values = ['created_at' => ServerClock::now(), 'updated_at' => ServerClock::now()];
            if ($action === 'report') {
                $values['snapshot'] = json_encode($report->snapshot($date, $user->site_id), JSON_THROW_ON_ERROR);
            } else {
                $key['slot'] = $this->option('slot');
            }
            DB::table($table)->insertOrIgnore($key + $values);
            $delivery = DB::table($table)->where($key)->first();
            if ($delivery->sent_at === null) {
                SendDailyTaskMessage::dispatch($action === 'report' ? 'report' : 'reminder', $delivery->id);
            }
        }
        $this->info('Notifications préparées pour '.$users->count().' destinataire(s).');

        return self::SUCCESS;
    }
}
