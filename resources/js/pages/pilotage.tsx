import { Head, Link, useForm } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    CalendarCheck,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    Gauge,
    HardHat,
    Leaf,
    PackageSearch,
    ShieldCheck,
    Sparkles,
    Users,
    Wrench,
} from 'lucide-react';
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

type Metrics = {
    staff_total: number;
    staff_present: number;
    staff_missing: number;
    tasks_open: number;
    tasks_overdue: number;
    work_orders_open: number;
    work_orders_overdue: number;
    stock_alerts: number;
    requisitions_pending: number;
    assets_down: number;
};

type Props = {
    today: string;
    site: {
        id: number;
        code: string;
        name: string;
        address: string | null;
    } | null;
    metrics: Metrics;
    attendance: Array<{
        id: number;
        user_id: number;
        name: string;
        status: string;
        status_label: string;
        hours: number;
    }>;
    staff: Array<{ id: number; name: string; job_title: string | null }>;
    assets: Array<{
        id: number;
        code: string;
        name: string;
        status: string;
        criticality: string;
    }>;
    work_orders: Array<{
        id: number;
        reference: string;
        title: string;
        asset: string;
        status: string;
        status_label: string;
        criticality: string;
        due_at: string | null;
        overdue: boolean;
    }>;
    tasks: Array<{
        id: number;
        reference: string;
        title: string;
        zone: string | null;
        status: string;
        priority: string;
        due_at: string | null;
    }>;
    maintenance_due: number;
    attendance_statuses: Array<{ value: string; label: string }>;
};

const metricCards = (metrics: Metrics) =>
    [
        {
            label: 'Équipe présente',
            value: `${metrics.staff_present}/${metrics.staff_total}`,
            detail: metrics.staff_missing
                ? `${metrics.staff_missing} pointage(s) manquant(s)`
                : 'Pointage complet',
            icon: Users,
            tone: metrics.staff_missing ? 'amber' : 'green',
        },
        {
            label: 'Tâches ouvertes',
            value: metrics.tasks_open,
            detail: metrics.tasks_overdue
                ? `${metrics.tasks_overdue} en retard`
                : 'Aucun retard',
            icon: ClipboardCheck,
            tone: metrics.tasks_overdue ? 'red' : 'green',
        },
        {
            label: 'Bons de travail',
            value: metrics.work_orders_open,
            detail: metrics.work_orders_overdue
                ? `${metrics.work_orders_overdue} hors délai`
                : 'Délais maîtrisés',
            icon: Wrench,
            tone: metrics.work_orders_overdue ? 'red' : 'blue',
        },
        {
            label: 'Alertes stock',
            value: metrics.stock_alerts,
            detail: metrics.requisitions_pending
                ? `${metrics.requisitions_pending} demande(s) à traiter`
                : 'Aucune demande en attente',
            icon: PackageSearch,
            tone: metrics.stock_alerts ? 'amber' : 'green',
        },
    ] as const;

const tones = {
    green: 'border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    red: 'border-red-200/70 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    blue: 'border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
};

