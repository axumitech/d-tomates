<?php

declare(strict_types=1);

namespace App\Providers;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

final class DtomateServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::define('close-day', fn (User $user): bool => $user->isActive() && $user->role->canCloseDay());
        Gate::define('approve-requisition', fn (User $user, object $request): bool => $user->isActive() && $request->requested_by !== $user->id && $user->canApproveAmount((int) $request->amount_cents));
        Gate::define('issue-requisition', fn (User $user, object $request): bool => $user->isActive() && $user->role === Role::Magasinier && $request->requested_by !== $user->id && $request->approved_by !== $user->id);
    }
}
