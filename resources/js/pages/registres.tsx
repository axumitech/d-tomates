import { Head, Link } from '@inertiajs/react';
import {
    Archive,
    CheckCircle2,
    Clock3,
    Database,
    Download,
    Eye,
    FileJson,
    Fingerprint,
    History,
    KeyRound,
    LockKeyhole,
    RefreshCw,
    Search,
    ShieldCheck,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';

type RegisterMeta = {
    key: string;
    checksum: string;
    synced_at: string | null;
    size_bytes: number;
    revision_count: number;
};

type RegisterDetail = {
    value: string | null;
    checksum: string | null;
    synced_at: string | null;
    revision_count: number;
};

type Revision = {
    id: number;
    checksum: string;
    created_at: string | null;
};

const categoryStyles: Record<string, string> = {
    Journées: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    Production: 'border-lime-200 bg-lime-50 text-lime-800',
    Stocks: 'border-amber-200 bg-amber-50 text-amber-800',
    Traçabilité: 'border-sky-200 bg-sky-50 text-sky-800',
    Rapports: 'border-violet-200 bg-violet-50 text-violet-800',
    Médias: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
    Système: 'border-slate-200 bg-slate-100 text-slate-700',
};

const categoryOf = (key: string) => {
    if (/^dt:(TOM|BAN|AVI|LIV):\d{4}-\d{2}-\d{2}$/.test(key)) {
        return 'Journées';
    }

    if (key.startsWith('dt:stock:')) {
        return 'Stocks';
    }

    if (key.startsWith('dt:photo:')) {
        return 'Médias';
    }

    if (key.includes(':lot') || key.includes(':livraison')) {
        return 'Traçabilité';
    }

    if (key.includes(':rapport') || key.includes(':arch:')) {
        return 'Rapports';
    }

    if (key.startsWith('dt:reg:') || key.includes(':culture')) {
        return 'Production';
    }

    return 'Système';
};

const registerName = (key: string) => {
    const daily = key.match(/^dt:(TOM|BAN|AVI|LIV):(\d{4}-\d{2}-\d{2})$/);

    if (daily) {
        const areas: Record<string, string> = {
            TOM: 'Serre',
            BAN: 'Bananeraie',
            AVI: 'Poulailler',
            LIV: 'Livraisons',
        };

        return `Journée ${areas[daily[1]]} · ${daily[2]}`;
    }

    const names: Record<string, string> = {
        'dt:reg:cultures': 'Cultures en place',
        'dt:reg:archives': 'Archives des cultures',
        'dt:reg:taches': 'Tâches permanentes',
        'dt:stock:articles': 'Catalogue et niveaux de stock',
        'dt:stock:mouvements': 'Mouvements de stock',
        'dt:lots': 'Lots et traçabilité',
        'dt:journal': "Journal d'activité",
        'dt:meta': 'Métadonnées du carnet',
        'dt:mesures:histo': 'Historique des mesures',
    };

    return (
        names[key] ??
        key
            .replace(/^dt:/, '')
            .split(':')
            .map((part) => part.replaceAll('_', ' '))
            .join(' · ')
    );
};

const dateTime = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat('fr-FR', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : 'Jamais synchronisé';

const bytes = (value: number) => {
    if (value < 1024) {
        return `${value} o`;
    }

    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} Ko`;
    }

    return `${(value / 1024 / 1024).toFixed(1)} Mo`;
};

const prettyValue = (value: string | null) => {
    if (value === null) {
        return 'Aucune donnée';
    }

    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
};

export default function Registres() {
    const [siteCode, setSiteCode] = useState('');
    const [codeInput, setCodeInput] = useState('');
    const [records, setRecords] = useState<RegisterMeta[]>([]);
    const [unlocked, setUnlocked] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('Tous');
    const [selected, setSelected] = useState<RegisterMeta | null>(null);
    const [detail, setDetail] = useState<RegisterDetail | null>(null);
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadCatalogue = useCallback(async (candidate: string) => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/carnet-storage/records', {
                headers: { 'X-DTomate-Site-Code': candidate },
            });

            if (response.status === 401) {
                throw new Error('Le code du site est incorrect.');
            }

            if (!response.ok) {
                throw new Error('Le registre serveur ne répond pas.');
            }

            const payload = (await response.json()) as {
                records: RegisterMeta[];
            };
            setRecords(payload.records);
            setSiteCode(candidate);
            setCodeInput(candidate);
            setUnlocked(true);
            window.localStorage.setItem(
                'dtomate:access:site-approved',
                candidate,
            );
        } catch (caught) {
            setUnlocked(false);
            setError(
                caught instanceof Error
                    ? caught.message
                    : 'Impossible d’ouvrir les registres.',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const approved = window.localStorage.getItem(
            'dtomate:access:site-approved',
        );

        if (approved) {
            const timeout = window.setTimeout(
                () => void loadCatalogue(approved),
                0,
            );

            return () => window.clearTimeout(timeout);
        }
    }, [loadCatalogue]);

    const categories = useMemo(
        () => [
            'Tous',
            ...Array.from(
                new Set(records.map((record) => categoryOf(record.key))),
            ),
        ],
        [records],
    );

    const filtered = useMemo(
        () =>
            records.filter((record) => {
                const matchesCategory =
                    category === 'Tous' || categoryOf(record.key) === category;
                const haystack =
                    `${record.key} ${registerName(record.key)}`.toLowerCase();

                return (
                    matchesCategory && haystack.includes(query.toLowerCase())
                );
            }),
        [category, query, records],
    );

    const loadRecord = async (record: RegisterMeta) => {
        setSelected(record);
        setDetail(null);
        setRevisions([]);
        setDetailLoading(true);

        try {
            const headers = { 'X-DTomate-Site-Code': siteCode };
            const [detailResponse, historyResponse] = await Promise.all([
                fetch(
                    `/api/carnet-storage/value?key=${encodeURIComponent(record.key)}`,
                    { headers },
                ),
                fetch(
                    `/api/carnet-storage/history?key=${encodeURIComponent(record.key)}`,
                    { headers },
                ),
            ]);

            if (!detailResponse.ok || !historyResponse.ok) {
                throw new Error('Lecture impossible');
            }

            setDetail((await detailResponse.json()) as RegisterDetail);
            const history = (await historyResponse.json()) as {
                revisions: Revision[];
            };
            setRevisions(history.revisions);
        } catch {
            setError('Impossible de lire ce registre pour le moment.');
        } finally {
            setDetailLoading(false);
        }
    };

    const download = () => {
        if (!selected || !detail?.value) {
            return;
        }

        const blob = new Blob([prettyValue(detail.value)], {
            type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${selected.key.replaceAll(':', '-')}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const submitCode = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (codeInput.trim()) {
            void loadCatalogue(codeInput.trim());
        }
    };

    const totalRevisions = records.reduce(
        (sum, record) => sum + record.revision_count,
        0,
    );
    const totalSize = records.reduce(
        (sum, record) => sum + record.size_bytes,
        0,
    );

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Pilotage', href: '/' },
                { title: 'Registres sécurisés', href: '/registres' },
            ]}
        >
            <Head title="Registres sécurisés" />
            <main className="min-h-full bg-[#f4f7f3] p-4 text-slate-900 md:p-7 dark:bg-[#101611] dark:text-slate-100">
                <div className="mx-auto max-w-[1500px] space-y-5">
                    <header className="overflow-hidden rounded-3xl bg-[#173f2b] text-white shadow-sm">
                        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end md:p-8">
                            <div>
                                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                                    <ShieldCheck className="size-6 text-emerald-200" />
                                </div>
                                <p className="text-xs font-semibold tracking-[0.2em] text-emerald-200 uppercase">
                                    Coffre documentaire D’Tomate
                                </p>
                                <h1 className="mt-2 text-3xl font-semibold md:text-4xl">
                                    Registres sécurisés
                                </h1>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">
                                    Consultez les écritures synchronisées, leur
                                    empreinte d’intégrité et la piste de chaque
                                    révision. Cet espace est strictement en
                                    lecture seule.
                                </p>
                            </div>
                            {unlocked && (
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={() =>
                                            void loadCatalogue(siteCode)
                                        }
                                        disabled={loading}
                                    >
                                        <RefreshCw
                                            className={cn(
                                                'size-4',
                                                loading && 'animate-spin',
                                            )}
                                        />
                                        Actualiser
                                    </Button>
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                                    >
                                        <Link href="/carnet">
                                            Ouvrir le carnet
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </header>

                    {!unlocked ? (
                        <section className="mx-auto max-w-xl rounded-3xl border bg-white p-6 shadow-sm md:p-8 dark:border-white/10 dark:bg-white/[0.04]">
                            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <LockKeyhole className="size-7" />
                            </div>
                            <div className="mt-5 text-center">
                                <h2 className="text-xl font-semibold">
                                    Déverrouiller le coffre
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    Saisissez le même code de site que dans le
                                    Carnet terrain. Les codes personnels ne sont
                                    jamais affichés ici.
                                </p>
                            </div>
                            <form
                                onSubmit={submitCode}
                                className="mt-7 grid gap-3"
                            >
                                <Label htmlFor="site-code">Code du site</Label>
                                <div className="relative">
                                    <KeyRound className="absolute top-3 left-3 size-4 text-slate-400" />
                                    <Input
                                        id="site-code"
                                        type="password"
                                        autoComplete="current-password"
                                        className="pl-9"
                                        value={codeInput}
                                        onChange={(event) =>
                                            setCodeInput(event.target.value)
                                        }
                                        placeholder="Code communiqué par la Direction"
                                        autoFocus
                                    />
                                </div>
                                {error && (
                                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                        {error}
                                    </p>
                                )}
                                <Button
                                    type="submit"
                                    size="lg"
                                    disabled={loading || !codeInput.trim()}
                                    className="mt-2"
                                >
                                    {loading ? (
                                        <RefreshCw className="size-4 animate-spin" />
                                    ) : (
                                        <LockKeyhole className="size-4" />
                                    )}
                                    {loading
                                        ? 'Vérification…'
                                        : 'Accéder aux registres'}
                                </Button>
                            </form>
                        </section>
                    ) : (
                        <>
                            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {[
                                    {
                                        label: 'Registres synchronisés',
                                        value: records.length,
                                        detail: 'Codes personnels exclus',
                                        Icon: Database,
                                        tone: 'bg-emerald-50 text-emerald-700',
                                    },
                                    {
                                        label: 'Écritures historiques',
                                        value: totalRevisions,
                                        detail: 'Révisions en ajout seul',
                                        Icon: History,
                                        tone: 'bg-sky-50 text-sky-700',
                                    },
                                    {
                                        label: 'Volume vérifié',
                                        value: bytes(totalSize),
                                        detail: 'Données JSON côté serveur',
                                        Icon: Archive,
                                        tone: 'bg-amber-50 text-amber-700',
                                    },
                                    {
                                        label: 'Protection',
                                        value: 'SHA-256',
                                        detail: 'Empreinte pour chaque version',
                                        Icon: Fingerprint,
                                        tone: 'bg-violet-50 text-violet-700',
                                    },
                                ].map(
                                    ({
                                        label,
                                        value,
                                        detail: text,
                                        Icon,
                                        tone,
                                    }) => (
                                        <article
                                            key={label}
                                            className="rounded-2xl border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <div
                                                    className={cn(
                                                        'rounded-xl p-2.5',
                                                        tone,
                                                    )}
                                                >
                                                    <Icon className="size-5" />
                                                </div>
                                                <strong className="text-2xl">
                                                    {value}
                                                </strong>
                                            </div>
                                            <p className="mt-4 text-sm font-medium">
                                                {label}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {text}
                                            </p>
                                        </article>
                                    ),
                                )}
                            </section>

                            {error && (
                                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                    {error}
                                </p>
                            )}

                            <section className="grid min-h-[680px] gap-5 xl:grid-cols-[460px_1fr]">
                                <aside className="rounded-2xl border bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                                    <div className="relative">
                                        <Search className="absolute top-2.5 left-3 size-4 text-slate-400" />
                                        <Input
                                            className="pl-9"
                                            value={query}
                                            onChange={(event) =>
                                                setQuery(event.target.value)
                                            }
                                            placeholder="Rechercher un registre…"
                                        />
                                    </div>
                                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                                        {categories.map((item) => (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() =>
                                                    setCategory(item)
                                                }
                                                className={cn(
                                                    'rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition',
                                                    category === item
                                                        ? 'border-emerald-700 bg-emerald-700 text-white'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:bg-transparent dark:text-slate-300',
                                                )}
                                            >
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2 max-h-[590px] space-y-2 overflow-y-auto pr-1">
                                        {filtered.map((record) => {
                                            const recordCategory = categoryOf(
                                                record.key,
                                            );

                                            return (
                                                <button
                                                    key={record.key}
                                                    type="button"
                                                    onClick={() =>
                                                        void loadRecord(record)
                                                    }
                                                    className={cn(
                                                        'w-full rounded-xl border p-4 text-left transition',
                                                        selected?.key ===
                                                            record.key
                                                            ? 'border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-100 dark:bg-emerald-950/30'
                                                            : 'border-slate-100 hover:border-slate-300 dark:border-white/10',
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold">
                                                                {registerName(
                                                                    record.key,
                                                                )}
                                                            </p>
                                                            <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                                                                {record.key}
                                                            </p>
                                                        </div>
                                                        <Badge
                                                            className={cn(
                                                                'shrink-0 border font-normal',
                                                                categoryStyles[
                                                                    recordCategory
                                                                ],
                                                            )}
                                                        >
                                                            {recordCategory}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                                                        <span>
                                                            {bytes(
                                                                record.size_bytes,
                                                            )}
                                                        </span>
                                                        <span>·</span>
                                                        <span>
                                                            {
                                                                record.revision_count
                                                            }{' '}
                                                            version(s)
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {filtered.length === 0 && (
                                            <div className="py-14 text-center text-sm text-slate-500">
                                                Aucun registre ne correspond à
                                                cette recherche.
                                            </div>
                                        )}
                                    </div>
                                </aside>

                                <article className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm md:p-6 dark:border-white/10 dark:bg-white/[0.04]">
                                    {!selected ? (
                                        <div className="flex min-h-[580px] flex-col items-center justify-center text-center">
                                            <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5">
                                                <Eye className="size-7" />
                                            </div>
                                            <h2 className="mt-5 text-lg font-semibold">
                                                Sélectionnez un registre
                                            </h2>
                                            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                                                Son contenu, son empreinte et
                                                son historique apparaîtront ici
                                                sans possibilité de
                                                modification.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            <div className="flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-start dark:border-white/10">
                                                <div className="min-w-0">
                                                    <Badge
                                                        className={cn(
                                                            'border font-normal',
                                                            categoryStyles[
                                                                categoryOf(
                                                                    selected.key,
                                                                )
                                                            ],
                                                        )}
                                                    >
                                                        {categoryOf(
                                                            selected.key,
                                                        )}
                                                    </Badge>
                                                    <h2 className="mt-3 text-2xl font-semibold">
                                                        {registerName(
                                                            selected.key,
                                                        )}
                                                    </h2>
                                                    <p className="mt-2 font-mono text-xs break-all text-slate-400">
                                                        {selected.key}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    onClick={download}
                                                    disabled={!detail?.value}
                                                >
                                                    <Download className="size-4" />
                                                    Exporter JSON
                                                </Button>
                                            </div>

                                            {detailLoading ? (
                                                <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
                                                    <RefreshCw className="mr-2 size-4 animate-spin" />
                                                    Vérification du registre…
                                                </div>
                                            ) : detail ? (
                                                <>
                                                    <div className="grid gap-3 md:grid-cols-3">
                                                        <div className="rounded-xl border p-3 dark:border-white/10">
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <CheckCircle2 className="size-4 text-emerald-600" />{' '}
                                                                Intégrité
                                                            </div>
                                                            <p className="mt-2 text-sm font-semibold text-emerald-700">
                                                                Empreinte
                                                                présente
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl border p-3 dark:border-white/10">
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <Clock3 className="size-4" />{' '}
                                                                Synchronisation
                                                            </div>
                                                            <p className="mt-2 text-sm font-semibold">
                                                                {dateTime(
                                                                    detail.synced_at,
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="rounded-xl border p-3 dark:border-white/10">
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <History className="size-4" />{' '}
                                                                Historique
                                                            </div>
                                                            <p className="mt-2 text-sm font-semibold">
                                                                {
                                                                    detail.revision_count
                                                                }{' '}
                                                                version(s)
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <section>
                                                        <div className="mb-2 flex items-center gap-2">
                                                            <Fingerprint className="size-4 text-emerald-700" />
                                                            <h3 className="text-sm font-semibold">
                                                                Empreinte
                                                                SHA-256
                                                            </h3>
                                                        </div>
                                                        <p className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-5 break-all text-emerald-300">
                                                            {detail.checksum}
                                                        </p>
                                                    </section>

                                                    <section>
                                                        <div className="mb-2 flex items-center gap-2">
                                                            <FileJson className="size-4 text-emerald-700" />
                                                            <h3 className="text-sm font-semibold">
                                                                Contenu
                                                                enregistré
                                                            </h3>
                                                        </div>
                                                        <pre className="max-h-[430px] overflow-auto rounded-xl border bg-slate-950 p-4 text-xs leading-5 text-slate-200 dark:border-white/10">
                                                            {selected.key.startsWith(
                                                                'dt:photo:',
                                                            )
                                                                ? '[Média protégé — utilisez l’export pour récupérer le fichier encodé]'
                                                                : prettyValue(
                                                                      detail.value,
                                                                  )}
                                                        </pre>
                                                    </section>

                                                    <section>
                                                        <div className="mb-3 flex items-center gap-2">
                                                            <History className="size-4 text-emerald-700" />
                                                            <h3 className="text-sm font-semibold">
                                                                Piste de
                                                                révision
                                                                immuable
                                                            </h3>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {revisions.map(
                                                                (
                                                                    revision,
                                                                    index,
                                                                ) => (
                                                                    <div
                                                                        key={
                                                                            revision.id
                                                                        }
                                                                        className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm dark:border-white/10"
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <p className="font-medium">
                                                                                Version{' '}
                                                                                {revisions.length -
                                                                                    index}
                                                                            </p>
                                                                            <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                                                                                {
                                                                                    revision.checksum
                                                                                }
                                                                            </p>
                                                                        </div>
                                                                        <time className="shrink-0 text-xs text-slate-500">
                                                                            {dateTime(
                                                                                revision.created_at,
                                                                            )}
                                                                        </time>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                    </section>
                                                </>
                                            ) : null}
                                        </div>
                                    )}
                                </article>
                            </section>
                        </>
                    )}
                </div>
            </main>
        </AppLayout>
    );
}