function AttendanceDialog({
    staff,
    statuses,
}: {
    staff: Props['staff'];
    statuses: Props['attendance_statuses'];
}) {
    const form = useForm({
        user_id: '',
        status: 'present',
        hours: '8',
        site_code: '',
    });

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button className="bg-emerald-700 text-white hover:bg-emerald-800">
                    <CalendarCheck /> Pointer l’équipe
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Pointage unique du site</DialogTitle>
                    <DialogDescription>
                        Un seul pointage vaut pour la serre, la bananeraie, le
                        poulailler et le magasin.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post('/pilotage/pointage', {
                            preserveScroll: true,
                        });
                    }}
                >
                    <div className="grid gap-2">
                        <Label>Agent</Label>
                        <Select
                            value={form.data.user_id}
                            onValueChange={(value) =>
                                form.setData('user_id', value)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choisir un membre de l’équipe" />
                            </SelectTrigger>
                            <SelectContent>
                                {staff.map((user) => (
                                    <SelectItem
                                        key={user.id}
                                        value={String(user.id)}
                                    >
                                        {user.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {form.errors.user_id && (
                            <p className="text-xs text-red-600">
                                {form.errors.user_id}
                            </p>
                        )}
                    </div>
                    <div className="grid gap-2">
                        <Label>Statut</Label>
                        <Select
                            value={form.data.status}
                            onValueChange={(value) =>
                                form.setData('status', value)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {statuses.map((status) => (
                                    <SelectItem
                                        key={status.value}
                                        value={status.value}
                                    >
                                        {status.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label htmlFor="hours">Heures</Label>
                            <Input
                                id="hours"
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                value={form.data.hours}
                                onChange={(event) =>
                                    form.setData('hours', event.target.value)
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="attendance-code">Code site</Label>
                            <Input
                                id="attendance-code"
                                type="password"
                                inputMode="numeric"
                                value={form.data.site_code}
                                onChange={(event) =>
                                    form.setData(
                                        'site_code',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={form.processing || !form.data.user_id}
                        >
                            {form.processing
                                ? 'Enregistrement…'
                                : 'Valider le pointage'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function IncidentDialog({
    assets,
    staff,
}: {
    assets: Props['assets'];
    staff: Props['staff'];
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
                <Button
                    variant="outline"
                    className="border-red-200 bg-white text-red-700 hover:bg-red-50 dark:bg-transparent"
                >
                    <AlertTriangle /> Signaler une panne
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ouvrir un bon de travail</DialogTitle>
                    <DialogDescription>
                        La criticité du bien détermine automatiquement le délai
                        d’intervention.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post('/pilotage/incidents', {
                            preserveScroll: true,
                        });
                    }}
                >
                    <div className="grid gap-2">
                        <Label>Équipement ou infrastructure</Label>
                        <Select
                            value={form.data.asset_id}
                            onValueChange={(value) =>
                                form.setData('asset_id', value)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choisir le bien concerné" />
                            </SelectTrigger>
                            <SelectContent>
                                {assets.map((asset) => (
                                    <SelectItem
                                        key={asset.id}
                                        value={String(asset.id)}
                                    >
                                        {asset.code} · {asset.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="incident-title">
                            Que se passe-t-il ?
                        </Label>
                        <Input
                            id="incident-title"
                            placeholder="Ex. La pompe ne démarre plus"
                            value={form.data.title}
                            onChange={(event) =>
                                form.setData('title', event.target.value)
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="description">Précisions</Label>
                        <textarea
                            id="description"
                            className="min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600/25"
                            value={form.data.description}
                            onChange={(event) =>
                                form.setData('description', event.target.value)
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label>Signalé par</Label>
                            <Select
                                value={form.data.reported_by}
                                onValueChange={(value) =>
                                    form.setData('reported_by', value)
                                }
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Agent" />
                                </SelectTrigger>
                                <SelectContent>
                                    {staff.map((user) => (
                                        <SelectItem
                                            key={user.id}
                                            value={String(user.id)}
                                        >
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="incident-code">Code site</Label>
                            <Input
                                id="incident-code"
                                type="password"
                                value={form.data.site_code}
                                onChange={(event) =>
                                    form.setData(
                                        'site_code',
                                        event.target.value,
                                    )
                                }
                            />
                        </div>
                    </div>
                    <label className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/60 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                        <input
                            type="checkbox"
                            checked={form.data.asset_stopped}
                            onChange={(event) =>
                                form.setData(
                                    'asset_stopped',
                                    event.target.checked,
                                )
                            }
                            className="size-4 accent-red-600"
                        />{' '}
                        La production est arrêtée
                    </label>
                    <DialogFooter>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={
                                form.processing ||
                                !form.data.asset_id ||
                                !form.data.title
                            }
                        >
                            {form.processing
                                ? 'Ouverture…'
                                : 'Créer le bon de travail'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function Pilotage(props: Props) {
    useFlashToast();
    const { site, metrics } = props;

    return (
        <AppLayout breadcrumbs={[{ title: 'Pilotage', href: '/' }]}>
            <Head title="Pilotage opérationnel" />
            <main className="min-h-full bg-[#f7f8f4] p-4 text-slate-900 md:p-7 dark:bg-[#111712] dark:text-slate-100">
                <div className="mx-auto max-w-7xl space-y-6">
                    <section className="relative overflow-hidden rounded-3xl bg-[#173f2b] px-6 py-7 text-white shadow-[0_24px_70px_-36px_rgba(21,92,58,0.8)] md:px-8">
                        <div className="absolute -top-20 -right-14 size-72 rounded-full border-[46px] border-white/5" />
                        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                            <div>
                                <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-emerald-200 uppercase">
                                    <Activity className="size-4" /> Centre de
                                    pilotage · {site?.code ?? 'D’TOMATE'}
                                </div>
                                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                                    Bonjour, la ferme est sous contrôle.
                                </h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/75">
                                    {props.today} ·{' '}
                                    {site?.name ?? "La Ferme D'Tomate"}. Les
                                    alertes critiques remontent ici avant de
                                    devenir des pertes.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <AttendanceDialog
                                    staff={props.staff}
                                    statuses={props.attendance_statuses}
                                />
                                <IncidentDialog
                                    assets={props.assets}
                                    staff={props.staff}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {metricCards(metrics).map((metric) => (
                            <article
                                key={metric.label}
                                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                            >
                                <div className="flex items-start justify-between">
                                    <div
                                        className={`rounded-xl border p-2.5 ${tones[metric.tone]}`}
                                    >
                                        <metric.icon className="size-5" />
                                    </div>
                                    <span className="text-3xl font-semibold tracking-tight">
                                        {metric.value}
                                    </span>
                                </div>
                                <h2 className="mt-5 text-sm font-semibold">
                                    {metric.label}
                                </h2>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {metric.detail}
                                </p>
                            </article>
                        ))}
                    </section>

                    <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6 dark:border-white/10 dark:bg-white/[0.04]">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-[0.18em] text-emerald-700 uppercase dark:text-emerald-400">
                                        Exécution
                                    </p>
                                    <h2 className="mt-1 text-xl font-semibold">
                                        Priorités du jour
                                    </h2>
                                </div>
                                <Link
                                    href="/carnet"
                                    className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400"
                                >
                                    Ouvrir le carnet{' '}
                                    <ArrowRight className="size-4" />
                                </Link>
                            </div>
                            <div className="space-y-2">
                                {props.tasks.length ? (
                                    props.tasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className="flex items-center gap-4 rounded-xl border border-slate-100 p-3.5 dark:border-white/10"
                                        >
                                            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                                <Leaf className="size-5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold">
                                                    {task.title}
                                                </p>
                                                <p className="mt-0.5 text-xs text-slate-500">
                                                    {task.reference} ·{' '}
                                                    {task.zone ?? 'Site'} ·{' '}
                                                    {task.due_at}
                                                </p>
                                            </div>
                                            <Badge
                                                variant={
                                                    task.priority === 'critical'
                                                        ? 'destructive'
                                                        : 'secondary'
                                                }
                                            >
                                                {task.status}
                                            </Badge>
                                        </div>
                                    ))
                                ) : (
                                    <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 px-5 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
                                        <div>
                                            <CheckCircle2 className="mx-auto size-9 text-emerald-600" />
                                            <p className="mt-3 font-semibold">
                                                Aucune tâche en attente
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">
                                                Le calendrier terrain est à
                                                jour.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6 dark:border-white/10 dark:bg-white/[0.04]">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-[0.18em] text-sky-700 uppercase dark:text-sky-400">
                                        Équipe
                                    </p>
                                    <h2 className="mt-1 text-xl font-semibold">
                                        Pointage aujourd’hui
                                    </h2>
                                </div>
                                <span className="grid size-10 place-items-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/40">
                                    <Users className="size-5" />
                                </span>
                            </div>
                            <div className="space-y-3">
                                {props.attendance.length ? (
                                    props.attendance.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="flex items-center gap-3"
                                        >
                                            <div className="grid size-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                                {entry.name
                                                    .split(' ')
                                                    .slice(0, 2)
                                                    .map((part) => part[0])
                                                    .join('')}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {entry.name}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {entry.hours} h enregistrées
                                                </p>
                                            </div>
                                            <Badge
                                                className={
                                                    entry.status === 'present'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : ''
                                                }
                                                variant="outline"
                                            >
                                                {entry.status_label}
                                            </Badge>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                        <Clock3 className="mb-2 size-5" />
                                        Le pointage du jour n’a pas encore
                                        commencé.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section
                        id="maintenance"
                        className="grid scroll-mt-6 gap-5 lg:grid-cols-[1.4fr_0.6fr]"
                    >
                        <div className="rounded-2xl bg-[#1f2931] p-5 text-white shadow-sm md:p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold tracking-[0.18em] text-orange-300 uppercase">
                                        Maintenance
                                    </p>
                                    <h2 className="mt-1 text-xl font-semibold">
                                        Bons de travail ouverts
                                    </h2>
                                </div>
                                <Wrench className="size-6 text-orange-300" />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                {props.work_orders.length ? (
                                    props.work_orders.map((order) => (
                                        <article
                                            key={order.id}
                                            className="rounded-xl border border-white/10 bg-white/[0.05] p-4"
                                        >
                                            <div className="flex justify-between gap-3">
                                                <span className="text-xs font-semibold text-orange-300">
                                                    {order.reference}
                                                </span>
                                                {order.overdue && (
                                                    <Badge variant="destructive">
                                                        En retard
                                                    </Badge>
                                                )}
                                            </div>
                                            <h3 className="mt-2 text-sm font-semibold">
                                                {order.title}
                                            </h3>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {order.asset}
                                            </p>
                                            <div className="mt-4 flex items-center justify-between text-xs">
                                                <span className="rounded-md bg-white/10 px-2 py-1">
                                                    {order.status_label}
                                                </span>
                                                <span className="text-slate-400">
                                                    {order.due_at}
                                                </span>
                                            </div>
                                        </article>
                                    ))
                                ) : (
                                    <div className="col-span-full rounded-xl border border-dashed border-white/15 p-8 text-center text-slate-300">
                                        <ShieldCheck className="mx-auto mb-2 size-8 text-emerald-400" />
                                        Aucun bon de travail ouvert.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                            <div
                                id="registres"
                                className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]"
                            >
                                <Gauge className="size-5 text-orange-600" />
                                <p className="mt-4 text-2xl font-semibold">
                                    {props.maintenance_due}
                                </p>
                                <p className="text-xs text-slate-500">
                                    plans d’entretien échus
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                <HardHat className="size-5 text-red-600" />
                                <p className="mt-4 text-2xl font-semibold">
                                    {metrics.assets_down}
                                </p>
                                <p className="text-xs text-slate-500">
                                    biens à l’arrêt
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                <Sparkles className="size-5 text-emerald-600" />
                                <p className="mt-4 text-sm font-semibold">
                                    Registres protégés
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                    Chaque mouvement et transition garde sa
                                    trace.
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </AppLayout>
    );
}
