import { Link } from '@inertiajs/react';
import { Leaf, ShieldCheck } from 'lucide-react';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <main className="min-h-svh bg-white text-[#163b2b]">
            <div className="grid min-h-svh lg:grid-cols-[1.08fr_0.92fr]">
                <section className="relative hidden min-h-svh overflow-hidden bg-[#123c2b] p-14 text-white lg:flex lg:flex-col xl:p-20">
                    <div className="absolute -top-24 -left-24 size-80 rounded-full border-[38px] border-[#e86236]/80" />
                    <div className="absolute -right-28 -bottom-32 size-96 rounded-full border-[52px] border-[#9dbb55]/50" />
                    <div className="relative flex items-center gap-3 text-sm font-semibold tracking-[0.16em] uppercase">
                        <img
                            src="/logo-dtomate.png"
                            alt="D'Tomate"
                            className="size-11 rounded-xl bg-white object-contain p-1"
                        />
                        D&apos;Tomate
                    </div>
                    <div className="relative my-auto max-w-lg">
                        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold tracking-[0.14em] uppercase">
                            <Leaf className="size-4 text-[#cce67b]" />
                            Exploitation connectée
                        </p>
                        <h2 className="text-5xl leading-[1.08] font-semibold xl:text-6xl">
                            Pilotez le terrain avec précision.
                        </h2>
                        <p className="mt-5 text-base leading-7 text-white/75">
                            Tâches, stock et traçabilité réunis dans un espace
                            simple et sécurisé pour La Ferme D&apos;Tomate.
                        </p>
                    </div>
                    <div className="relative flex items-center gap-3 text-sm text-white/70">
                        <ShieldCheck className="size-5 text-[#cce67b]" />
                        Accès sécurisé et journalisé
                    </div>
                </section>
                <section className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#fbfcf8] px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
                    <div className="absolute top-0 right-0 size-64 rounded-full bg-[#eaf0da] blur-3xl" />
                    <div className="relative w-full max-w-md">
                        <Link
                            href={home()}
                            className="mb-10 flex items-center gap-3 lg:hidden"
                        >
                            <img
                                src="/logo-dtomate.png"
                                alt="D'Tomate"
                                className="size-12 rounded-xl bg-white object-contain p-1 shadow-sm"
                            />
                            <span className="text-lg font-bold tracking-tight">
                                D&apos;Tomate
                            </span>
                        </Link>
                        <div className="mb-10">
                            <p className="text-xs font-bold tracking-[0.16em] text-[#6e8c45] uppercase">
                                Espace exploitation
                            </p>
                            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[#163b2b]">
                                {title}
                            </h1>
                            <p className="mt-3 text-sm leading-6 text-[#63756c]">
                                {description}
                            </p>
                        </div>
                        {children}
                        <p className="mt-10 text-center text-xs leading-5 text-[#829087]">
                            La Ferme D&apos;Tomate · SADC Supply Congo SARL
                            <br />
                            Ntetema, Haut-Katanga
                        </p>
                    </div>
                </section>
            </div>
        </main>
    );
}
