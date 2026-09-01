<?php

declare(strict_types=1);

namespace App\Enums;

enum WorkOrderStatus: string
{
    case Raised = 'raised';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case AwaitingParts = 'awaiting_parts';
    case Done = 'done';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Raised => 'Ouvert',
            self::Assigned => 'Assigné',
            self::InProgress => 'En cours',
            self::AwaitingParts => 'En attente de pièce',
            self::Done => 'Terminé',
            self::Cancelled => 'Annulé',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Raised => 'warning',
            self::Assigned => 'info',
            self::InProgress => 'primary',
            self::AwaitingParts => 'danger',
            self::Done => 'success',
            self::Cancelled => 'gray',
        };
    }

    /** Un bon ouvert est un bon qui vaut preuve de panne (voir CDC §6.3). */
    public function isOpen(): bool
    {
        return ! in_array($this, [self::Done, self::Cancelled], true);
    }
}
