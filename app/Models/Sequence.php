<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\ServerClock;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Compteur de numérotation, une ligne par (clé, année).
 *
 * Préféré à un « max + 1 » sur la table cible : la ligne de séquence est
 * verrouillée seule, donc deux ouvertures simultanées ne peuvent pas obtenir
 * le même numéro, et un bon annulé ne libère pas sa référence.
 */
class Sequence extends Model
{
    /** @var array<int,string> */
    protected $fillable = ['key', 'year', 'last_value'];

    public static function next(string $key): int
    {
        $annee = ServerClock::now()->year;

        return DB::transaction(function () use ($key, $annee): int {
            $seq = self::query()
                ->where('key', $key)->where('year', $annee)
                ->lockForUpdate()->first();

            if ($seq === null) {
                $seq = self::query()->create(['key' => $key, 'year' => $annee, 'last_value' => 0]);
            }

            $seq->increment('last_value');

            return (int) $seq->refresh()->last_value;
        });
    }
}
