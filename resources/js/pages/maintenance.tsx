import { Head, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Clock3,
    Cog,
    History,
    PackagePlus,
    Play,
    Plus,
    Search,
    UserRoundCheck,
    Users,
    Wrench,
    XCircle,
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

type Staff = { id: number; name: string; role: string; role_label: string };
type Asset = {
    id: number;
    code: string;
    name: string;
    criticality: string;
    status: string;
};
type Item = {
    id: number;
    code: string;
    name: string;
    dimension: string;
    usage_unit_code: string;
    balance_base: number;
};
type Unit = { code: string; label: string; dimension: string };
type Event = {
    id: number;
    event: string;
    from_status: string | null;
    to_status: string | null;
    note: string | null;
    user: string;
    occurred_at: string;
};
type Order = {
    id: number;
    reference: string;
    title: string;
    description: string | null;
    type: string;
    type_label: string;
    status: string;
    status_label: string;
    criticality: string;
    asset: { id: number; code: string; name: string; status: string };
    assigned_to: { id: number; name: string } | null;
    reported_by: { id: number; name: string } | null;
    reported_at: string;
    due_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    overdue: boolean;
    asset_stopped: boolean;
    resolution: string | null;
    cost_parts_cents: number;
    cost_labour_cents: number;
    cost_external_cents: number;
    total_cost_cents: number;
    events: Event[];
    parts: Array<{
        id: number;
        item: string;
        quantity: number;
        unit: string;
        cost_cents: number;
    }>;
    labour: Array<{
        id: number;
        name: string;
        hours: number;
        cost_cents: number;
    }>;
};
type Props = {
    summary: {
        open: number;
        overdue: number;
        awaiting_parts: number;
        done: number;
    };
    orders: Order[];
    assets: Asset[];
    staff: Staff[];
    items: Item[];
    units: Unit[];
    asset_statuses: Array<{ value: string; label: string }>;
};
type Action =
    | 'assign'
    | 'start'
    | 'await-parts'
    | 'part'
    | 'labour'
    | 'complete'
    | 'cancel';

const money = (cents: number) =>
    new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'USD',
    }).format(cents / 100);
const statusTone: Record<string, string> = {
    raised: 'border-amber-200 bg-amber-50 text-amber-800',
    assigned: 'border-sky-200 bg-sky-50 text-sky-800',
    in_progress: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    awaiting_parts: 'border-orange-200 bg-orange-50 text-orange-800',
    done: 'border-slate-200 bg-slate-100 text-slate-700',
    cancelled: 'border-red-200 bg-red-50 text-red-700',
};

