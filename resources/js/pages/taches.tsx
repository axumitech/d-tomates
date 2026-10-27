import { Head, Link, router, useForm, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFlashToast } from '@/hooks/use-flash-toast';
import AppLayout from '@/layouts/app-layout';

type Staff = { id: number; name: string };
type Task = {
    id: number;
    reference: string;
    title: string;
    instructions: string;
    zone: string;
    crop_type: string;
    assigned_to: number | null;
    assignee: string | null;
    status: string;
    work_date: string;
    due_at: string;
    overdue: boolean;
    completion_note: string | null;
    justification: string | null;
    reason: string | null;
    can_review: boolean;
    review_note: string | null;
    reviewer: string | null;
    reviewed_at: string | null;
    submitted_at: string | null;
    photos: string[];
    events: {
        event: string;
        at: string;
        payload: Record<string, unknown>;
        photos: string[];
    }[];
};
type Template = {
    id?: number;
    crop_type: string;
    task_key: string;
    title: string;
    instructions: string;
    category: string;
    frequency: string;
    min_day: number;
    max_day: number | null;
    weekday: number | null;
    interval_days: number | null;
    is_active: boolean;
};
type Props = {
    date: string;
    userId: number;
    canManage: boolean;
    canEditRegistry: boolean;
    tasks: Task[];
    staff: Staff[];
    zones: { id: number; name: string; task_responsible_id: number | null }[];
    templates: Template[];
    notifications: {
        id: string;
        data: { subject: string; lines: string[]; url: string };
        read_at: string | null;
    }[];
    report: {
        lines: string[];
        details: string[];
        categories: {
            name: string;
            total: number;
            done: number;
            pending: number;
            not_done: number;
            tasks: {
                id: number;
                title: string;
                status: string;
                zone: string | null;
                assignee: string | null;
            }[];
        }[];
        people: { name: string; status: string }[];
        stock_alerts: {
            name: string;
            balance_base: number;
            alert_threshold_base: number;
        }[];
        total: number;
        done: number;
        justified: number;
        unanswered: number;
        unassigned: number;
    } | null;
    reportDelivery: {
        sent_at: string | null;
        created_at: string;
        snapshot: string;
    } | null;
    timezone: string;
    deadline: string;
    lastGenerated: string | null;
};
const reasons: Record<string, string> = {
    weather: 'Météo',
    stockout: 'Rupture de stock',
    equipment_failure: 'Panne de matériel',
    supervisor_instruction: 'Consigne du responsable',
    safety_incident: 'Incident de sécurité',
    zone_access: 'Accès à la zone',
};
const statuses: Record<string, string> = {
    todo: 'Sans réponse',
    done: 'Exécution validée',
    pending_review: 'Preuve à valider',
    correction_requested: 'Preuve à corriger',
    justified: 'Non exécutée — justifiée',
    unjustified: 'Non exécutée — sans justification',
};
const selectClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const emptyTemplate: Template = {
    crop_type: '',
    task_key: '',
    title: '',
    instructions: '',
    category: 'Contrôle',
    frequency: 'jour',
    min_day: 0,
    max_day: null,
    weekday: null,
    interval_days: null,
    is_active: true,
};

function Errors({ errors }: { errors: Record<string, string> }) {
    return (
        <div role="alert" className="text-sm text-red-700">
            {Object.entries(errors).map(([key, error]) => (
                <p key={key}>{error}</p>
            ))}
        </div>
    );
}

function Assignment({ task, staff }: { task: Task; staff: Staff[] }) {
    const form = useForm({ assigned_to: task.assigned_to?.toString() ?? '' });

    return (
        <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                form.post(`/taches/${task.id}/attribuer`, {
                    preserveScroll: true,
                });
            }}
        >
            <select
                aria-label={`Responsable de ${task.title}`}
                className={selectClass + ' max-w-sm'}
                value={form.data.assigned_to}
                onChange={(event) =>
                    form.setData('assigned_to', event.target.value)
                }
            >
                <option value="">Choisir un responsable</option>
                {staff.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                        {agent.name}
                    </option>
                ))}
            </select>
            <Button
                size="sm"
                disabled={form.processing || !form.data.assigned_to}
            >
                Attribuer et notifier
            </Button>
            <Errors errors={form.errors} />
        </form>
    );
}

