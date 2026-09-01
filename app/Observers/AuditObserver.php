<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AuditLog;
use App\Support\ServerClock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

final class AuditObserver
{
    public function created(Model $model): void
    {
        $this->write($model, 'created', null, $this->clean($model, $model->getAttributes()));
    }

    public function updated(Model $model): void
    {
        $before = [];
        $after = [];

        foreach ($model->getChanges() as $key => $value) {
            $before[$key] = $model->getOriginal($key);
            $after[$key] = $value;
        }

        if ($after === []) {
            return;
        }

        $this->write($model, 'updated', $this->clean($model, $before), $this->clean($model, $after));
    }

    public function deleted(Model $model): void
    {
        $this->write($model, 'deleted', $this->clean($model, $model->getOriginal()), null);
    }

    /** @param array<string,mixed>|null $before @param array<string,mixed>|null $after */
    private function write(Model $model, string $event, ?array $before, ?array $after): void
    {
        AuditLog::query()->create([
            'auditable_type' => $model::class,
            'auditable_id' => (string) $model->getKey(),
            'event' => $event,
            'before' => $before,
            'after' => $after,
            'user_id' => Auth::id(),
            'user_label' => Auth::user()?->name ?? 'système',
            'ip_address' => Request::ip(),
            'user_agent' => mb_substr((string) Request::userAgent(), 0, 500),
            'occurred_at' => ServerClock::now(),
        ]);
    }

    /** @param array<string,mixed> $attributes @return array<string,mixed> */
    private function clean(Model $model, array $attributes): array
    {
        $excluded = method_exists($model, 'auditExcluded') ? $model->auditExcluded() : [];

        foreach ($excluded as $key) {
            unset($attributes[$key]);
        }

        return $attributes;
    }
}
