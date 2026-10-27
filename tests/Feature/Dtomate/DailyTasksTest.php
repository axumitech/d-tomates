<?php

declare(strict_types=1);

namespace Tests\Feature\Dtomate;

use App\Enums\Role;
use App\Jobs\SendDailyTaskMessage;
use App\Jobs\SendTaskAssignment;
use App\Jobs\SendTaskReviewMessage;
use App\Models\CarnetRecord;
use App\Models\Department;
use App\Models\Site;
use App\Models\Task;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Models\Zone;
use App\Notifications\DailyTaskNotification;
use App\Services\DailyTaskReport;
use App\Services\DailyTaskScheduler;
use App\Services\DayClosureService;
use App\Services\TaskTemplateRegistry;
use App\Support\ServerClock;
use Carbon\CarbonImmutable;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Notifications\Channels\MailChannel;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class DailyTasksTest extends TestCase
{
    use RefreshDatabase;

    private Site $site;

    private User $direction;

    private User $agent;

    private Zone $zone;

    protected function setUp(): void
    {
        parent::setUp();
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-08 15:00', 'Africa/Lubumbashi'));
        Notification::fake();
        Storage::fake('local');
        $this->site = Site::query()->create(['code' => 'NTETEMA', 'name' => 'Ferme', 'timezone' => 'Africa/Lubumbashi']);
        $department = Department::query()->create(['site_id' => $this->site->id, 'code' => 'SER', 'name' => 'Serre']);
        $this->direction = User::factory()->create(['site_id' => $this->site->id, 'role' => Role::Direction]);
        $this->agent = User::factory()->create(['site_id' => $this->site->id, 'department_id' => $department->id, 'role' => Role::Agent]);
        $this->zone = Zone::query()->create(['site_id' => $this->site->id, 'department_id' => $department->id, 'code' => 'M1', 'name' => 'Module 1', 'legacy_key' => 'Module 1', 'type' => 'greenhouse_module', 'task_responsible_id' => $this->agent->id]);
        $value = json_encode(['Module 1' => ['type' => 'Tomate Trinity F1', 'debut' => '2026-10-01', 'effectif' => '1800']], JSON_THROW_ON_ERROR);
        CarnetRecord::query()->create(['storage_key' => 'dt:reg:cultures', 'value' => $value, 'checksum' => hash('sha256', $value), 'synced_at' => ServerClock::now()]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function generate(): Task
    {
        app(DailyTaskScheduler::class)->generate(ServerClock::today());

        return Task::query()->where('title', 'Tour de serre')->firstOrFail();
    }

    public function test_generation_collects_registry_by_age_and_weekday_without_duplicates(): void
    {
        $task = $this->generate();
        $count = Task::query()->count();
        app(DailyTaskScheduler::class)->generate(ServerClock::today());
        $this->assertSame($count, Task::query()->count());
        $this->assertSame($this->agent->id, $task->assigned_to);
        $this->assertTrue(Task::query()->where('title', 'Fertigation — jeudi')->whereDate('work_date', '2026-10-08')->exists());
        $this->assertDatabaseMissing('tasks', ['title' => 'Fertigation — lundi']);
        $this->assertDatabaseMissing('tasks', ['title' => 'Ombrage des 3 premiers jours']);
        (new SendTaskAssignment($task->id, $this->agent->id))->handle();
        (new SendTaskAssignment($task->id, $this->agent->id))->handle();
        $this->assertCount(2, Notification::sent($this->agent, DailyTaskNotification::class, fn (DailyTaskNotification $notification): bool => str_contains(implode(' ', $notification->lines), $task->reference)));
    }

    public function test_no_responsible_means_visible_unassigned_task_and_report_recommendation(): void
    {
        $this->zone->update(['task_responsible_id' => null]);
        $task = $this->generate();
        $this->assertNull($task->assigned_to);
        $report = app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id);
        $this->assertGreaterThan(0, $report['unassigned']);
        $this->assertStringContainsString('Attribuer', implode(' ', $report['recommendations']));
        $this->actingAs($this->direction)->get('/taches')->assertOk();
        $this->actingAs($this->agent)->get('/taches')->assertInertia(fn ($page) => $page->has('tasks', 0));
    }

    public function test_assignee_must_upload_real_photo_and_other_agents_cannot_close_or_read_it(): void
    {
        $task = $this->generate();
        $other = User::factory()->create(['site_id' => $this->site->id, 'role' => Role::Agent]);
        $this->actingAs($other)->post(route('tasks.close', $task), ['status' => 'done'])->assertForbidden();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done'])->assertSessionHasErrors('photos');
        $this->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->create('fake.jpg', 20, 'text/plain')]])->assertSessionHasErrors();
        $this->post(route('tasks.close', $task), ['status' => 'done', 'note' => 'Tour effectué', 'photos' => [UploadedFile::fake()->image('preuve.jpg')]])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame(Task::PENDING_REVIEW, $task->fresh()->status);
        $this->assertNull($task->fresh()->closed_at);
        Storage::disk('local')->assertExists($task->fresh()->evidence['photos'][0]);
        $this->assertSame('image/webp', Storage::disk('local')->mimeType($task->fresh()->evidence['photos'][0]));
        $this->assertCount(1, Storage::disk('local')->allFiles());
        $this->get(route('tasks.photo', [$task, 0]))->assertOk();
        $this->actingAs($other)->get(route('tasks.photo', [$task, 0]))->assertForbidden();
        $this->actingAs($this->direction)->get(route('tasks.photo', [$task, 0]))->assertOk();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'justified', 'reason' => 'weather', 'justification' => 'Pluie persistante sur la zone'])->assertSessionHasErrors('operation');
    }

    public function test_non_execution_requires_reason_and_explanation_and_does_not_count_as_done(): void
    {
        $task = $this->generate();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'justified'])->assertSessionHasErrors(['reason', 'justification']);
        $this->post(route('tasks.close', $task), ['status' => 'justified', 'reason' => 'stockout', 'justification' => 'Produit indisponible au magasin'])->assertSessionHasNoErrors();
        $report = app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id);
        $this->assertSame(0, $report['done']);
        $this->assertSame(1, $report['justified']);
        $this->assertStringContainsString('réapprovisionnement', implode(' ', $report['recommendations']));
    }

    public function test_direction_can_edit_registry_but_agent_and_supervisor_cannot(): void
    {
        $task = $this->generate();
        $template = TaskTemplate::query()->findOrFail($task->template_id);
        $data = $template->only(['crop_type', 'task_key', 'title', 'instructions', 'category', 'frequency', 'min_day', 'max_day', 'weekday', 'interval_days', 'is_active']);
        $data['instructions'] = 'Nouvelle consigne validée par la direction';
        $this->actingAs($this->agent)->patch(route('tasks.templates.update', $template), $data)->assertForbidden();
        $supervisor = User::factory()->create(['site_id' => $this->site->id, 'role' => Role::Superviseur]);
        $this->actingAs($supervisor)->patch(route('tasks.templates.update', $template), $data)->assertForbidden();
        $this->actingAs($this->direction)->patch(route('tasks.templates.update', $template), $data)->assertSessionHasNoErrors();
        $this->assertSame($data['instructions'], $template->fresh()->instructions);
        $this->assertNotSame($data['instructions'], $task->fresh()->instructions);
        app(TaskTemplateRegistry::class)->importDefaults();
        $this->assertSame($data['instructions'], $template->fresh()->instructions);
    }

    public function test_manager_assigns_and_only_same_site_active_assignees_are_accepted(): void
    {
        $this->zone->update(['task_responsible_id' => null]);
        $task = $this->generate();
        Bus::fake();
        $this->actingAs($this->agent)->post(route('tasks.assign', $task), ['assigned_to' => $this->agent->id])->assertForbidden();
        $this->actingAs($this->direction)->post(route('tasks.assign', $task), ['assigned_to' => $this->agent->id])->assertSessionHasNoErrors();
        Bus::assertDispatched(SendTaskAssignment::class);
        $this->assertSame($this->agent->id, $task->fresh()->assigned_to);
        $other = User::factory()->create(['role' => Role::Agent]);
        $this->post(route('tasks.assign', $task), ['assigned_to' => $other->id])->assertStatus(422);
    }

    public function test_report_and_reminders_are_deduplicated_and_report_snapshot_is_preserved(): void
    {
        Bus::fake();
        $this->generate();
        $this->artisan('tasks:daily', ['action' => 'remind'])->assertSuccessful();
        $this->artisan('tasks:daily', ['action' => 'remind'])->assertSuccessful();
        $this->assertSame(2, DB::table('task_reminder_deliveries')->count());
        $this->artisan('tasks:daily', ['action' => 'report'])->assertSuccessful();
        $delivery = DB::table('task_report_deliveries')->first();
        $this->assertSame($this->direction->id, $delivery->user_id);
        (new SendDailyTaskMessage('report', $delivery->id))->handle();
        (new SendDailyTaskMessage('report', $delivery->id))->handle();
        Notification::assertSentToTimes($this->direction, DailyTaskNotification::class, 2);
        $this->assertNotNull(DB::table('task_report_deliveries')->first()->sent_at);
        $this->artisan('tasks:daily', ['action' => 'report'])->assertSuccessful();
        $this->assertSame(1, DB::table('task_report_deliveries')->count());
        $this->assertSame($delivery->snapshot, DB::table('task_report_deliveries')->first()->snapshot);
    }

    public function test_legacy_api_cannot_change_crop_calendar_without_direction_role(): void
    {
        $record = CarnetRecord::query()->firstOrFail();
        $cultures = json_decode($record->value, true);
        $cultures['Module 1']['debut'] = '2026-10-05';
        $data = ['key' => 'dt:reg:cultures', 'value' => json_encode($cultures)];
        $this->actingAs($this->agent)->withHeader('X-DTomate-Site-Code', config('dtomate.site_access_code'))->putJson('/api/carnet-storage', $data)->assertForbidden();
        $this->actingAs($this->direction)->putJson('/api/carnet-storage', $data)->assertOk();
    }

    public function test_periodic_tasks_start_at_minimum_age_and_unique_tasks_keep_their_window(): void
    {
        $this->generate();
        $unique = Task::query()->where('title', 'Fixation des ficelles de palissage')->firstOrFail();
        $this->assertSame('2026-10-13', $unique->due_at->toDateString());
        $record = CarnetRecord::query()->firstOrFail();
        $cultures = json_decode($record->value, true);
        $cultures['Pépinière tomate'] = ['type' => 'Pépinière tomate', 'debut' => '2026-10-01', 'effectif' => '100'];
        $record->update(['value' => json_encode($cultures)]);
        app(DailyTaskScheduler::class)->generate(ServerClock::today());
        $this->assertDatabaseHas('tasks', ['title' => 'Fertilisation pépinière']);
        app(DailyTaskScheduler::class)->generate(ServerClock::today()->addDay());
        $this->assertSame(1, Task::query()->where('title', 'Fertilisation pépinière')->count());
        $this->assertSame(1, Task::query()->where('title', 'Fixation des ficelles de palissage')->count());
        $this->assertTrue(Task::query()->where('title', 'Tour de serre')->whereDate('work_date', '2026-10-09')->exists());
    }

    public function test_mail_failure_preserves_in_app_report_and_retry_does_not_duplicate_it(): void
    {
        Bus::fake();
        $this->generate();
        $this->artisan('tasks:daily', ['action' => 'report'])->assertSuccessful();
        $delivery = DB::table('task_report_deliveries')->first();
        $mailChannel = \Mockery::mock(MailChannel::class);
        $mailChannel->shouldReceive('send')->once()->andThrow(new \RuntimeException('SMTP indisponible'));
        $mailChannel->shouldReceive('send')->once()->andReturnNull();
        $this->app->instance(MailChannel::class, $mailChannel);
        Notification::swap(new ChannelManager($this->app));
        try {
            (new SendDailyTaskMessage('report', $delivery->id))->handle();
            $this->fail('Une panne SMTP doit laisser l’envoi à reprendre.');
        } catch (\RuntimeException $error) {
            $this->assertSame('SMTP indisponible', $error->getMessage());
        }
        $this->assertSame(1, $this->direction->notifications()->count());
        $this->assertNull(DB::table('task_report_deliveries')->first()->sent_at);
        (new SendDailyTaskMessage('report', $delivery->id))->handle();
        $this->assertSame(1, $this->direction->notifications()->count());
        $this->assertNotNull(DB::table('task_report_deliveries')->first()->sent_at);
    }

    public function test_direction_can_add_a_rule_and_replan_a_justified_task_without_erasing_its_answer(): void
    {
        $task = $this->generate();
        $this->actingAs($this->direction)->post(route('tasks.templates.store'), [
            'crop_type' => 'Tomate Trinity F1', 'task_key' => 'verification_jour', 'title' => 'Vérification supplémentaire',
            'instructions' => 'Vérifier et photographier la zone.', 'category' => 'Contrôle', 'frequency' => 'jour',
            'min_day' => 0, 'max_day' => null, 'weekday' => null, 'interval_days' => null, 'is_active' => true,
        ])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('task_templates', ['task_key' => 'verification_jour']);
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'justified', 'reason' => 'weather', 'justification' => 'Conditions météo empêchant le passage'])->assertSessionHasNoErrors();
        $payload = ['work_date' => '2026-10-09', 'assigned_to' => $this->agent->id];
        $this->post(route('tasks.replan', $task), $payload)->assertForbidden();
        $this->actingAs($this->direction)->post(route('tasks.replan', $task), $payload)->assertSessionHasNoErrors();
        $this->post(route('tasks.replan', $task), $payload)->assertSessionHasNoErrors();
        $followups = Task::query()->where('title', $task->title)->whereDate('work_date', '2026-10-09')->get();
        $this->assertCount(1, $followups);
        $this->post(route('tasks.replan', $task), ['work_date' => '2026-10-10', 'assigned_to' => $this->agent->id])->assertSessionHasErrors('operation');
        $this->assertSame(Task::JUSTIFIED, $task->fresh()->status);
        $this->assertSame('Conditions météo empêchant le passage', $task->fresh()->justification);
        $this->actingAs($this->agent)->post(route('tasks.close', $followups->first()), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('future.jpg')]])->assertSessionHasErrors('operation');
    }

    public function test_carnet_uses_server_proofs_as_last_execution_instead_of_legacy_done_clicks(): void
    {
        $task = $this->generate();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('preuve.jpg')]])->assertSessionHasNoErrors();
        $this->getJson('/taches/synthese?date=2026-10-08')->assertJsonMissingPath('lastExecutions.Module 1|tour');
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertSessionHasNoErrors();
        $this->getJson('/taches/synthese?date=2026-10-08')->assertOk()->assertJsonPath('lastExecutions.Module 1|tour', '2026-10-08');
        $this->getJson('/taches/synthese?date=2026-10-07')->assertOk()->assertJsonMissingPath('lastExecutions.Module 1|tour');
    }

    public function test_site_midnight_and_deadline_use_site_timezone_despite_utc_application(): void
    {
        $task = $this->generate();
        $this->assertSame('17:00', $task->deadlineAtSite()->format('H:i'));
        $this->assertSame('15:00', $task->due_at->format('H:i'));
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-09 00:30', 'Africa/Lubumbashi'));
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('nuit.jpg')]])->assertSessionHasNoErrors();
        $this->assertSame('2026-10-08', $task->fresh()->submitted_at->toDateString());
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertSessionHasNoErrors();
        $this->assertSame('2026-10-08', $task->fresh()->closed_at->toDateString());
        $report = app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id);
        $this->assertSame(1, $report['done']);
        $this->getJson('/taches/synthese?date=2026-10-09')->assertOk()->assertJsonPath('lastExecutions.Module 1|tour', '2026-10-09');
    }

    public function test_proof_review_requires_independent_authorized_reviewer_and_attestation(): void
    {
        $task = $this->generate();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('preuve.jpg')]])->assertSessionHasNoErrors();
        $report = app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id);
        $this->assertSame(0, $report['done']);
        $this->assertSame(1, $report['pending_review']);
        $this->assertSame(1, $report['categories'][0]['pending']);
        $this->assertSame(0, $report['categories'][0]['not_done']);
        $this->assertSame($task->id, $report['categories'][0]['tasks'][0]['id']);
        $this->assertLessThan(count($report['details']), count($report['lines']));
        $this->assertCount(2, $report['people']);
        $this->assertSame(['Non pointé'], array_values(array_unique(array_column($report['people'], 'status'))));
        $this->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertForbidden();
        $wrong = User::factory()->create(['site_id' => $this->site->id, 'role' => Role::Superviseur]);
        $this->actingAs($wrong)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertForbidden();
        $external = User::factory()->create(['role' => Role::Direction]);
        $this->actingAs($external)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertForbidden();
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'approve'])->assertSessionHasErrors('photos_examined');
        $supervisor = User::factory()->create(['site_id' => $this->site->id, 'department_id' => $this->agent->department_id, 'role' => Role::Superviseur]);
        $this->actingAs($supervisor)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertSessionHasNoErrors();
        $this->assertSame(Task::DONE, $task->fresh()->status);
        $this->assertSame($supervisor->id, $task->fresh()->reviewed_by);
        $this->assertSame(1, app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id)['done']);
        $this->post(route('tasks.review', $task), ['decision' => 'reject', 'note' => 'Nouvelle correction demandée'])->assertSessionHasErrors('operation');
        $task->forceFill(['status' => Task::PENDING_REVIEW, 'assigned_to' => $this->direction->id, 'closed_by' => $this->direction->id])->save();
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'approve', 'photos_examined' => true])->assertForbidden();
    }

    public function test_rejected_proof_can_be_corrected_and_original_photos_remain_private_in_history(): void
    {
        $task = $this->generate();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('premiere.jpg')]])->assertSessionHasNoErrors();
        $submission = $task->events()->where('event', 'submitted')->firstOrFail();
        $original = $task->fresh()->evidence['photos'][0];
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'reject'])->assertSessionHasErrors('note');
        $this->post(route('tasks.review', $task), ['decision' => 'reject', 'note' => 'La photo ne montre pas la zone concernée'])->assertSessionHasNoErrors();
        $this->assertSame(Task::CORRECTION_REQUESTED, $task->fresh()->status);
        $report = app(DailyTaskReport::class)->snapshot(ServerClock::today(), $this->site->id);
        $this->assertSame(1, $report['corrections']);
        $this->assertSame(0, $report['done']);
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('corrigee.jpg')]])->assertSessionHasNoErrors();
        $this->assertSame(Task::PENDING_REVIEW, $task->fresh()->status);
        $this->assertNull($task->fresh()->review_note);
        $this->assertNotSame($original, $task->fresh()->evidence['photos'][0]);
        Storage::disk('local')->assertExists($original);
        $this->get(route('tasks.event-photo', [$task, $submission, 0]))->assertOk();
        $other = User::factory()->create(['site_id' => $this->site->id, 'role' => Role::Agent]);
        $this->actingAs($other)->get(route('tasks.event-photo', [$task, $submission, 0]))->assertForbidden();
        $another = Task::query()->where('id', '!=', $task->id)->firstOrFail();
        $this->actingAs($this->direction)->get(route('tasks.event-photo', [$another, $submission, 0]))->assertNotFound();
        $this->get('/taches?date=2026-10-09')->assertInertia(fn ($page) => $page->where('tasks.0.status', Task::PENDING_REVIEW));
    }

    public function test_review_notifications_and_daily_review_reminder_are_deduplicated(): void
    {
        $task = $this->generate();
        Notification::fake();
        Bus::fake();
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('preuve.jpg')]])->assertSessionHasNoErrors();
        $delivery = DB::table('task_review_notice_deliveries')->first();
        $this->assertSame($this->direction->id, $delivery->user_id);
        (new SendTaskReviewMessage($delivery->id))->handle();
        (new SendTaskReviewMessage($delivery->id))->handle();
        Notification::assertSentToTimes($this->direction, DailyTaskNotification::class, 2);
        $this->artisan('tasks:daily', ['action' => 'remind', '--slot' => 'review'])->assertSuccessful();
        $reminder = DB::table('task_reminder_deliveries')->where('slot', 'review')->first();
        $this->assertSame($this->direction->id, $reminder->user_id);
        $this->assertSame(1, DB::table('task_reminder_deliveries')->where('slot', 'review')->count());
        (new SendDailyTaskMessage('reminder', $reminder->id))->handle();
        Notification::assertSentTo($this->direction, DailyTaskNotification::class, fn ($n) => str_contains(implode(' ', $n->lines), 'PREUVE À VALIDER'));
        $this->actingAs($this->direction)->post(route('tasks.review', $task), ['decision' => 'reject', 'note' => 'Une photo plus précise est nécessaire'])->assertSessionHasNoErrors();
        $correction = DB::table('task_review_notice_deliveries')->where('user_id', $this->agent->id)->first();
        (new SendTaskReviewMessage($correction->id))->handle();
        Notification::assertSentTo($this->agent, DailyTaskNotification::class, fn ($n) => str_contains($n->subject, 'Correction demandée'));
    }

    public function test_pending_review_and_correction_prevent_day_closure(): void
    {
        $task = $this->generate();
        Task::query()->where('id', '!=', $task->id)->update(['status' => Task::JUSTIFIED]);
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('preuve.jpg')]])->assertSessionHasNoErrors();
        foreach ([Task::PENDING_REVIEW, Task::CORRECTION_REQUESTED] as $status) {
            $task->update(['status' => $status]);
            try {
                app(DayClosureService::class)->close($this->agent->department_id, ServerClock::today(), $this->direction);
                $this->fail('Une tâche en attente de validation doit empêcher la clôture.');
            } catch (\RuntimeException $error) {
                $this->assertStringContainsString('sans validation des preuves', $error->getMessage());
            }
        }
    }

    public function test_existing_photo_declarations_are_migrated_to_audited_pending_review(): void
    {
        $originalConnection = DB::getDefaultConnection();
        $originalSchema = Schema::getFacadeRoot();
        config(['database.connections.proof_migration' => ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true]]);
        DB::setDefaultConnection('proof_migration');
        $schema = DB::connection()->getSchemaBuilder();
        Schema::swap($schema);
        try {
            $schema->create('users', function ($table) {
                $table->id();
            });
            $schema->create('tasks', function ($table) {
                $table->id();
                $table->string('origin');
                $table->string('status');
                $table->unsignedBigInteger('closed_by')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->json('evidence')->nullable();
            });
            $schema->create('task_events', function ($table) {
                $table->id();
                $table->unsignedBigInteger('task_id');
                $table->string('event');
                $table->json('payload')->nullable();
                $table->unsignedBigInteger('performed_by')->nullable();
                $table->timestamp('created_at')->nullable();
            });
            DB::table('users')->insert(['id' => 1]);
            DB::table('tasks')->insert(['id' => 1, 'origin' => 'crop_registry', 'status' => 'done', 'closed_by' => 1, 'closed_at' => '2026-10-08 13:00:00', 'evidence' => json_encode(['photos' => ['old-proof.jpg']])]);
            $migration = require database_path('migrations/2026_10_08_000200_add_task_proof_review.php');
            $migration->up();
            $task = DB::table('tasks')->first();
            $this->assertSame(Task::PENDING_REVIEW, $task->status);
            $this->assertNull($task->closed_at);
            $this->assertSame('2026-10-08 13:00:00', $task->submitted_at);
            $event = DB::table('task_events')->where('event', 'submitted')->first();
            $this->assertSame('old-proof.jpg', json_decode($event->payload, true)['evidence']['photos'][0]);
        } finally {
            DB::setDefaultConnection($originalConnection);
            Schema::swap($originalSchema);
            DB::purge('proof_migration');
        }
    }

    public function test_failed_second_photo_storage_cleans_up_first_photo_without_submitting_task(): void
    {
        $task = $this->generate();
        $realDisk = Storage::disk('local');
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $stored = [];
        $disk->shouldReceive('put')->twice()->andReturnUsing(function ($path, $contents) use ($realDisk, &$stored): bool {
            $stored[] = $path;

            return count($stored) === 1 ? $realDisk->put($path, $contents) : false;
        });
        $disk->shouldReceive('delete')->twice()->andReturnUsing(fn ($paths) => $realDisk->delete($paths));
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        $this->actingAs($this->agent)->post(route('tasks.close', $task), ['status' => 'done', 'photos' => [UploadedFile::fake()->image('one.jpg'), UploadedFile::fake()->image('two.jpg')]])->assertSessionHasErrors('operation');
        $this->assertSame(Task::TODO, $task->fresh()->status);
        $this->assertNull($task->fresh()->evidence);
        $this->assertCount(2, $stored);
        $realDisk->assertMissing($stored[0]);
        $this->assertSame([], $realDisk->allFiles());
    }
}
