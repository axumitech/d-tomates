import { createInertiaApp } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: () => null,
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(async (registration) => {
            const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"][href]'))
                .map((element) => element instanceof HTMLScriptElement ? element.src : element.href)
                .filter(Boolean);
            const worker = registration.active ?? registration.waiting ?? registration.installing;
            worker?.postMessage({ type: 'CACHE_URLS', urls: assets });
        }).catch(() => {
            // The application stays usable online if the browser blocks service workers.
        });
    });
}
