<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\Role;
use App\Models\Attendance;
use App\Models\User;

final class AttendancePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    public function view(User $user, Attendance $a): bool
    {
        return $user->isActive();
    }

    /** Le pointage relève du superviseur et de la Direction. */
    public function create(User $user): bool
    {
        return $user->isActive()
            && in_array($user->role, [Role::Direction, Role::Superviseur], true);
    }

    public function update(User $user, Attendance $a): bool
    {
        return $this->create($user);
    }

    /** Un pointage se corrige, il ne se supprime pas. */
    public function delete(User $user, Attendance $a): bool
    {
        return $user->isActive() && $user->role === Role::Direction;
    }
}
