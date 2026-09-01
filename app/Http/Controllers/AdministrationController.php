<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\AssetKind;
use App\Enums\AssetStatus;
use App\Enums\Criticality;
use App\Enums\Role;
use App\Models\Asset;
use App\Models\CostCentre;
use App\Models\Department;
use App\Models\Site;
use App\Models\User;
use App\Models\Zone;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

final class AdministrationController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('administration', [
            'staff' => User::query()->with(['department:id,name', 'manager:id,name'])->orderBy('name')->get()->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'job_title' => $user->job_title,
                'role' => $user->role->value,
                'role_label' => $user->role->label(),
                'site_id' => $user->site_id,
                'department_id' => $user->department_id,
                'department' => $user->department?->name,
                'manager_id' => $user->manager_id,
                'manager' => $user->manager?->name,
                'approval_ceiling' => $user->role === Role::Direction ? null : round($user->ceilingCents() / 100, 2),
                'daily_rate' => round(((int) $user->daily_rate_cents) / 100, 2),
                'employed_from' => $user->employed_from?->toDateString(),
                'employed_until' => $user->employed_until?->toDateString(),
                'is_field_only' => $user->is_field_only,
                'active' => $user->isActive(),
            ]),
            'assets' => Asset::query()->with(['zone:id,name', 'costCentre:id,name'])->withCount(['workOrders as open_work_orders' => fn ($query) => $query->open()])->orderBy('name')->get()->map(fn (Asset $asset): array => [
                'id' => $asset->id,
                'code' => $asset->code,
                'name' => $asset->name,
                'kind' => $asset->kind->value,
                'kind_label' => $asset->kind->label(),
                'category' => $asset->category,
                'site_id' => $asset->site_id,
                'zone_id' => $asset->zone_id,
                'zone' => $asset->zone?->name,
                'cost_centre_id' => $asset->cost_centre_id,
                'cost_centre' => $asset->costCentre?->name,
                'criticality' => $asset->criticality->value,
                'criticality_label' => $asset->criticality->label(),
                'status' => $asset->status->value,
                'status_label' => $asset->status->label(),
                'manufacturer' => $asset->manufacturer,
                'model' => $asset->model,
                'serial_number' => $asset->serial_number,
                'commissioned_on' => $asset->commissioned_on?->toDateString(),
                'meter_unit' => $asset->meter_unit,
                'meter_current' => (float) $asset->meter_current,
                'notes' => $asset->notes,
                'open_work_orders' => $asset->open_work_orders,
            ]),
            'sites' => Site::query()->orderBy('name')->get(['id', 'code', 'name']),
            'departments' => Department::query()->orderBy('name')->get(['id', 'site_id', 'name']),
            'zones' => Zone::query()->orderBy('name')->get(['id', 'site_id', 'name']),
            'cost_centres' => CostCentre::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'code']),
            'roles' => collect(Role::cases())->map(fn (Role $role): array => ['value' => $role->value, 'label' => $role->label()]),
            'asset_kinds' => collect(AssetKind::cases())->map(fn (AssetKind $kind): array => ['value' => $kind->value, 'label' => $kind->label()]),
            'asset_statuses' => collect(AssetStatus::cases())->map(fn (AssetStatus $status): array => ['value' => $status->value, 'label' => $status->label()]),
            'criticalities' => collect(Criticality::cases())->map(fn (Criticality $criticality): array => ['value' => $criticality->value, 'label' => $criticality->label()]),
        ]);
    }

    public function storeUser(Request $request): RedirectResponse
    {
        [$actor, $data] = $this->validatedAdmin($request, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10'],
            ...$this->userRules(),
        ]);

        return $this->perform(function () use ($actor, $data): string {
            Gate::forUser($actor)->authorize('create', User::class);
            $user = User::query()->create($this->userPayload($data) + [
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make((string) $data['password']),
                'email_verified_at' => now(),
            ]);

            return "Le compte de {$user->name} a été créé.";
        });
    }

    public function updateUser(Request $request, User $user): RedirectResponse
    {
        [$actor, $data] = $this->validatedAdmin($request, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:10'],
            ...$this->userRules(),
        ]);

        return $this->perform(function () use ($actor, $data, $user): string {
            Gate::forUser($actor)->authorize('update', $user);
            $newCeiling = $this->moneyToCents($data['approval_ceiling'] ?? 0);
            if ($newCeiling !== (int) ($user->approval_ceiling_cents ?? 0)) {
                Gate::forUser($actor)->authorize('setCeiling', $user);
            }
            if (($user->role === Role::Direction && $data['role'] !== Role::Direction->value) || ($data['employed_until'] ?? null) !== null) {
                Gate::forUser($actor)->authorize('deactivate', $user);
            }

            $payload = $this->userPayload($data) + ['name' => $data['name'], 'email' => $data['email']];
            if (! empty($data['password'])) {
                $payload['password'] = Hash::make((string) $data['password']);
            }
            $user->update($payload);

            return "Le profil de {$user->name} a été mis à jour.";
        });
    }

    public function storeAsset(Request $request): RedirectResponse
    {
        [$actor, $data] = $this->validatedAdmin($request, ['code' => ['required', 'string', 'max:30', 'unique:assets,code'], ...$this->assetRules()]);

        return $this->perform(function () use ($actor, $data): string {
            $this->authorizeAssets($actor);
            $asset = Asset::query()->create($data);

            return "Le bien {$asset->code} a été ajouté au parc.";
        });
    }

    public function updateAsset(Request $request, Asset $asset): RedirectResponse
    {
        [$actor, $data] = $this->validatedAdmin($request, ['code' => ['required', 'string', 'max:30', Rule::unique('assets', 'code')->ignore($asset->id)], ...$this->assetRules()]);

        return $this->perform(function () use ($actor, $data, $asset): string {
            $this->authorizeAssets($actor);
            $asset->update($data);

            return "Le bien {$asset->code} a été mis à jour.";
        });
    }

    /** @return array<string, mixed> */
    private function userRules(): array
    {
        return [
            'role' => ['required', Rule::enum(Role::class)], 'job_title' => ['nullable', 'string', 'max:255'],
            'site_id' => ['required', 'integer', 'exists:sites,id'], 'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'], 'approval_ceiling' => ['nullable', 'numeric', 'min:0'],
            'daily_rate' => ['nullable', 'numeric', 'min:0'], 'employed_from' => ['nullable', 'date'],
            'employed_until' => ['nullable', 'date', 'after_or_equal:employed_from'], 'is_field_only' => ['boolean'],
        ];
    }

    /** @return array<string, mixed> */
    private function assetRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'], 'kind' => ['required', Rule::enum(AssetKind::class)],
            'category' => ['nullable', 'string', 'max:60'], 'site_id' => ['required', 'integer', 'exists:sites,id'],
            'zone_id' => ['nullable', 'integer', 'exists:zones,id'], 'cost_centre_id' => ['nullable', 'integer', 'exists:cost_centres,id'],
            'criticality' => ['required', Rule::enum(Criticality::class)], 'status' => ['required', Rule::enum(AssetStatus::class)],
            'manufacturer' => ['nullable', 'string', 'max:255'], 'model' => ['nullable', 'string', 'max:255'],
            'serial_number' => ['nullable', 'string', 'max:255'], 'commissioned_on' => ['nullable', 'date'],
            'meter_unit' => ['nullable', 'string', 'max:20'], 'meter_current' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ];
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function userPayload(array $data): array
    {
        return [
            'role' => $data['role'], 'job_title' => $data['job_title'] ?? null, 'site_id' => $data['site_id'],
            'department_id' => $data['department_id'] ?? null, 'manager_id' => $data['manager_id'] ?? null,
            'approval_ceiling_cents' => $data['role'] === Role::Direction->value ? null : $this->moneyToCents($data['approval_ceiling'] ?? 0),
            'daily_rate_cents' => $this->moneyToCents($data['daily_rate'] ?? 0), 'employed_from' => $data['employed_from'] ?? null,
            'employed_until' => $data['employed_until'] ?? null, 'is_field_only' => (bool) ($data['is_field_only'] ?? false),
        ];
    }

    private function moneyToCents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }

    /** @param array<string, mixed> $rules @return array{User, array<string, mixed>} */
    private function validatedAdmin(Request $request, array $rules): array
    {
        $request->validate(['site_code' => ['required', 'string'], 'actor_id' => ['required', 'integer', 'exists:users,id']]);
        if (! hash_equals((string) config('dtomate.site_access_code'), (string) $request->string('site_code'))) {
            abort(403, 'Code site invalide.');
        }
        $data = $request->validate($rules);

        return [User::query()->findOrFail((int) $request->integer('actor_id')), $data];
    }

    private function authorizeAssets(User $actor): void
    {
        if (! $actor->isActive() || $actor->role !== Role::Direction) {
            throw new AuthorizationException('Seule la Direction peut administrer le parc matériel.');
        }
    }

    /** @param callable(): string $operation */
    private function perform(callable $operation): RedirectResponse
    {
        try {
            return back()->with('toast', ['type' => 'success', 'message' => $operation()]);
        } catch (RuntimeException|AuthorizationException $exception) {
            return back()->withErrors(['operation' => $exception->getMessage()]);
        }
    }
}
