<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Observers\AuditObserver;

/**
 * Toute écriture sur un modèle auditable produit une ligne au journal
 * d'audit : auteur authentifié, adresse réseau, horodatage serveur, table,
 * identifiant, valeur avant, valeur après (CDC-SI-001 §6.7).
 *
 * Les attributs listés dans $auditExclude ne sont jamais recopiés au journal
 * (mots de passe, jetons).
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(fn ($model) => app(AuditObserver::class)->created($model));
        static::updated(fn ($model) => app(AuditObserver::class)->updated($model));
        static::deleted(fn ($model) => app(AuditObserver::class)->deleted($model));
    }

    /** @return array<int,string> */
    public function auditExcluded(): array
    {
        return property_exists($this, 'auditExclude')
            ? $this->auditExclude
            : ['password', 'remember_token'];
    }
}