function FieldSelect({
    label,
    value,
    onChange,
    placeholder,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    options: Array<{ value: string; label: string }>;
}) {
    return (
        <div className="grid gap-2">
            <Label>{label}</Label>
            <Select value={value} onValueChange={onChange}>
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

function AccessFields({
    actor,
    code,
    staff,
    onActor,
    onCode,
}: {
    actor: string;
    code: string;
    staff: Staff[];
    onActor: (value: string) => void;
    onCode: (value: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <FieldSelect
                label="Action réalisée par"
                value={actor}
                onChange={onActor}
                placeholder="Responsable"
                options={staff.map((user) => ({
                    value: String(user.id),
                    label: `${user.name} · ${user.role_label}`,
                }))}
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

function NewOrderDialog({
    assets,
    staff,
}: {
    assets: Asset[];
    staff: Staff[];
}) {
    const form = useForm({
        asset_id: '',
        title: '',
        description: '',
        reported_by: '',
        asset_stopped: false,
        site_code: '',
    });

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button className="bg-emerald-700 text-white hover:bg-emerald-800">
                    <Plus /> Nouveau bon
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Signaler un incident</DialogTitle>
                    <DialogDescription>
                        Le délai d’intervention sera calculé automatiquement
                        selon la criticité du bien.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post('/maintenance', { preserveScroll: true });
                    }}
                >
                    <FieldSelect
                        label="Bien concerné"
                        value={form.data.asset_id}
                        onChange={(value) => form.setData('asset_id', value)}
                        placeholder="Équipement ou infrastructure"
                        options={assets.map((asset) => ({
                            value: String(asset.id),
                            label: `${asset.code} · ${asset.name}`,
                        }))}
                    />
                    <div className="grid gap-2">
                        <Label>Titre de l’incident</Label>
                        <Input
                            value={form.data.title}
                            onChange={(event) =>
                                form.setData('title', event.target.value)
                            }
                            placeholder="Ex. Pression anormalement basse"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Description</Label>
                        <textarea
                            className="min-h-24 rounded-md border bg-transparent p-3 text-sm"
                            value={form.data.description}
                            onChange={(event) =>
                                form.setData('description', event.target.value)
                            }
                        />
                    </div>
                    <FieldSelect
                        label="Signalé par"
                        value={form.data.reported_by}
                        onChange={(value) => form.setData('reported_by', value)}
                        options={staff.map((user) => ({
                            value: String(user.id),
                            label: user.name,
                        }))}
                    />
                    <label className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                        <input
                            type="checkbox"
                            checked={form.data.asset_stopped}
                            onChange={(event) =>
                                form.setData(
                                    'asset_stopped',
                                    event.target.checked,
                                )
                            }
                        />{' '}
                        La production est arrêtée
                    </label>
                    <div className="grid gap-2">
                        <Label>Code site</Label>
                        <Input
                            type="password"
                            value={form.data.site_code}
                            onChange={(event) =>
                                form.setData('site_code', event.target.value)
                            }
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                !form.data.asset_id ||
                                !form.data.title ||
                                !form.data.reported_by
                            }
                        >
                            Ouvrir le bon
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

const actionMeta: Record<
    Action,
    {
        title: string;
        description: string;
        button: string;
        icon: typeof Play;
        destructive?: boolean;
    }
> = {
    assign: {
        title: 'Assigner le bon',
        description: 'Choisissez la personne responsable de l’intervention.',
        button: 'Confirmer l’assignation',
        icon: UserRoundCheck,
    },
    start: {
        title: 'Démarrer l’intervention',
        description: 'Cette action horodate le début réel du travail.',
        button: 'Démarrer maintenant',
        icon: Play,
    },
    'await-parts': {
        title: 'Mettre en attente',
        description:
            'Précisez la pièce ou la ressource qui bloque l’intervention.',
        button: 'Mettre en attente',
        icon: Clock3,
    },
    part: {
        title: 'Sortir une pièce',
        description:
            'La quantité sera déduite du stock dans la même transaction.',
        button: 'Sortir du stock',
        icon: PackagePlus,
    },
    labour: {
        title: 'Ajouter de la main-d’œuvre',
        description: 'L’agent doit être pointé présent aujourd’hui.',
        button: 'Ajouter le temps',
        icon: Users,
    },
    complete: {
        title: 'Clôturer le bon',
        description: 'La résolution et l’état final du bien sont obligatoires.',
        button: 'Clôturer définitivement',
        icon: CheckCircle2,
    },
    cancel: {
        title: 'Annuler le bon',
        description: 'Le bon restera dans l’historique avec son motif.',
        button: 'Annuler le bon',
        icon: XCircle,
        destructive: true,
    },
};

function OrderActionDialog({
    action,
    order,
    staff,
    items,
    units,
    statuses,
}: {
    action: Action;
    order: Order;
    staff: Staff[];
    items: Item[];
    units: Unit[];
    statuses: Props['asset_statuses'];
}) {
    const meta = actionMeta[action];
    const form = useForm({
        actor_id: '',
        site_code: '',
        assigned_to: '',
        note: '',
        item_id: '',
        unit_code: '',
        quantity: '1',
        worker_id: '',
        hours: '1',
        resolution: '',
        asset_status: 'in_service',
        failure_cause: '',
        external_cost: '0',
        provider_name: '',
        reason: '',
        operation: '',
    });
    const selectedItem = items.find(
        (item) => String(item.id) === form.data.item_id,
    );
    const compatibleUnits = selectedItem
        ? units.filter((unit) => unit.dimension === selectedItem.dimension)
        : units;
    const endpoint =
        action === 'part' ? 'parts' : action === 'labour' ? 'labour' : action;

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant={
                        meta.destructive
                            ? 'destructive'
                            : action === 'complete'
                              ? 'default'
                              : 'outline'
                    }
                    className={
                        action === 'complete'
                            ? 'bg-emerald-700 hover:bg-emerald-800'
                            : ''
                    }
                >
                    <meta.icon /> {meta.title.split(' ')[0]}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{meta.title}</DialogTitle>
                    <DialogDescription>{meta.description}</DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post(`/maintenance/${order.id}/${endpoint}`, {
                            preserveScroll: true,
                        });
                    }}
                >
                    {action === 'assign' && (
                        <FieldSelect
                            label="Assigner à"
                            value={form.data.assigned_to}
                            onChange={(value) =>
                                form.setData('assigned_to', value)
                            }
                            options={staff.map((user) => ({
                                value: String(user.id),
                                label: `${user.name} · ${user.role_label}`,
                            }))}
                        />
                    )}
                    {action === 'await-parts' && (
                        <div className="grid gap-2">
                            <Label>Pièce ou blocage</Label>
                            <textarea
                                className="min-h-24 rounded-md border bg-transparent p-3 text-sm"
                                value={form.data.note}
                                onChange={(event) =>
                                    form.setData('note', event.target.value)
                                }
                            />
                        </div>
                    )}
                    {action === 'part' && (
                        <>
                            <FieldSelect
                                label="Article"
                                value={form.data.item_id}
                                onChange={(value) => {
                                    form.setData('item_id', value);
                                    const item = items.find(
                                        (entry) => String(entry.id) === value,
                                    );
                                    form.setData(
                                        'unit_code',
                                        item?.usage_unit_code ?? '',
                                    );
                                }}
                                options={items.map((item) => ({
                                    value: String(item.id),
                                    label: `${item.code} · ${item.name}`,
                                }))}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <FieldSelect
                                    label="Unité"
                                    value={form.data.unit_code}
                                    onChange={(value) =>
                                        form.setData('unit_code', value)
                                    }
                                    options={compatibleUnits.map((unit) => ({
                                        value: unit.code,
                                        label: `${unit.code} · ${unit.label}`,
                                    }))}
                                />
                                <div className="grid gap-2">
                                    <Label>Quantité</Label>
                                    <Input
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        value={form.data.quantity}
                                        onChange={(event) =>
                                            form.setData(
                                                'quantity',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                            </div>
                            {selectedItem && (
                                <p className="text-xs text-slate-500">
                                    Stock disponible en base :{' '}
                                    {selectedItem.balance_base.toLocaleString(
                                        'fr-FR',
                                    )}
                                </p>
                            )}
                        </>
                    )}
                    {action === 'labour' && (
                        <div className="grid grid-cols-2 gap-3">
                            <FieldSelect
                                label="Intervenant"
                                value={form.data.worker_id}
                                onChange={(value) =>
                                    form.setData('worker_id', value)
                                }
                                options={staff.map((user) => ({
                                    value: String(user.id),
                                    label: user.name,
                                }))}
                            />
                            <div className="grid gap-2">
                                <Label>Heures</Label>
                                <Input
                                    type="number"
                                    min="0.25"
                                    max="24"
                                    step="0.25"
                                    value={form.data.hours}
                                    onChange={(event) =>
                                        form.setData(
                                            'hours',
                                            event.target.value,
                                        )
                                    }
                                />
                            </div>
                        </div>
                    )}
                    {action === 'complete' && (
                        <>
                            <div className="grid gap-2">
                                <Label>Résolution effectuée</Label>
                                <textarea
                                    className="min-h-28 rounded-md border bg-transparent p-3 text-sm"
                                    value={form.data.resolution}
                                    onChange={(event) =>
                                        form.setData(
                                            'resolution',
                                            event.target.value,
                                        )
                                    }
                                />
                            </div>
                            <FieldSelect
                                label="État final du bien"
                                value={form.data.asset_status}
                                onChange={(value) =>
                                    form.setData('asset_status', value)
                                }
                                options={statuses}
                            />
                            <div className="grid gap-2">
                                <Label>Cause de la panne</Label>
                                <Input
                                    value={form.data.failure_cause}
                                    onChange={(event) =>
                                        form.setData(
                                            'failure_cause',
                                            event.target.value,
                                        )
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-2">
                                    <Label>Prestataire externe</Label>
                                    <Input
                                        value={form.data.provider_name}
                                        onChange={(event) =>
                                            form.setData(
                                                'provider_name',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Coût externe (USD)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.data.external_cost}
                                        onChange={(event) =>
                                            form.setData(
                                                'external_cost',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                            </div>
                        </>
                    )}
                    {action === 'cancel' && (
                        <div className="grid gap-2">
                            <Label>Motif d’annulation</Label>
                            <textarea
                                className="min-h-24 rounded-md border bg-transparent p-3 text-sm"
                                value={form.data.reason}
                                onChange={(event) =>
                                    form.setData('reason', event.target.value)
                                }
                            />
                        </div>
                    )}
                    <AccessFields
                        actor={form.data.actor_id}
                        code={form.data.site_code}
                        staff={staff}
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
                            variant={
                                meta.destructive ? 'destructive' : 'default'
                            }
                            disabled={
                                form.processing ||
                                !form.data.actor_id ||
                                !form.data.site_code
                            }
                        >
                            {form.processing ? 'Traitement…' : meta.button}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function Maintenance(props: Props) {
    useFlashToast();
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('open');
    const filtered = useMemo(
        () =>
            props.orders.filter((order) => {
                const matchesText =
                    `${order.reference} ${order.title} ${order.asset.name}`
                        .toLowerCase()
                        .includes(query.toLowerCase());
                const matchesStatus =
                    status === 'all' ||
                    (status === 'open'
                        ? !['done', 'cancelled'].includes(order.status)
                        : order.status === status);

                return matchesText && matchesStatus;
            }),
        [props.orders, query, status],
    );
    const [selectedId, setSelectedId] = useState<number | null>(
        filtered[0]?.id ?? props.orders[0]?.id ?? null,
    );
    const selected =
        props.orders.find((order) => order.id === selectedId) ??
        filtered[0] ??
        null;
    const closed = selected
        ? ['done', 'cancelled'].includes(selected.status)
        : false;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Pilotage', href: '/' },
                { title: 'Maintenance', href: '/maintenance' },
            ]}
        >
            <Head title="Maintenance et bons de travail" />
            <main className="min-h-full bg-[#f5f7f3] p-4 text-slate-900 md:p-7 dark:bg-[#111712] dark:text-slate-100">
                <div className="mx-auto max-w-[1500px] space-y-5">
                    <header className="flex flex-col justify-between gap-4 rounded-3xl bg-[#173f2b] p-6 text-white md:flex-row md:items-end md:p-8">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-200 uppercase">
                                Atelier & infrastructures
                            </p>
                            <h1 className="mt-2 text-3xl font-semibold">
                                Bons de travail
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm text-emerald-50/75">
                                De l’incident à la remise en service, avec
                                pièces, temps, coûts et historique vérifiable.
                            </p>
                        </div>
                        <NewOrderDialog
                            assets={props.assets}
                            staff={props.staff}
                        />
                    </header>
                    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                            {
                                label: 'Bons ouverts',
                                value: props.summary.open,
                                Icon: Wrench,
                                tone: 'text-sky-700 bg-sky-50',
                            },
                            {
                                label: 'Hors délai',
                                value: props.summary.overdue,
                                Icon: AlertTriangle,
                                tone: 'text-red-700 bg-red-50',
                            },
                            {
                                label: 'En attente de pièce',
                                value: props.summary.awaiting_parts,
                                Icon: Boxes,
                                tone: 'text-orange-700 bg-orange-50',
                            },
                            {
                                label: 'Terminés',
                                value: props.summary.done,
                                Icon: CheckCircle2,
                                tone: 'text-emerald-700 bg-emerald-50',
                            },
                        ].map(({ label, value, Icon, tone }) => (
                            <article
                                key={String(label)}
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
                    <section className="grid min-h-[680px] gap-5 xl:grid-cols-[440px_1fr]">
                        <aside className="rounded-2xl border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                            <div className="grid gap-3">
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
                                    <Input
                                        className="pl-9"
                                        value={query}
                                        onChange={(event) =>
                                            setQuery(event.target.value)
                                        }
                                        placeholder="Référence, bien ou incident…"
                                    />
                                </div>
                                <Select
                                    value={status}
                                    onValueChange={setStatus}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="open">
                                            Bons ouverts
                                        </SelectItem>
                                        <SelectItem value="all">
                                            Tous les bons
                                        </SelectItem>
                                        <SelectItem value="raised">
                                            Ouverts non assignés
                                        </SelectItem>
                                        <SelectItem value="assigned">
                                            Assignés
                                        </SelectItem>
                                        <SelectItem value="in_progress">
                                            En cours
                                        </SelectItem>
                                        <SelectItem value="awaiting_parts">
                                            En attente de pièce
                                        </SelectItem>
                                        <SelectItem value="done">
                                            Terminés
                                        </SelectItem>
                                        <SelectItem value="cancelled">
                                            Annulés
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="mt-4 space-y-2">
                                {filtered.map((order) => (
                                    <button
                                        key={order.id}
                                        type="button"
                                        onClick={() => setSelectedId(order.id)}
                                        className={cn(
                                            'w-full rounded-xl border p-4 text-left transition',
                                            selected?.id === order.id
                                                ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-100 dark:bg-emerald-950/30'
                                                : 'border-slate-100 hover:border-slate-300 dark:border-white/10',
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                                {order.reference}
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    statusTone[order.status]
                                                }
                                            >
                                                {order.status_label}
                                            </Badge>
                                        </div>
                                        <p className="mt-2 font-semibold">
                                            {order.title}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {order.asset.code} ·{' '}
                                            {order.asset.name}
                                        </p>
                                        <div className="mt-3 flex justify-between text-xs text-slate-500">
                                            <span>
                                                {order.assigned_to?.name ??
                                                    'Non assigné'}
                                            </span>
                                            <span
                                                className={
                                                    order.overdue
                                                        ? 'font-semibold text-red-600'
                                                        : ''
                                                }
                                            >
                                                {order.due_at ??
                                                    'Sans échéance'}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {filtered.length === 0 && (
                                    <p className="p-8 text-center text-sm text-slate-500">
                                        Aucun bon ne correspond à ce filtre.
                                    </p>
                                )}
                            </div>
                        </aside>
                        <article className="rounded-2xl border bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                            {selected ? (
                                <>
                                    <div className="border-b p-5 md:p-6">
                                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold text-emerald-700">
                                                        {selected.reference}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            statusTone[
                                                                selected.status
                                                            ]
                                                        }
                                                    >
                                                        {selected.status_label}
                                                    </Badge>
                                                    {selected.overdue && (
                                                        <Badge variant="destructive">
                                                            Hors délai
                                                        </Badge>
                                                    )}
                                                </div>
                                                <h2 className="mt-3 text-2xl font-semibold">
                                                    {selected.title}
                                                </h2>
                                                <p className="mt-2 text-sm text-slate-500">
                                                    {selected.asset.code} ·{' '}
                                                    {selected.asset.name} ·{' '}
                                                    {selected.type_label}
                                                </p>
                                            </div>
                                            {!closed && (
                                                <div className="flex max-w-xl flex-wrap gap-2">
                                                    {selected.status ===
                                                        'raised' && (
                                                        <OrderActionDialog
                                                            action="assign"
                                                            order={selected}
                                                            {...props}
                                                            statuses={
                                                                props.asset_statuses
                                                            }
                                                        />
                                                    )}
                                                    {[
                                                        'assigned',
                                                        'awaiting_parts',
                                                    ].includes(
                                                        selected.status,
                                                    ) && (
                                                        <OrderActionDialog
                                                            action="start"
                                                            order={selected}
                                                            {...props}
                                                            statuses={
                                                                props.asset_statuses
                                                            }
                                                        />
                                                    )}
                                                    <OrderActionDialog
                                                        action="await-parts"
                                                        order={selected}
                                                        {...props}
                                                        statuses={
                                                            props.asset_statuses
                                                        }
                                                    />
                                                    <OrderActionDialog
                                                        action="part"
                                                        order={selected}
                                                        {...props}
                                                        statuses={
                                                            props.asset_statuses
                                                        }
                                                    />
                                                    <OrderActionDialog
                                                        action="labour"
                                                        order={selected}
                                                        {...props}
                                                        statuses={
                                                            props.asset_statuses
                                                        }
                                                    />
                                                    <OrderActionDialog
                                                        action="complete"
                                                        order={selected}
                                                        {...props}
                                                        statuses={
                                                            props.asset_statuses
                                                        }
                                                    />
                                                    <OrderActionDialog
                                                        action="cancel"
                                                        order={selected}
                                                        {...props}
                                                        statuses={
                                                            props.asset_statuses
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid gap-5 p-5 md:p-6 lg:grid-cols-[1fr_330px]">
                                        <div className="space-y-5">
                                            <section>
                                                <h3 className="text-sm font-semibold">
                                                    Diagnostic initial
                                                </h3>
                                                <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                                                    {selected.description ||
                                                        'Aucune description complémentaire.'}
                                                </p>
                                            </section>
                                            {selected.resolution && (
                                                <section>
                                                    <h3 className="text-sm font-semibold text-emerald-700">
                                                        Résolution
                                                    </h3>
                                                    <p className="mt-2 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                                                        {selected.resolution}
                                                    </p>
                                                </section>
                                            )}
                                            <section>
                                                <div className="mb-3 flex items-center gap-2">
                                                    <History className="size-4" />
                                                    <h3 className="text-sm font-semibold">
                                                        Historique du bon
                                                    </h3>
                                                </div>
                                                <div className="space-y-0">
                                                    {selected.events.map(
                                                        (event, index) => (
                                                            <div
                                                                key={event.id}
                                                                className="relative flex gap-4 pb-5"
                                                            >
                                                                <div className="relative z-10 mt-1 size-3 rounded-full border-2 border-emerald-600 bg-white" />
                                                                {index <
                                                                    selected
                                                                        .events
                                                                        .length -
                                                                        1 && (
                                                                    <div className="absolute top-3 left-[5px] h-full w-px bg-slate-200" />
                                                                )}
                                                                <div>
                                                                    <p className="text-sm font-medium capitalize">
                                                                        {event.event.replace(
                                                                            '_',
                                                                            ' ',
                                                                        )}
                                                                    </p>
                                                                    <p className="mt-0.5 text-xs text-slate-500">
                                                                        {
                                                                            event.user
                                                                        }{' '}
                                                                        ·{' '}
                                                                        {
                                                                            event.occurred_at
                                                                        }
                                                                    </p>
                                                                    {event.note && (
                                                                        <p className="mt-1 text-sm text-slate-600">
                                                                            {
                                                                                event.note
                                                                            }
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                        <aside className="space-y-4">
                                            <div className="rounded-xl border p-4">
                                                <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                                                    Intervention
                                                </h3>
                                                <dl className="mt-4 grid gap-3 text-sm">
                                                    <div className="flex justify-between">
                                                        <dt>Assigné à</dt>
                                                        <dd className="font-medium">
                                                            {selected
                                                                .assigned_to
                                                                ?.name ?? '—'}
                                                        </dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt>Signalé le</dt>
                                                        <dd>
                                                            {
                                                                selected.reported_at
                                                            }
                                                        </dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt>Échéance</dt>
                                                        <dd
                                                            className={
                                                                selected.overdue
                                                                    ? 'font-semibold text-red-600'
                                                                    : ''
                                                            }
                                                        >
                                                            {selected.due_at ??
                                                                '—'}
                                                        </dd>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <dt>
                                                            Production arrêtée
                                                        </dt>
                                                        <dd>
                                                            {selected.asset_stopped
                                                                ? 'Oui'
                                                                : 'Non'}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </div>
                                            <div className="rounded-xl border p-4">
                                                <div className="flex items-center gap-2">
                                                    <Cog className="size-4" />
                                                    <h3 className="text-sm font-semibold">
                                                        Pièces utilisées
                                                    </h3>
                                                </div>
                                                <div className="mt-3 space-y-2">
                                                    {selected.parts.map(
                                                        (part) => (
                                                            <div
                                                                key={part.id}
                                                                className="flex justify-between text-xs"
                                                            >
                                                                <span>
                                                                    {part.item}{' '}
                                                                    ·{' '}
                                                                    {
                                                                        part.quantity
                                                                    }{' '}
                                                                    {part.unit}
                                                                </span>
                                                                <span>
                                                                    {money(
                                                                        part.cost_cents,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        ),
                                                    )}
                                                    {selected.parts.length ===
                                                        0 && (
                                                        <p className="text-xs text-slate-500">
                                                            Aucune pièce sortie.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border p-4">
                                                <div className="flex items-center gap-2">
                                                    <Users className="size-4" />
                                                    <h3 className="text-sm font-semibold">
                                                        Main-d’œuvre
                                                    </h3>
                                                </div>
                                                <div className="mt-3 space-y-2">
                                                    {selected.labour.map(
                                                        (line) => (
                                                            <div
                                                                key={line.id}
                                                                className="flex justify-between text-xs"
                                                            >
                                                                <span>
                                                                    {line.name}{' '}
                                                                    ·{' '}
                                                                    {line.hours}{' '}
                                                                    h
                                                                </span>
                                                                <span>
                                                                    {money(
                                                                        line.cost_cents,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        ),
                                                    )}
                                                    {selected.labour.length ===
                                                        0 && (
                                                        <p className="text-xs text-slate-500">
                                                            Aucun temps
                                                            enregistré.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-xl bg-[#1f2931] p-4 text-white">
                                                <p className="text-xs tracking-wider text-slate-400 uppercase">
                                                    Coût total
                                                </p>
                                                <p className="mt-2 text-2xl font-semibold">
                                                    {money(
                                                        selected.total_cost_cents,
                                                    )}
                                                </p>
                                                <div className="mt-3 grid gap-1 text-xs text-slate-400">
                                                    <span>
                                                        Pièces{' '}
                                                        {money(
                                                            selected.cost_parts_cents,
                                                        )}
                                                    </span>
                                                    <span>
                                                        Main-d’œuvre{' '}
                                                        {money(
                                                            selected.cost_labour_cents,
                                                        )}
                                                    </span>
                                                    <span>
                                                        Externe{' '}
                                                        {money(
                                                            selected.cost_external_cents,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                </>
                            ) : (
                                <div className="grid min-h-[600px] place-items-center text-center">
                                    <div>
                                        <Wrench className="mx-auto size-10 text-slate-300" />
                                        <p className="mt-3 font-semibold">
                                            Aucun bon sélectionné
                                        </p>
                                    </div>
                                </div>
                            )}
                        </article>
                    </section>
                </div>
            </main>
        </AppLayout>
    );
}