function Replan({
    task,
    staff,
    date,
}: {
    task: Task;
    staff: Staff[];
    date: string;
}) {
    const form = useForm({
        assigned_to: task.assigned_to?.toString() ?? '',
        work_date: date,
    });

    return (
        <form
            className="space-y-2 rounded-lg border p-3"
            onSubmit={(event) => {
                event.preventDefault();
                form.post(`/taches/${task.id}/reprogrammer`, {
                    preserveScroll: true,
                });
            }}
        >
            <p className="text-sm font-medium">
                Programmer une reprise et conserver la justification initiale
            </p>
            <div className="flex flex-wrap gap-2">
                <Input
                    aria-label="Date de reprise"
                    className="max-w-48"
                    required
                    type="date"
                    value={form.data.work_date}
                    onChange={(event) =>
                        form.setData('work_date', event.target.value)
                    }
                />
                <select
                    aria-label="Responsable de la reprise"
                    required
                    className={selectClass + ' max-w-sm'}
                    value={form.data.assigned_to}
                    onChange={(event) =>
                        form.setData('assigned_to', event.target.value)
                    }
                >
                    <option value="">Choisir un responsable</option>
                    {staff.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                            {agent.name}
                        </option>
                    ))}
                </select>
                <Button variant="outline" disabled={form.processing}>
                    Reprogrammer et notifier
                </Button>
            </div>
            <Errors errors={form.errors} />
        </form>
    );
}

