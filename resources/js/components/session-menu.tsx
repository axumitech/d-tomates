import { Link, router, usePage } from '@inertiajs/react';

export default function SessionMenu() {
    const { auth } = usePage<{ auth: { user: { name: string } | null } }>()
        .props;

    if (!auth.user) {
        return null;
    }

    return (
        <div className="flex items-center justify-end gap-3 border-b bg-white px-4 py-2 text-sm text-slate-700">
            <span>{auth.user.name}</span>
            <Link
                href="/profil"
                className="rounded border px-3 py-1 font-medium hover:bg-emerald-50"
            >
                Mon profil
            </Link>
            <button
                type="button"
                onClick={() =>
                    router.post(
                        '/logout',
                        {},
                        { onSuccess: () => window.location.replace('/login') },
                    )
                }
                className="rounded border px-3 py-1 font-medium"
            >
                Se déconnecter
            </button>
        </div>
    );
}
