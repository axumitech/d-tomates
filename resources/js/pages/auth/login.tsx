import { Head, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';

export default function Login() {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
    });
    function submit(event: FormEvent) {
        event.preventDefault();
        post('/login', { onFinish: () => reset('password') });
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6 text-slate-900">
            <Head title="Connexion" />
            <section className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm">
                <img
                    src="/logo-dtomate.png"
                    alt="D’Tomate"
                    className="mx-auto mb-6 h-20 object-contain"
                />
                <h1 className="text-2xl font-semibold">Connexion à D’Tomate</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Connectez-vous avec votre compte pour accéder à la ferme.
                </p>
                <form onSubmit={submit} className="mt-6 space-y-4">
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-1 block text-sm font-medium"
                        >
                            Adresse e-mail
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="username"
                            autoFocus
                            required
                            value={data.email}
                            onChange={(event) =>
                                setData('email', event.target.value)
                            }
                            className="w-full rounded-lg border px-3 py-2"
                        />
                        {errors.email && (
                            <p
                                role="alert"
                                className="mt-1 text-sm text-red-700"
                            >
                                {errors.email}
                            </p>
                        )}
                    </div>
                    <div>
                        <label
                            htmlFor="password"
                            className="mb-1 block text-sm font-medium"
                        >
                            Mot de passe
                        </label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={data.password}
                            onChange={(event) =>
                                setData('password', event.target.value)
                            }
                            className="w-full rounded-lg border px-3 py-2"
                        />
                        {errors.password && (
                            <p
                                role="alert"
                                className="mt-1 text-sm text-red-700"
                            >
                                {errors.password}
                            </p>
                        )}
                    </div>
                    <button
                        disabled={processing}
                        type="submit"
                        className="w-full rounded-lg bg-emerald-800 py-3 font-semibold text-white disabled:opacity-50"
                    >
                        {processing ? 'Connexion…' : 'Se connecter'}
                    </button>
                </form>
                <p className="mt-5 text-sm text-slate-500">
                    Pour obtenir un accès ou réinitialiser votre mot de passe,
                    contactez l’administrateur.
                </p>
            </section>
        </main>
    );
}
