import { Head, useForm } from '@inertiajs/react';
import { LockKeyhole, UserRound } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';

type Props = { profile: { name: string; email: string }; roleLabel: string };

export default function Profil({ profile, roleLabel }: Props) {
    const {
        data,
        setData,
        put,
        processing,
        errors,
        reset,
        recentlySuccessful,
    } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    function submit(event: FormEvent) {
        event.preventDefault();
        put('/profil/mot-de-passe', {
            preserveScroll: true,
            onFinish: () => reset(),
        });
    }

    const fields = [
        {
            key: 'current_password',
            label: 'Mot de passe actuel',
            autoComplete: 'current-password',
        },
        {
            key: 'password',
            label: 'Nouveau mot de passe',
            autoComplete: 'new-password',
        },
        {
            key: 'password_confirmation',
            label: 'Confirmer le nouveau mot de passe',
            autoComplete: 'new-password',
        },
    ] as const;

    return (
        <AppLayout breadcrumbs={[{ title: 'Mon profil', href: '/profil' }]}>
            <Head title="Mon profil" />
            <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8">
                <header>
                    <h1 className="text-3xl font-semibold text-slate-900">
                        Mon profil
                    </h1>
                    <p className="mt-2 text-slate-600">
                        Vos informations de compte et votre mot de passe.
                    </p>
                </header>
                <section
                    className="rounded-2xl border bg-white p-6 shadow-sm"
                    aria-labelledby="account-title"
                >
                    <h2
                        id="account-title"
                        className="flex items-center gap-2 text-lg font-semibold text-slate-900"
                    >
                        <UserRound className="size-5 text-emerald-700" /> Mon
                        compte
                    </h2>
                    <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                        <div>
                            <dt className="text-sm text-slate-500">Nom</dt>
                            <dd className="mt-1 font-medium text-slate-900">
                                {profile.name}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-slate-500">
                                Adresse e-mail
                            </dt>
                            <dd className="mt-1 font-medium break-all text-slate-900">
                                {profile.email}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-sm text-slate-500">Rôle</dt>
                            <dd className="mt-1 font-medium text-slate-900">
                                {roleLabel}
                            </dd>
                        </div>
                    </dl>
                </section>
                <section
                    className="rounded-2xl border bg-white p-6 shadow-sm"
                    aria-labelledby="password-title"
                >
                    <h2
                        id="password-title"
                        className="flex items-center gap-2 text-lg font-semibold text-slate-900"
                    >
                        <LockKeyhole className="size-5 text-emerald-700" />{' '}
                        Changer mon mot de passe
                    </h2>
                    <p
                        id="password-help"
                        className="mt-2 text-sm text-slate-600"
                    >
                        Au moins 12 caractères, avec une majuscule, une
                        minuscule, un chiffre et un symbole.
                    </p>
                    <form onSubmit={submit} className="mt-6 space-y-5">
                        {fields.map(({ key, label, autoComplete }) => (
                            <div key={key} className="space-y-2">
                                <Label htmlFor={key}>{label}</Label>
                                <Input
                                    id={key}
                                    type="password"
                                    autoComplete={autoComplete}
                                    required
                                    disabled={processing}
                                    value={data[key]}
                                    onChange={(event) =>
                                        setData(key, event.target.value)
                                    }
                                    aria-invalid={Boolean(errors[key])}
                                    aria-describedby={`${key}-error${key === 'password' ? ' password-help' : ''}`}
                                />
                                <p
                                    id={`${key}-error`}
                                    role={errors[key] ? 'alert' : undefined}
                                    className="text-sm text-red-700"
                                >
                                    {errors[key]}
                                </p>
                            </div>
                        ))}
                        {recentlySuccessful && (
                            <p
                                role="status"
                                className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
                            >
                                Votre mot de passe a été modifié.
                            </p>
                        )}
                        <Button
                            type="submit"
                            disabled={processing}
                            className="bg-emerald-800 text-white hover:bg-emerald-900"
                        >
                            {processing
                                ? 'Enregistrement…'
                                : 'Enregistrer le nouveau mot de passe'}
                        </Button>
                    </form>
                </section>
            </main>
        </AppLayout>
    );
}
