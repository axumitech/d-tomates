<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;

final class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive() && $user->role === Role::Direction;
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user);
    }

    public function update(User $user, User $target): bool
    {
        return $this->viewAny($user);
    }

    public function delete(User $user, User $target): bool
    {
        return false;
    }

    public function setCeiling(User $user, User $target): bool
    {
        return $this->viewAny($user) && $user->id !== $target->id;
    }

    public function deactivate(User $user, User $target): bool
    {
        if (! $this->viewAny($user)) {
            return false;
        }

        if ($target->role !== Role::Direction) {
            return true;
        }

        return User::query()
            ->where('role', Role::Direction)
            ->where(fn ($query) => $query->whereNull('employed_until')->orWhereDate('employed_until', '>=', now()->toDateString()))
            ->where('id', '!=', $target->id)
            ->exists();
    }
}
