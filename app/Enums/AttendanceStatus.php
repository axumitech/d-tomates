<?php

declare(strict_types=1);

namespace App\Enums;

enum AttendanceStatus: string
{
    case Present = 'present';
    case Absent = 'absent';
    case Leave = 'leave';
    case Sick = 'sick';
    case Rest = 'rest';

    public function label(): string
    {
        return match ($this) {
            self::Present => 'Présent',
            self::Absent => 'Absent',
            self::Leave => 'Congé',
            self::Sick => 'Maladie',
            self::Rest => 'Repos',
        };
    }

    public function isWorking(): bool
    {
        return $this === self::Present;
    }

    public function color(): string
    {
        return match ($this) {
            self::Present => 'success',
            self::Absent => 'danger',
            self::Leave, self::Rest => 'gray',
            self::Sick => 'warning',
        };
    }

    /** @return array<string,string> */
    public static function options(): array
    {
        $o = [];
        foreach (self::cases() as $c) {
            $o[$c->value] = $c->label();
        }

        return $o;
    }
}
