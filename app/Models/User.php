<?php

namespace App\Models;

use App\Enums\Role;
// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\Auditable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * @property Role $role
 * @property Carbon|null $employed_until
 * @property Carbon|null $employed_from
 * @property int|null $site_id
 * @property int|null $department_id
 * @property Site|null $site
 * @property int $id
 * @property string $name
 * @property string $email
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 * @property string|null $remember_token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
#[Fillable(['name', 'email', 'password', 'role', 'job_title', 'site_id', 'department_id', 'manager_id', 'approval_ceiling_cents', 'daily_rate_cents', 'employed_from', 'employed_until', 'is_field_only'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
class User extends Authenticatable implements PasskeyUser
{
    use Auditable;

    /** @use HasFactory<UserFactory> */
    use HasFactory;

    use Notifiable, PasskeyAuthenticatable, TwoFactorAuthenticatable;

    /** @var list<string> */
    protected array $auditExclude = ['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'role' => Role::class,
            'employed_from' => 'date',
            'employed_until' => 'date',
            'is_field_only' => 'boolean',
        ];
    }

    public function isActive(): bool
    {
        $today = now((string) config('dtomate.timezone'))->startOfDay();

        return ($this->employed_from === null || $this->employed_from->lessThanOrEqualTo($today))
            && ($this->employed_until === null || $this->employed_until->greaterThanOrEqualTo($today));
    }

    public function ceilingCents(): int
    {
        return $this->role === Role::Direction ? PHP_INT_MAX : ($this->approval_ceiling_cents ?? $this->role->defaultCeilingCents());
    }

    public function canApproveAmount(int $amount): bool
    {
        return $this->isActive() && $amount <= $this->ceilingCents();
    }

    /** @return BelongsTo<Site, $this> */
    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function approverFor(int $amount): ?self
    {
        $seen = [$this->id];
        $manager = $this->manager;
        while ($manager !== null && ! in_array($manager->id, $seen, true)) {
            if ($manager->canApproveAmount($amount)) {
                return $manager;
            }
            $seen[] = $manager->id;
            $manager = $manager->manager;
        }

        return null;
    }

    /** @return BelongsTo<Department, $this> */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /** @return BelongsTo<User, $this> */
    public function manager(): BelongsTo
    {
        return $this->belongsTo(self::class, 'manager_id');
    }

    /** @return HasMany<Attendance, $this> */
    public function attendances(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }
}
