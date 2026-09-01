<?php

declare(strict_types=1);

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;
use App\Models\WorkOrder;

/**
 * Signaler une panne est ouvert à tous : un agent qui voit une pompe fumer
 * doit pouvoir le dire sans permission. Ce qui est encadré, c'est la sortie
 * de pièces et la clôture.
 */
final class WorkOrderPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isActive();
    }

    public function view(User $user, WorkOrder $wo): bool
    {
        return $user->isActive();
    }

    public function create(User $user): bool
    {
        return $user->isActive();
    }

    public function update(User $user, WorkOrder $wo): bool
    {
        return $user->isActive()
            && in_array($user->role, [Role::Direction, Role::Superviseur], true);
    }

    public function transition(User $user, WorkOrder $wo): bool
    {
        return $user->isActive()
            && ($wo->assigned_to === $user->id
                || in_array($user->role, [Role::Direction, Role::Superviseur], true));
    }

    /** Sortir une pièce du magasin reste l'affaire du magasin. */
    public function addPart(User $user, WorkOrder $wo): bool
    {
        return $user->isActive()
            && in_array($user->role, [Role::Magasinier, Role::Direction], true);
    }

    /**
     * Nul ne clôt seul un bon dont le coût dépasse son plafond d'engagement :
     * une réparation chère est une dépense, et elle suit la même règle que
     * les réquisitions (P8).
     */
    public function complete(User $user, WorkOrder $wo): bool
    {
        if (! $user->isActive()) {
            return false;
        }

        if (! in_array($user->role, [Role::Direction, Role::Superviseur, Role::Magasinier], true)) {
            return false;
        }

        return $user->canApproveAmount($wo->totalCostCents());
    }

    /** Un bon ne se supprime jamais : il s'annule, avec un motif. */
    public function delete(User $user, WorkOrder $wo): bool
    {
        return false;
    }
}
