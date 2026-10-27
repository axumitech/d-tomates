import { Head, useForm } from '@inertiajs/react';
import {
    Building2,
    CircleUserRound,
    Factory,
    Gauge,
    Pencil,
    Plus,
    Search,
    ShieldCheck,
    UserCheck,
    Users,
    Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useFlashToast } from '@/hooks/use-flash-toast';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };
type Staff = {
    modules: string[];
    id: number;
    name: string;
    email: string;
    job_title: string | null;
    role: string;
    role_label: string;
    site_id: number | null;
    department_id: number | null;
    department: string | null;
    manager_id: number | null;
    manager: string | null;
    approval_ceiling: number | null;
    daily_rate: number;
    employed_from: string | null;
    employed_until: string | null;
    is_field_only: boolean;
    active: boolean;
};
type Asset = {
    id: number;
    code: string;
    name: string;
    kind: string;
    kind_label: string;
    category: string | null;
    site_id: number;
    zone_id: number | null;
    zone: string | null;
    cost_centre_id: number | null;
    cost_centre: string | null;
    criticality: string;
    criticality_label: string;
    status: string;
    status_label: string;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    commissioned_on: string | null;
    meter_unit: string | null;
    meter_current: number;
    notes: string | null;
    open_work_orders: number;
};
type Props = {
    modules: Option[];
    can_manage_users: boolean;
    staff: Staff[];
    assets: Asset[];
    sites: Array<{ id: number; code: string; name: string }>;
    departments: Array<{ id: number; site_id: number; name: string }>;
    zones: Array<{ id: number; site_id: number; name: string }>;
    cost_centres: Array<{ id: number; name: string; code: string }>;
    roles: Option[];
    asset_kinds: Option[];
    asset_statuses: Option[];
    criticalities: Option[];
};

const money = (amount: number | null) =>
    amount === null
        ? 'Illimité'
        : new Intl.NumberFormat('fr-FR', {
              style: 'currency',
              currency: 'USD',
          }).format(amount);
const roleTone: Record<string, string> = {
    direction: 'bg-violet-50 text-violet-700 border-violet-200',
    superviseur: 'bg-sky-50 text-sky-700 border-sky-200',
    magasinier: 'bg-orange-50 text-orange-700 border-orange-200',
    agent: 'bg-slate-50 text-slate-700 border-slate-200',
};
const statusTone: Record<string, string> = {
    in_service: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    degraded: 'bg-amber-50 text-amber-700 border-amber-200',
    down: 'bg-red-50 text-red-700 border-red-200',
    retired: 'bg-slate-100 text-slate-600 border-slate-200',
};

