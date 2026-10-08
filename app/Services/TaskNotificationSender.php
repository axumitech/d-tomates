<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use App\Notifications\DailyTaskNotification;

final class TaskNotificationSender
{
    public function send(User $user, DailyTaskNotification $notification, string $deliveryKey): void
    {
        // Une panne SMTP ne doit pas supprimer le rappel dans l’application.
        // L’identifiant stable empêche de créer un second rappel lors de la reprise du mail.
        $hash = substr(hash('sha256', $deliveryKey), 0, 32);
        $notification->id = substr($hash, 0, 8).'-'.substr($hash, 8, 4).'-'.substr($hash, 12, 4).'-'.substr($hash, 16, 4).'-'.substr($hash, 20, 12);
        if (! $user->notifications()->whereKey($notification->id)->exists()) {
            $user->notifyNow($notification, ['database']);
        }
        $user->notifyNow($notification, ['mail']);
    }
}
