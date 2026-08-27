<?php

declare(strict_types=1);

namespace App\Enums;

enum Dimension: string
{
    case Mass = 'mass';
    case Volume = 'volume';
    case Count = 'count';

    public function baseUnitCode(): string
    {
        return match ($this) {
            self::Mass => 'g', self::Volume => 'ml', self::Count => 'u'
        };
    }
}