function Evidence({ task }: { task: Task }) {
    const form = useForm<{
        status: string;
        note: string;
        reason: string;
        justification: string;
        photos: File[];
    }>({ status: 'done', note: '', reason: '', justification: '', photos: [] });

    return (
        <form
            className="space-y-3 rounded-lg bg-muted/50 p-4"
            onSubmit={(event) => {
                event.preventDefault();
                form.post(`/taches/${task.id}/reponse`, {
                    forceFormData: true,
                    preserveScroll: true,
                    onSuccess: () => form.reset(),
                });
            }}
        >
            <label className="block text-sm font-medium">
                Ma réponse
                <select
                    className={selectClass + ' mt-1'}
                    value={form.data.status}
                    onChange={(event) =>
                        form.setData('status', event.target.value)
                    }
                >
                    <option value="done">
                        Tâche exécutée — photo obligatoire
                    </option>
                    <option value="justified">
                        Tâche non exécutée — justification obligatoire
                    </option>
                </select>
            </label>
            {form.data.status === 'justified' ? (
                <>
                    <label className="block text-sm">
                        Motif
                        <select
                            required
                            className={selectClass + ' mt-1'}
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                        >
                            <option value="">Choisir</option>
                            {Object.entries(reasons).map(([key, value]) => (
                                <option key={key} value={key}>
                                    {value}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm">
                        Justification
                        <textarea
                            required
                            minLength={10}
                            maxLength={3000}
                            className={selectClass + ' mt-1'}
                            placeholder="Expliquez le blocage et ce qui est nécessaire pour reprendre."
                            value={form.data.justification}
                            onChange={(event) =>
                                form.setData(
                                    'justification',
                                    event.target.value,
                                )
                            }
                        />
                    </label>
                </>
            ) : (
                <label className="block text-sm">
                    Observation
                    <textarea
                        maxLength={3000}
                        className={selectClass + ' mt-1'}
                        value={form.data.note}
                        onChange={(event) =>
                            form.setData('note', event.target.value)
                        }
                    />
                </label>
            )}
            <label className="block text-sm">
                Photos{' '}
                {form.data.status === 'done'
                    ? '(obligatoires)'
                    : '(facultatives)'}{' '}
                — 5 maximum, 10 Mo chacune
                <Input
                    className="mt-1"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    required={form.data.status === 'done'}
                    onChange={(event) =>
                        form.setData(
                            'photos',
                            Array.from(event.target.files ?? []),
                        )
                    }
                />
            </label>
            {form.progress && (
                <p className="text-sm">Envoi : {form.progress.percentage} %</p>
            )}
            <Errors errors={form.errors} />
            <Button disabled={form.processing}>
                {form.data.status === 'done'
                    ? 'Soumettre la preuve au responsable'
                    : 'Enregistrer la justification'}
            </Button>
        </form>
    );
}

function ProofReview({ task }: { task: Task }) {
    const form = useForm({
        decision: 'approve',
        note: '',
        photos_examined: false,
    });

    return (
        <form
            className="space-y-3 rounded-lg border p-4"
            onSubmit={(event) => {
                event.preventDefault();
                form.post(`/taches/${task.id}/revue`, { preserveScroll: true });
            }}
        >
            <p className="font-medium">Revue de la preuve</p>
            <select
                className={selectClass}
                value={form.data.decision}
                onChange={(event) =>
                    form.setData('decision', event.target.value)
                }
            >
                <option value="approve">Valider l’exécution</option>
                <option value="reject">Demander une correction</option>
            </select>
            {form.data.decision === 'approve' && (
                <label className="flex gap-2">
                    <input
                        type="checkbox"
                        required
                        checked={form.data.photos_examined}
                        onChange={(event) =>
                            form.setData(
                                'photos_examined',
                                event.target.checked,
                            )
                        }
                    />
                    J’ai examiné les photos et je confirme l’exécution.
                </label>
            )}
            <textarea
                aria-label="Observation ou correction attendue"
                className={selectClass}
                placeholder="Observation ou correction attendue"
                required={form.data.decision === 'reject'}
                minLength={form.data.decision === 'reject' ? 10 : undefined}
                value={form.data.note}
                onChange={(event) => form.setData('note', event.target.value)}
            />
            <Errors errors={form.errors} />
            <Button disabled={form.processing}>
                Enregistrer la décision et notifier
            </Button>
        </form>
    );
}

function ZoneResponsible({
    zone,
    staff,
}: {
    zone: Props['zones'][number];
    staff: Staff[];
}) {
    const form = useForm({
        task_responsible_id: zone.task_responsible_id?.toString() ?? '',
    });

    return (
        <form
            className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            onSubmit={(event) => {
                event.preventDefault();
                form.patch(`/taches/zones/${zone.id}/responsable`, {
                    preserveScroll: true,
                });
            }}
        >
            <span className="min-w-28 font-medium">{zone.name}</span>
            <select
                aria-label={`Responsable automatique de ${zone.name}`}
                className={selectClass + ' max-w-sm'}
                value={form.data.task_responsible_id}
                onChange={(event) =>
                    form.setData('task_responsible_id', event.target.value)
                }
            >
                <option value="">Aucun responsable automatique</option>
                {staff.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                        {agent.name}
                    </option>
                ))}
            </select>
            <Button variant="outline" size="sm" disabled={form.processing}>
                Enregistrer
            </Button>
            <Errors errors={form.errors} />
        </form>
    );
}

function TemplateEditor({
    template,
    onClose,
}: {
    template: Template;
    onClose: () => void;
}) {
    const form = useForm<Template>(template);

    return (
        <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
                event.preventDefault();

                if (template.id) {
                    form.patch(`/taches/registre/${template.id}`, {
                        preserveScroll: true,
                        onSuccess: onClose,
                    });
                } else {
                    form.post('/taches/registre', {
                        preserveScroll: true,
                        onSuccess: onClose,
                    });
                }
            }}
        >
            <h3 className="font-semibold">
                {template.id ? 'Modifier la règle' : 'Nouvelle règle'}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
                <label>
                    Culture
                    <Input
                        required
                        readOnly={Boolean(template.id)}
                        value={form.data.crop_type}
                        onChange={(event) =>
                            form.setData('crop_type', event.target.value)
                        }
                    />
                </label>
                <label>
                    Identifiant unique
                    <Input
                        required
                        pattern="[A-Za-z0-9_-]+"
                        readOnly={Boolean(template.id)}
                        value={form.data.task_key}
                        onChange={(event) =>
                            form.setData('task_key', event.target.value)
                        }
                    />
                </label>
                <label>
                    Nom de la tâche
                    <Input
                        required
                        value={form.data.title}
                        onChange={(event) =>
                            form.setData('title', event.target.value)
                        }
                    />
                </label>
                <label>
                    Catégorie
                    <Input
                        required
                        value={form.data.category}
                        onChange={(event) =>
                            form.setData('category', event.target.value)
                        }
                    />
                </label>
            </div>
            <label className="block">
                Consignes
                <textarea
                    required
                    className={selectClass}
                    rows={3}
                    value={form.data.instructions}
                    onChange={(event) =>
                        form.setData('instructions', event.target.value)
                    }
                />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
                <label>
                    Fréquence
                    <select
                        className={selectClass}
                        value={form.data.frequency}
                        onChange={(event) =>
                            form.setData('frequency', event.target.value)
                        }
                    >
                        {[
                            ['jour', 'Chaque jour'],
                            ['sem', 'Chaque semaine'],
                            ['periode', 'Tous les N jours'],
                            ['unique', 'Une fois par cycle'],
                        ].map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Âge minimum (jours)
                    <Input
                        type="number"
                        min={0}
                        required
                        value={form.data.min_day}
                        onChange={(event) =>
                            form.setData('min_day', Number(event.target.value))
                        }
                    />
                </label>
                <label>
                    Âge maximum (facultatif)
                    <Input
                        type="number"
                        min={form.data.min_day}
                        value={form.data.max_day ?? ''}
                        onChange={(event) =>
                            form.setData(
                                'max_day',
                                event.target.value === ''
                                    ? null
                                    : Number(event.target.value),
                            )
                        }
                    />
                </label>
                {form.data.frequency === 'sem' && (
                    <label>
                        Jour de semaine
                        <select
                            required
                            className={selectClass}
                            value={form.data.weekday ?? ''}
                            onChange={(event) =>
                                form.setData(
                                    'weekday',
                                    Number(event.target.value),
                                )
                            }
                        >
                            <option value="">Choisir</option>
                            {[
                                'Dimanche',
                                'Lundi',
                                'Mardi',
                                'Mercredi',
                                'Jeudi',
                                'Vendredi',
                                'Samedi',
                            ].map((day, index) => (
                                <option key={day} value={index}>
                                    {day}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                {form.data.frequency === 'periode' && (
                    <label>
                        Intervalle (jours)
                        <Input
                            required
                            type="number"
                            min={1}
                            value={form.data.interval_days ?? ''}
                            onChange={(event) =>
                                form.setData(
                                    'interval_days',
                                    Number(event.target.value),
                                )
                            }
                        />
                    </label>
                )}
            </div>
            <p className="text-sm text-muted-foreground">
                Les périodes sont calculées depuis l’âge minimum : première
                échéance après N jours. Une tâche ponctuelle reste à suivre
                jusqu’à sa réponse, même après sa fenêtre.
            </p>
            <label className="flex gap-2">
                <input
                    type="checkbox"
                    checked={form.data.is_active}
                    onChange={(event) =>
                        form.setData('is_active', event.target.checked)
                    }
                />
                Règle active
            </label>
            <Errors errors={form.errors} />
            <div className="flex gap-2">
                <Button disabled={form.processing}>Enregistrer</Button>
                <Button type="button" variant="outline" onClick={onClose}>
                    Annuler
                </Button>
            </div>
        </form>
    );
}

export default function DailyTasks(props: Props) {
    useFlashToast();
    usePoll(60000, {
        only: [
            'tasks',
            'notifications',
            'lastGenerated',
            'report',
            'reportDelivery',
        ],
    });
    const [tab, setTab] = useState('tasks');
    const [filter, setFilter] = useState('all');
    const [crop, setCrop] = useState('all');
    const [editing, setEditing] = useState<Template | null>(null);
    const generation = useForm({});
    const visible = props.tasks.filter(
        (task) =>
            filter === 'all' ||
            (filter === 'unassigned'
                ? task.assigned_to === null
                : filter === 'review'
                  ? task.can_review
                  : task.status === filter),
    );
    const crops = [
        ...new Set(props.templates.map((template) => template.crop_type)),
    ];

    return (
        <AppLayout
            breadcrumbs={[{ title: 'Tâches quotidiennes', href: '/taches' }]}
        >
            <Head title="Tâches quotidiennes" />
            <div className="space-y-6 p-4 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            Tâches quotidiennes
                        </h1>
                        <p className="text-muted-foreground">
                            Un responsable, une preuve ou une justification pour
                            chaque tâche et chaque zone.
                        </p>
                        <p className="mt-1 text-sm">
                            Échéance : {props.deadline} · {props.timezone}
                        </p>
                    </div>
                    <label className="text-sm">
                        Journée
                        <Input
                            type="date"
                            value={props.date}
                            onChange={(event) =>
                                event.target.value &&
                                router.get('/taches', {
                                    date: event.target.value,
                                })
                            }
                        />
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                        ['Prévues / à suivre', props.tasks.length],
                        [
                            'Preuves à valider',
                            props.tasks.filter(
                                (task) => task.status === 'pending_review',
                            ).length,
                        ],
                        [
                            'Corrections attendues',
                            props.tasks.filter(
                                (task) =>
                                    task.status === 'correction_requested',
                            ).length,
                        ],
                        [
                            'Exécutions validées',
                            props.tasks.filter((task) => task.status === 'done')
                                .length,
                        ],
                        [
                            'Non exécutées',
                            props.tasks.filter((task) =>
                                ['todo', 'justified', 'unjustified'].includes(
                                    task.status,
                                ),
                            ).length,
                        ],
                        [
                            'Non attribuées',
                            props.tasks.filter((task) => !task.assigned_to)
                                .length,
                        ],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border p-4">
                            <div className="text-2xl font-semibold">
                                {value}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {label}
                            </div>
                        </div>
                    ))}
                </div>
                {props.canManage && (
                    <div className="space-y-2 rounded-xl border bg-amber-50 p-4 text-amber-950">
                        <p className="text-sm">
                            Dernière génération :{' '}
                            {props.lastGenerated ?? 'jamais'}. Les tâches sans
                            responsable restent à attribuer. Les anciennes
                            tâches sans réponse restent visibles.
                        </p>
                        <Button
                            variant="outline"
                            disabled={generation.processing}
                            onClick={() =>
                                generation.post('/taches/generer', {
                                    preserveScroll: true,
                                })
                            }
                        >
                            Actualiser depuis le registre
                        </Button>
                        <Errors errors={generation.errors} />
                    </div>
                )}
                <nav
                    className="flex flex-wrap gap-2"
                    aria-label="Suivi des tâches"
                >
                    <Button
                        variant={tab === 'tasks' ? 'default' : 'outline'}
                        onClick={() => setTab('tasks')}
                    >
                        Tâches
                    </Button>
                    <Button
                        variant={
                            tab === 'notifications' ? 'default' : 'outline'
                        }
                        onClick={() => setTab('notifications')}
                    >
                        Notifications (
                        {
                            props.notifications.filter(
                                (notification) => !notification.read_at,
                            ).length
                        }
                        )
                    </Button>
                    {props.canManage && (
                        <Button
                            variant={tab === 'zones' ? 'default' : 'outline'}
                            onClick={() => setTab('zones')}
                        >
                            Responsables de zone
                        </Button>
                    )}
                    {props.canEditRegistry && (
                        <Button
                            variant={tab === 'registry' ? 'default' : 'outline'}
                            onClick={() => setTab('registry')}
                        >
                            Registre des tâches
                        </Button>
                    )}
                    {props.report && (
                        <Button
                            variant={tab === 'report' ? 'default' : 'outline'}
                            onClick={() => setTab('report')}
                        >
                            Rapport et recommandations
                        </Button>
                    )}
                </nav>
                {tab === 'tasks' && (
                    <>
                        <select
                            aria-label="Filtrer les tâches"
                            className={selectClass + ' max-w-sm'}
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        >
                            <option value="all">Toutes les tâches</option>
                            <option value="unassigned">Non attribuées</option>
                            {props.canManage && (
                                <option value="review">
                                    Preuves que je peux valider
                                </option>
                            )}
                            {Object.entries(statuses).map(([key, value]) => (
                                <option key={key} value={key}>
                                    {value}
                                </option>
                            ))}
                        </select>
                        {visible.length === 0 && (
                            <p className="rounded-xl border p-6 text-muted-foreground">
                                Aucune tâche dans cette sélection.
                                {!props.canManage &&
                                    ' Votre responsable doit générer et vous attribuer les tâches.'}
                            </p>
                        )}
                        {visible.map((task) => (
                            <article
                                key={task.id}
                                className="space-y-4 rounded-xl border bg-card p-5"
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            {task.zone} · {task.crop_type} ·{' '}
                                            {task.work_date}
                                        </p>
                                        <h2 className="text-lg font-semibold">
                                            {task.title}
                                        </h2>
                                    </div>
                                    <span
                                        className={`text-sm font-medium ${task.status === 'done' ? 'text-emerald-700' : 'text-amber-700'}`}
                                    >
                                        {statuses[task.status]}
                                    </span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">
                                    {task.instructions}
                                </p>
                                <p
                                    className={`text-sm ${task.overdue ? 'font-semibold text-red-700' : 'text-muted-foreground'}`}
                                >
                                    Responsable :{' '}
                                    {task.assignee ?? 'Non attribuée'} ·
                                    Échéance : {task.due_at}
                                    {task.overdue && ' — en retard'}
                                </p>
                                {['todo', 'correction_requested'].includes(
                                    task.status,
                                ) &&
                                    props.canManage && (
                                        <Assignment
                                            task={task}
                                            staff={props.staff}
                                        />
                                    )}
                                {['todo', 'correction_requested'].includes(
                                    task.status,
                                ) &&
                                    task.assigned_to === props.userId && (
                                        <Evidence task={task} />
                                    )}
                                {task.justification && (
                                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                                        {reasons[task.reason ?? '']} :{' '}
                                        {task.justification}
                                    </p>
                                )}
                                {props.canManage &&
                                    ['justified', 'unjustified'].includes(
                                        task.status,
                                    ) && (
                                        <Replan
                                            task={task}
                                            staff={props.staff}
                                            date={props.date}
                                        />
                                    )}
                                {task.completion_note && (
                                    <p className="text-sm">
                                        Observation : {task.completion_note}
                                    </p>
                                )}
                                {task.photos.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                        {task.photos.map((url, index) => (
                                            <a
                                                key={url}
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <img
                                                    src={url}
                                                    alt={`Preuve ${index + 1} — ${task.title}`}
                                                    className="h-32 w-40 rounded-lg border object-cover"
                                                />
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {task.submitted_at && (
                                    <p className="text-sm">
                                        Preuve déposée le {task.submitted_at}
                                    </p>
                                )}
                                {task.reviewed_at && (
                                    <p className="text-sm">
                                        Revue par {task.reviewer} le{' '}
                                        {task.reviewed_at}
                                        {task.review_note
                                            ? ` : ${task.review_note}`
                                            : ''}
                                    </p>
                                )}
                                {task.can_review && <ProofReview task={task} />}
                                {task.status === 'pending_review' &&
                                    !task.can_review && (
                                        <p className="text-sm">
                                            En attente de validation par un
                                            autre responsable habilité.
                                        </p>
                                    )}
                                <details className="text-sm text-muted-foreground">
                                    <summary>Historique</summary>
                                    {task.events.map((event, index) => (
                                        <div key={index} className="my-2">
                                            {event.at} —{' '}
                                            {(
                                                {
                                                    generated:
                                                        'Générée depuis le registre',
                                                    assigned:
                                                        'Responsable modifié',
                                                    closed: 'Réponse enregistrée',
                                                    submitted: 'Preuve soumise',
                                                    review_approved:
                                                        'Exécution validée',
                                                    review_rejected:
                                                        'Correction demandée',
                                                    replanned:
                                                        'Reprise programmée',
                                                } as Record<string, string>
                                            )[event.event] ?? event.event}
                                            {typeof event.payload?.note ===
                                                'string' && (
                                                <p>{event.payload.note}</p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {event.photos.map((url) => (
                                                    <a
                                                        key={url}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        <img
                                                            src={url}
                                                            alt="Preuve conservée dans l’historique"
                                                            className="h-20 w-28 rounded border object-cover"
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </details>
                            </article>
                        ))}
                    </>
                )}
                {tab === 'notifications' && (
                    <div className="space-y-3">
                        {props.notifications.length === 0 && (
                            <p>Aucune notification.</p>
                        )}
                        {props.notifications.map((notification) => (
                            <article
                                key={notification.id}
                                className="space-y-2 rounded-xl border p-4"
                            >
                                <h2 className="font-semibold">
                                    {notification.data.subject}
                                </h2>
                                {notification.data.lines.map((line, index) => (
                                    <p key={index} className="text-sm">
                                        {line}
                                    </p>
                                ))}
                                <div className="flex gap-3">
                                    <Link
                                        className="text-sm underline"
                                        href={notification.data.url}
                                    >
                                        Consulter
                                    </Link>
                                    {!notification.read_at && (
                                        <button
                                            className="text-sm underline"
                                            onClick={() =>
                                                router.post(
                                                    `/taches/notifications/${notification.id}/lue`,
                                                    {},
                                                    { preserveScroll: true },
                                                )
                                            }
                                        >
                                            Marquer comme lue
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                {tab === 'zones' && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Les nouvelles tâches sont attribuées automatiquement
                            au responsable actif de leur zone. Les attributions
                            déjà enregistrées restent à modifier
                            individuellement.
                        </p>
                        {props.zones.map((zone) => (
                            <ZoneResponsible
                                key={zone.id}
                                zone={zone}
                                staff={props.staff}
                            />
                        ))}
                    </div>
                )}
                {tab === 'registry' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Les modifications s’appliquent aux prochaines
                            générations et sont historisées. Désactiver une
                            règle conserve les tâches et preuves existantes.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                onClick={() => setEditing({ ...emptyTemplate })}
                            >
                                Ajouter une règle
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() =>
                                    router.post(
                                        '/taches/registre/importer',
                                        {},
                                        { preserveScroll: true },
                                    )
                                }
                            >
                                Importer les règles manquantes du carnet
                            </Button>
                            <select
                                aria-label="Culture du registre"
                                className={selectClass + ' max-w-sm'}
                                value={crop}
                                onChange={(event) =>
                                    setCrop(event.target.value)
                                }
                            >
                                <option value="all">Toutes les cultures</option>
                                {crops.map((name) => (
                                    <option key={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                        {editing && (
                            <TemplateEditor
                                key={editing.id ?? 'new'}
                                template={editing}
                                onClose={() => setEditing(null)}
                            />
                        )}
                        {props.templates
                            .filter(
                                (template) =>
                                    crop === 'all' ||
                                    template.crop_type === crop,
                            )
                            .map((template) => (
                                <div
                                    key={template.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {template.title}
                                            {!template.is_active &&
                                                ' — désactivée'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {template.crop_type} ·{' '}
                                            {
                                                (
                                                    {
                                                        jour: 'Quotidienne',
                                                        sem: 'Hebdomadaire',
                                                        periode: 'Périodique',
                                                        unique: 'Ponctuelle',
                                                    } as Record<string, string>
                                                )[template.frequency]
                                            }{' '}
                                            · J+{template.min_day}
                                            {template.max_day !== null &&
                                                ` à J+${template.max_day}`}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditing(template)}
                                    >
                                        Modifier
                                    </Button>
                                </div>
                            ))}
                    </div>
                )}
                {tab === 'report' && props.report && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Aperçu actualisé. Le rapport du soir est conservé au
                            moment de sa préparation et envoyé aux comptes
                            direction actifs du site. Les preuves sont
                            consultables dans les tâches.
                        </p>
                        {props.reportDelivery && (
                            <details className="rounded-xl border p-4">
                                <summary className="cursor-pointer font-medium">
                                    Rapport préparé pour l’envoi —{' '}
                                    {props.reportDelivery.sent_at
                                        ? 'remis au service mail'
                                        : 'envoi en attente'}
                                </summary>
                                <pre className="mt-3 font-sans text-sm leading-7 whitespace-pre-wrap">
                                    {JSON.parse(
                                        props.reportDelivery.snapshot,
                                    ).lines.join('\n')}
                                </pre>
                            </details>
                        )}
                        <pre className="overflow-x-auto rounded-xl border p-5 font-sans text-sm leading-7 whitespace-pre-wrap">
                            {props.report.lines.join('\n')}
                        </pre>
                        {props.report.categories.map((category) => (
                            <details
                                key={category.name}
                                className="rounded-xl border p-4"
                            >
                                <summary className="cursor-pointer font-medium">
                                    {category.name} — {category.total} dues ·{' '}
                                    {category.done} exécutées ·{' '}
                                    {category.pending} à valider ·{' '}
                                    {category.not_done} non exécutées
                                </summary>
                                <ul className="mt-3 space-y-2 text-sm">
                                    {category.tasks.map((task) => (
                                        <li key={task.id}>
                                            {task.title} ·{' '}
                                            {task.zone ?? 'Sans zone'} ·{' '}
                                            {task.assignee ?? 'Non attribuée'} ·{' '}
                                            {(
                                                {
                                                    done: 'Exécutée / validée',
                                                    pending_review: 'À valider',
                                                    correction_requested:
                                                        'Correction demandée',
                                                    justified:
                                                        'Non exécutée / justifiée',
                                                    unjustified:
                                                        'Non exécutée / sans justification',
                                                    todo: 'Non exécutée / sans réponse',
                                                } as Record<string, string>
                                            )[task.status] ?? task.status}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                        <details className="rounded-xl border p-4">
                            <summary className="cursor-pointer font-medium">
                                Personnel — voir les présences
                            </summary>
                            {props.report.people.map((person, index) => (
                                <p key={index} className="mt-2 text-sm">
                                    {person.name} · {person.status}
                                </p>
                            ))}
                        </details>
                        <details className="rounded-xl border p-4">
                            <summary className="cursor-pointer font-medium">
                                Stocks en alerte —{' '}
                                {props.report.stock_alerts.length}
                            </summary>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Stock global actuel ; quantités en unités de
                                base.
                            </p>
                            {props.report.stock_alerts.map((stock, index) => (
                                <p key={index} className="mt-2 text-sm">
                                    {stock.name} · solde {stock.balance_base} ·
                                    seuil {stock.alert_threshold_base}
                                </p>
                            ))}
                        </details>
                        <details className="rounded-xl border p-4">
                            <summary className="cursor-pointer font-medium">
                                Historique, preuves et recommandations
                            </summary>
                            <pre className="mt-3 font-sans text-sm whitespace-pre-wrap">
                                {props.report.details.join('\n')}
                            </pre>
                        </details>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
