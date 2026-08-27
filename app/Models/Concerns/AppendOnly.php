<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use RuntimeException;

trait AppendOnly
{
    public static function bootAppendOnly(): void
    {
        static::updating(fn () => throw new RuntimeException('Registre en ajout seul : une correction doit créer une nouvelle écriture.'));
        static::deleting(fn () => throw new RuntimeException('Registre en ajout seul : suppression interdite.'));
    }
}