function FieldSelect({
    label,
    value,
    onChange,
    options,
    placeholder,
    disabled,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
}) {
    return (
        <div className="grid gap-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function AdminAccess({
    actor,
    code,
    directions,
    onActor,
    onCode,
}: {
    actor: string;
    code: string;
    directions: Staff[];
    onActor: (value: string) => void;
    onCode: (value: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <FieldSelect
                label="Autorisé par"
                value={actor}
                onChange={onActor}
                options={directions.map((user) => ({
                    value: String(user.id),
                    label: user.name,
                }))}
                placeholder="Direction"
            />
            <div className="grid gap-2">
                <Label>Code site</Label>
                <Input
                    type="password"
                    value={code}
                    onChange={(event) => onCode(event.target.value)}
                />
            </div>
        </div>
    );
}

function StaffDialog({ user, props }: { user?: Staff; props: Props }) {
    const [open, setOpen] = useState(false);
    const form = useForm({
        name: user?.name ?? '',
        email: user?.email ?? '',
        password: '',
        password_confirmation: '',
        role: user?.role ?? 'agent',
        job_title: user?.job_title ?? '',
        site_id: String(user?.site_id ?? props.sites[0]?.id ?? ''),
        department_id: user?.department_id ? String(user.department_id) : '',
        manager_id: user?.manager_id ? String(user.manager_id) : '',
        approval_ceiling: String(user?.approval_ceiling ?? 0),
        daily_rate: String(user?.daily_rate ?? 0),
        employed_from: user?.employed_from ?? '',
        employed_until: user?.employed_until ?? '',
        is_field_only: user?.is_field_only ?? true,
        modules: user?.modules ?? ['taches', 'carnet'],
        operation: '',
    });
    const managers = props.staff.filter(
        (entry) => entry.active && entry.id !== user?.id,
    );
    const onSuccess = () => {
        form.reset('password', 'password_confirmation');
        setOpen(false);
    };
    const submit = () =>
        user
            ? form.patch(`/administration/equipe/${user.id}`, {
                  preserveScroll: true,
                  onSuccess,
              })
            : form.post('/administration/equipe', {
                  preserveScroll: true,
                  onSuccess,
              });

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                setOpen(value);

                if (!value) {
                    form.reset('password', 'password_confirmation');
                    form.clearErrors();
                }
            }}
        >
            <DialogTrigger asChild>
                {user ? (
                    <Button size="sm" variant="ghost">
                        <Pencil /> Modifier
                    </Button>
                ) : (
                    <Button className="bg-violet-700 text-white hover:bg-violet-800">
                        <Plus /> Ajouter un employé
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {user
                            ? `Modifier ${user.name}`
                            : 'Ajouter un membre à l’équipe'}
                    </DialogTitle>
                    <DialogDescription>
                        Le compte, la délégation et la période d’emploi sont
                        gérés au même endroit.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label>Nom complet</Label>
                            <Input
                                value={form.data.name}
                                onChange={(event) =>
                                    form.setData('name', event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Adresse e-mail</Label>
                            <Input
                                type="email"
                                value={form.data.email}
                                onChange={(event) =>
                                    form.setData('email', event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label
                                htmlFor={`staff-password-${user?.id ?? 'new'}`}
                            >
                                {user
                                    ? 'Définir ou remplacer le mot de passe'
                                    : 'Mot de passe'}
                            </Label>
                            <Input
                                id={`staff-password-${user?.id ?? 'new'}`}
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                required={!user}
                                value={form.data.password}
                                onChange={(event) =>
                                    form.setData('password', event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label
                                htmlFor={`staff-password-confirmation-${user?.id ?? 'new'}`}
                            >
                                Confirmer le mot de passe
                            </Label>
                            <Input
                                id={`staff-password-confirmation-${user?.id ?? 'new'}`}
                                type="password"
                                autoComplete="new-password"
                                required={!user || Boolean(form.data.password)}
                                value={form.data.password_confirmation}
                                onChange={(event) =>
                                    form.setData(
                                        'password_confirmation',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <p className="text-sm text-muted-foreground sm:col-span-2">
                            Au moins 12 caractères, avec majuscule, minuscule,
                            chiffre et symbole.
                            {user &&
                                ' Laissez les champs vides pour conserver le mot de passe actuel. Aucun ancien mot de passe n’est nécessaire.'}
                        </p>
                        {user && !user.active && (
                            <p className="text-sm text-amber-700 sm:col-span-2">
                                Ce compte est inactif. Vérifiez aussi les dates
                                d’emploi pour permettre la connexion.
                            </p>
                        )}
                        <div className="grid gap-2">
                            <Label>Fonction</Label>
                            <Input
                                value={form.data.job_title}
                                onChange={(event) =>
                                    form.setData(
                                        'job_title',
                                        event.target.value,
                                    )
                                }
                                placeholder="Ex. Technicien irrigation"
                            />
                        </div>
                        <FieldSelect
                            label="Rôle"
                            value={form.data.role}
                            onChange={(value) => form.setData('role', value)}
                            options={props.roles}
                        />
                        <FieldSelect
                            label="Département"
                            value={form.data.department_id}
                            onChange={(value) =>
                                form.setData('department_id', value)
                            }
                            options={props.departments.map((entry) => ({
                                value: String(entry.id),
                                label: entry.name,
                            }))}
                            placeholder="Aucun"
                        />
                        <FieldSelect
                            label="Supérieur hiérarchique"
                            value={form.data.manager_id}
                            onChange={(value) =>
                                form.setData('manager_id', value)
                            }
                            options={managers.map((entry) => ({
                                value: String(entry.id),
                                label: entry.name,
                            }))}
                            placeholder="Aucun"
                        />
                        <div className="grid gap-2">
                            <Label>Taux journalier (USD)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.data.daily_rate}
                                onChange={(event) =>
                                    form.setData(
                                        'daily_rate',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        {form.data.role !== 'direction' && (
                            <div className="grid gap-2">
                                <Label>Plafond d’engagement (USD)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.data.approval_ceiling}
                                    onChange={(event) =>
                                        form.setData(
                                            'approval_ceiling',
                                            event.target.value,
                                        )
                                    }
                                />
                            </div>
                        )}
                        <div className="grid gap-2">
                            <Label>Début d’emploi</Label>
                            <Input
                                type="date"
                                value={form.data.employed_from}
                                onChange={(event) =>
                                    form.setData(
                                        'employed_from',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Fin d’emploi</Label>
                            <Input
                                type="date"
                                value={form.data.employed_until}
                                onChange={(event) =>
                                    form.setData(
                                        'employed_until',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                        <input
                            type="checkbox"
                            checked={form.data.is_field_only}
                            onChange={(event) =>
                                form.setData(
                                    'is_field_only',
                                    event.target.checked,
                                )
                            }
                        />{' '}
                        Compte principalement utilisé sur le terrain
                    </label>
                    <fieldset className="space-y-2 rounded-xl border p-4">
                        <legend className="px-2 font-medium">
                            Modules accessibles
                        </legend>
                        <p className="text-sm text-muted-foreground">
                            Sélectionnez au moins un module. Les droits du rôle
                            restent applicables.
                        </p>
                        {props.modules.map((module) => (
                            <label
                                key={module.value}
                                className="flex items-center gap-2 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    checked={form.data.modules.includes(
                                        module.value,
                                    )}
                                    onChange={(event) =>
                                        form.setData(
                                            'modules',
                                            event.target.checked
                                                ? [
                                                      ...form.data.modules,
                                                      module.value,
                                                  ]
                                                : form.data.modules.filter(
                                                      (value) =>
                                                          value !==
                                                          module.value,
                                                  ),
                                        )
                                    }
                                />
                                {module.label}
                            </label>
                        ))}
                    </fieldset>
                    {Object.keys(form.errors).length > 0 && (
                        <div
                            role="alert"
                            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                        >
                            {Object.entries(form.errors).map(
                                ([field, message]) => (
                                    <p key={field}>{message}</p>
                                ),
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                !form.data.name ||
                                !form.data.email
                            }
                        >
                            {form.processing
                                ? 'Enregistrement…'
                                : user
                                  ? 'Enregistrer les changements'
                                  : 'Créer le compte'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AssetDialog({ asset, props }: { asset?: Asset; props: Props }) {
    const directions = props.staff.filter(
        (entry) => entry.active && entry.role === 'direction',
    );
    const form = useForm({
        code: asset?.code ?? '',
        name: asset?.name ?? '',
        kind: asset?.kind ?? 'equipment',
        category: asset?.category ?? '',
        site_id: String(asset?.site_id ?? props.sites[0]?.id ?? ''),
        zone_id: asset?.zone_id ? String(asset.zone_id) : '',
        cost_centre_id: asset?.cost_centre_id
            ? String(asset.cost_centre_id)
            : '',
        criticality: asset?.criticality ?? 'ordinary',
        status: asset?.status ?? 'in_service',
        manufacturer: asset?.manufacturer ?? '',
        model: asset?.model ?? '',
        serial_number: asset?.serial_number ?? '',
        commissioned_on: asset?.commissioned_on ?? '',
        meter_unit: asset?.meter_unit ?? '',
        meter_current: String(asset?.meter_current ?? 0),
        notes: asset?.notes ?? '',
        actor_id: '',
        site_code: '',
        operation: '',
    });
    const submit = () =>
        asset
            ? form.patch(`/administration/equipements/${asset.id}`, {
                  preserveScroll: true,
              })
            : form.post('/administration/equipements', {
                  preserveScroll: true,
              });

    return (
        <Dialog>
            <DialogTrigger asChild>
                {asset ? (
                    <Button size="sm" variant="ghost">
                        <Pencil /> Modifier
                    </Button>
                ) : (
                    <Button className="bg-emerald-700 text-white hover:bg-emerald-800">
                        <Plus /> Ajouter un bien
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {asset
                            ? `Modifier ${asset.code}`
                            : 'Ajouter un équipement ou une infrastructure'}
                    </DialogTitle>
                    <DialogDescription>
                        La criticité déterminera automatiquement le délai des
                        futurs bons de travail.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <Label>Code unique</Label>
                            <Input
                                value={form.data.code}
                                onChange={(event) =>
                                    form.setData(
                                        'code',
                                        event.target.value.toUpperCase(),
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Nom du bien</Label>
                            <Input
                                value={form.data.name}
                                onChange={(event) =>
                                    form.setData('name', event.target.value)
                                }
                            />
                        </div>
                        <FieldSelect
                            label="Nature"
                            value={form.data.kind}
                            onChange={(value) => form.setData('kind', value)}
                            options={props.asset_kinds}
                        />
                        <div className="grid gap-2">
                            <Label>Catégorie</Label>
                            <Input
                                value={form.data.category}
                                onChange={(event) =>
                                    form.setData('category', event.target.value)
                                }
                                placeholder="Pompe, irrigation, bâtiment…"
                            />
                        </div>
                        <FieldSelect
                            label="Criticité"
                            value={form.data.criticality}
                            onChange={(value) =>
                                form.setData('criticality', value)
                            }
                            options={props.criticalities}
                        />
                        <FieldSelect
                            label="État"
                            value={form.data.status}
                            onChange={(value) => form.setData('status', value)}
                            options={props.asset_statuses}
                        />
                        <FieldSelect
                            label="Zone"
                            value={form.data.zone_id}
                            onChange={(value) => form.setData('zone_id', value)}
                            options={props.zones.map((entry) => ({
                                value: String(entry.id),
                                label: entry.name,
                            }))}
                            placeholder="Aucune"
                        />
                        <FieldSelect
                            label="Centre de coût"
                            value={form.data.cost_centre_id}
                            onChange={(value) =>
                                form.setData('cost_centre_id', value)
                            }
                            options={props.cost_centres.map((entry) => ({
                                value: String(entry.id),
                                label: `${entry.code} · ${entry.name}`,
                            }))}
                            placeholder="Aucun"
                        />
                        <div className="grid gap-2">
                            <Label>Fabricant</Label>
                            <Input
                                value={form.data.manufacturer}
                                onChange={(event) =>
                                    form.setData(
                                        'manufacturer',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Modèle</Label>
                            <Input
                                value={form.data.model}
                                onChange={(event) =>
                                    form.setData('model', event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Numéro de série</Label>
                            <Input
                                value={form.data.serial_number}
                                onChange={(event) =>
                                    form.setData(
                                        'serial_number',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Mise en service</Label>
                            <Input
                                type="date"
                                value={form.data.commissioned_on}
                                onChange={(event) =>
                                    form.setData(
                                        'commissioned_on',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Unité du compteur</Label>
                            <Input
                                value={form.data.meter_unit}
                                onChange={(event) =>
                                    form.setData(
                                        'meter_unit',
                                        event.target.value,
                                    )
                                }
                                placeholder="h, km…"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Relevé actuel</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.data.meter_current}
                                onChange={(event) =>
                                    form.setData(
                                        'meter_current',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>Notes</Label>
                        <textarea
                            className="min-h-24 rounded-md border bg-transparent p-3 text-sm"
                            value={form.data.notes}
                            onChange={(event) =>
                                form.setData('notes', event.target.value)
                            }
                        />
                    </div>
                    <AdminAccess
                        actor={form.data.actor_id}
                        code={form.data.site_code}
                        directions={directions}
                        onActor={(value) => form.setData('actor_id', value)}
                        onCode={(value) => form.setData('site_code', value)}
                    />
                    {form.errors.operation && (
                        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                            {form.errors.operation}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                !form.data.code ||
                                !form.data.name ||
                                !form.data.actor_id
                            }
                        >
                            {form.processing
                                ? 'Enregistrement…'
                                : asset
                                  ? 'Enregistrer les changements'
                                  : 'Ajouter au parc'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function Administration(props: Props) {
    useFlashToast();
    const [tab, setTab] = useState<'staff' | 'assets'>('staff');
    const [query, setQuery] = useState('');
    const staff = useMemo(
        () =>
            props.staff.filter((user) =>
                `${user.name} ${user.email} ${user.job_title ?? ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [props.staff, query],
    );
    const assets = useMemo(
        () =>
            props.assets.filter((asset) =>
                `${asset.code} ${asset.name} ${asset.category ?? ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
            ),
        [props.assets, query],
    );
    const activeStaff = props.staff.filter((user) => user.active).length;
    const activeAssets = props.assets.filter(
        (asset) => asset.status !== 'retired',
    ).length;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Pilotage', href: '/' },
                { title: 'Administration', href: '/administration' },
            ]}
        >
            <Head title="Administration" />
            <main className="min-h-full bg-[#f7f6f2] p-4 text-slate-900 md:p-7 dark:bg-[#111712] dark:text-slate-100">
                <div className="mx-auto max-w-[1450px] space-y-5">
                    <header className="overflow-hidden rounded-3xl bg-[#252b38] p-6 text-white md:p-8">
                        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.2em] text-violet-300 uppercase">
                                    Organisation & patrimoine
                                </p>
                                <h1 className="mt-2 text-3xl font-semibold">
                                    Administration D’Tomate
                                </h1>
                                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                                    Gérez les responsabilités humaines et les
                                    biens qui soutiennent la production, sans
                                    perdre leur historique.
                                </p>
                            </div>
                            <div>
                                {tab === 'staff' ? (
                                    props.can_manage_users && (
                                        <StaffDialog props={props} />
                                    )
                                ) : (
                                    <AssetDialog props={props} />
                                )}
                            </div>
                        </div>
                    </header>
                    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                label: 'Effectif actif',
                                value: activeStaff,
                                icon: UserCheck,
                                tone: 'bg-violet-50 text-violet-700',
                            },
                            {
                                label: 'Comptes Direction',
                                value: props.staff.filter(
                                    (user) =>
                                        user.active &&
                                        user.role === 'direction',
                                ).length,
                                icon: ShieldCheck,
                                tone: 'bg-sky-50 text-sky-700',
                            },
                            {
                                label: 'Parc suivi',
                                value: activeAssets,
                                icon: Factory,
                                tone: 'bg-emerald-50 text-emerald-700',
                            },
                            {
                                label: 'Biens à l’arrêt',
                                value: props.assets.filter(
                                    (asset) => asset.status === 'down',
                                ).length,
                                icon: Wrench,
                                tone: 'bg-red-50 text-red-700',
                            },
                        ].map(({ label, value, icon: Icon, tone }) => (
                            <article
                                key={label}
                                className="rounded-2xl border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                            >
                                <div className="flex items-center justify-between">
                                    <div
                                        className={cn('rounded-xl p-2.5', tone)}
                                    >
                                        <Icon className="size-5" />
                                    </div>
                                    <strong className="text-3xl">
                                        {value}
                                    </strong>
                                </div>
                                <p className="mt-4 text-sm font-medium">
                                    {label}
                                </p>
                            </article>
                        ))}
                    </section>
                    <section className="rounded-2xl border bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex flex-col justify-between gap-4 border-b p-4 md:flex-row md:items-center">
                            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTab('staff');
                                        setQuery('');
                                    }}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                                        tab === 'staff' &&
                                            'bg-white shadow-sm dark:bg-slate-800',
                                    )}
                                >
                                    <Users className="size-4" /> Équipe
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTab('assets');
                                        setQuery('');
                                    }}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                                        tab === 'assets' &&
                                            'bg-white shadow-sm dark:bg-slate-800',
                                    )}
                                >
                                    <Building2 className="size-4" /> Équipements
                                </button>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
                                <Input
                                    className="pl-9"
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder={
                                        tab === 'staff'
                                            ? 'Rechercher une personne…'
                                            : 'Rechercher dans le parc…'
                                    }
                                />
                            </div>
                        </div>
                        {tab === 'staff' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[960px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs tracking-wider text-slate-500 uppercase dark:bg-white/[0.03]">
                                        <tr>
                                            <th className="px-5 py-3">
                                                Personne
                                            </th>
                                            <th className="px-5 py-3">Rôle</th>
                                            <th className="px-5 py-3">
                                                Affectation
                                            </th>
                                            <th className="px-5 py-3">
                                                Délégation
                                            </th>
                                            <th className="px-5 py-3">
                                                Statut
                                            </th>
                                            <th className="px-5 py-3 text-right">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {staff.map((user) => (
                                            <tr
                                                key={user.id}
                                                className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
                                            >
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="grid size-10 place-items-center rounded-full bg-slate-100 font-semibold text-slate-600">
                                                            <CircleUserRound className="size-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold">
                                                                {user.name}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {user.email} ·{' '}
                                                                {user.job_title ||
                                                                    'Fonction non précisée'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            roleTone[user.role]
                                                        }
                                                    >
                                                        {user.role_label}
                                                    </Badge>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <p>
                                                        {user.department ||
                                                            'Site'}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Supérieur :{' '}
                                                        {user.manager || '—'}
                                                    </p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <p className="font-medium">
                                                        {money(
                                                            user.approval_ceiling,
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Taux{' '}
                                                        {money(user.daily_rate)}
                                                        /jour
                                                    </p>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <Badge
                                                        variant={
                                                            user.active
                                                                ? 'outline'
                                                                : 'secondary'
                                                        }
                                                        className={
                                                            user.active
                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                : ''
                                                        }
                                                    >
                                                        {user.active
                                                            ? 'Actif'
                                                            : `Sorti ${user.employed_until ?? ''}`}
                                                    </Badge>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    {props.can_manage_users && (
                                                        <StaffDialog
                                                            user={user}
                                                            props={props}
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                                {assets.map((asset) => (
                                    <article
                                        key={asset.id}
                                        className="rounded-2xl border p-5"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                                                {asset.kind === 'equipment' ? (
                                                    <Gauge className="size-5" />
                                                ) : (
                                                    <Building2 className="size-5" />
                                                )}
                                            </div>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    statusTone[asset.status]
                                                }
                                            >
                                                {asset.status_label}
                                            </Badge>
                                        </div>
                                        <p className="mt-4 text-xs font-semibold text-emerald-700">
                                            {asset.code}
                                        </p>
                                        <h3 className="mt-1 text-lg font-semibold">
                                            {asset.name}
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-500">
                                            {asset.kind_label} ·{' '}
                                            {asset.category || 'Sans catégorie'}
                                        </p>
                                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/[0.04]">
                                            <div>
                                                <p className="text-slate-500">
                                                    Criticité
                                                </p>
                                                <p className="mt-1 font-medium">
                                                    {
                                                        asset.criticality_label.split(
                                                            ' — ',
                                                        )[0]
                                                    }
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">
                                                    Zone
                                                </p>
                                                <p className="mt-1 font-medium">
                                                    {asset.zone || 'Site'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">
                                                    Compteur
                                                </p>
                                                <p className="mt-1 font-medium">
                                                    {asset.meter_unit
                                                        ? `${asset.meter_current} ${asset.meter_unit}`
                                                        : 'Sans compteur'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-slate-500">
                                                    Bons ouverts
                                                </p>
                                                <p className="mt-1 font-medium">
                                                    {asset.open_work_orders}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-xs text-slate-500">
                                                {asset.manufacturer || ''}{' '}
                                                {asset.model || ''}
                                            </span>
                                            <AssetDialog
                                                asset={asset}
                                                props={props}
                                            />
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </AppLayout>
    );
}
