<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

final class DailyTaskNotification extends Notification
{
    /** @param list<string> $lines */
    public function __construct(public string $subject, public array $lines, public string $date) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    /** @return array{subject: string, lines: list<string>, date: string, url: string} */
    public function toArray(object $notifiable): array
    {
        return ['subject' => $this->subject, 'lines' => $this->lines, 'date' => $this->date, 'url' => '/taches?date='.$this->date];
    }

    public function toMail(User $notifiable): MailMessage
    {
        $message = (new MailMessage)->subject($this->subject)->greeting('Bonjour '.$notifiable->name.',');
        foreach ($this->lines as $line) {
            $message->line($line);
        }

        return $message->action('Consulter les tâches et les preuves', url('/taches?date='.$this->date));
    }
}
