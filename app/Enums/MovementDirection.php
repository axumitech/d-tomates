<?php

declare(strict_types=1);

namespace App\Enums;

enum MovementDirection: string
{
    case In = 'in';
    case Out = 'out';

    public function sign(): int
    {
        return $this === self::In ? 1 : -1;
    }
}
