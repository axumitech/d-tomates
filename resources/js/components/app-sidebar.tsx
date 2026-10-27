import { Link, usePage } from '@inertiajs/react';
import {
    ClipboardList,
    LayoutGrid,
    ShieldCheck,
    UsersRound,
    Wrench,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { home } from '@/routes';
import type { NavItem, Auth } from '@/types';

const mainNavItems: NavItem[] = [
    {
        title: 'Pilotage',
        href: home(),
        icon: LayoutGrid,
    },
    { title: 'Tâches quotidiennes', href: '/taches', icon: ClipboardList },
    {
        title: 'Carnet terrain',
        href: '/carnet',
        icon: ClipboardList,
    },
    {
        title: 'Maintenance',
        href: '/maintenance',
        icon: Wrench,
    },
    {
        title: 'Administration',
        href: '/administration',
        icon: UsersRound,
    },
];

const footerNavItems: NavItem[] = [
    {
        title: 'Registres sécurisés',
        href: '/registres',
        icon: ShieldCheck,
    },
];

export function AppSidebar() {
    const { auth } = usePage<{ auth: Auth }>().props;
    const modules = auth.user.modules as string[] | null;
    const allowed = (item: NavItem) => {
        const path = typeof item.href === 'string' ? item.href : item.href.url;

        return (
            modules == null ||
            modules.includes(path === '/' ? 'pilotage' : path.slice(1))
        );
    };

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={home()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems.filter(allowed)} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter
                    items={footerNavItems.filter(allowed)}
                    className="mt-auto"
                />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
