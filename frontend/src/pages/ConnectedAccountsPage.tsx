import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    disconnectMetaPage,
    fetchConnectedPages,
    startConnect,
} from '@/features/socials/socialsSlice';
import type { ConnectedPage } from '@/api/socials';

const STATUS_LABELS: Record<ConnectedPage['status'], string> = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    token_expired: 'Reconnect needed',
};

function StatusPill({ status }: { status: ConnectedPage['status'] }) {
    const colors: Record<ConnectedPage['status'], { bg: string; fg: string }> = {
        connected: { bg: '#dcfce7', fg: '#15803d' },
        disconnected: { bg: '#f3f4f6', fg: '#4b5563' },
        token_expired: { bg: '#fef3c7', fg: '#b45309' },
    };
    const palette = colors[status];
    return (
        <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
            {STATUS_LABELS[status]}
        </span>
    );
}

function PageCard({ page }: { page: ConnectedPage }) {
    const dispatch = useAppDispatch();
    const { config: themeConfig } = useShopTheme();

    const handleDisconnect = async () => {
        try {
            await dispatch(disconnectMetaPage(page.page_id)).unwrap();
            toast.success(`${page.name} disconnected`);
        } catch {
            toast.error('Could not disconnect the Page. Try again.');
        }
    };

    return (
        <div
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex items-center gap-4 min-w-0">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0"
                    style={{ background: '#1877F2' }}
                >
                    <span className="material-symbols-outlined">flag</span>
                </div>
                <div className="min-w-0">
                    <p className="font-bold truncate" style={{ color: themeConfig.text }}>{page.name}</p>
                    {page.instagram_username ? (
                        <p className="text-sm truncate" style={{ color: themeConfig.textSecondary }}>
                            Instagram: @{page.instagram_username}
                        </p>
                    ) : (
                        <p className="text-sm" style={{ color: themeConfig.textSecondary }}>
                            No Instagram account linked
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <StatusPill status={page.status} />
                {page.status === 'connected' && (
                    <button onClick={handleDisconnect} className="text-sm font-semibold text-red-600 hover:text-red-700">
                        Disconnect
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ConnectedAccountsPage() {
    const dispatch = useAppDispatch();
    const { config: themeConfig } = useShopTheme();
    const { pages, loading } = useAppSelector((state) => state.socials);

    useEffect(() => {
        dispatch(fetchConnectedPages());
    }, [dispatch]);

    const handleConnect = async () => {
        try {
            const url = await dispatch(startConnect()).unwrap();
            window.location.href = url;
        } catch {
            toast.error('Could not start the Facebook connection. Try again.');
        }
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-8">
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                        Connected accounts
                    </h1>
                    <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                        Connect your Facebook Page to manage messages, comments, and posts from this dashboard.
                    </p>
                    <div className="mt-8 space-y-4">
                        {pages.map((page) => (
                            <PageCard key={page.id} page={page} />
                        ))}
                        {!loading && pages.length === 0 && (
                            <div
                                className="rounded-2xl border border-dashed p-10 text-center"
                                style={{ borderColor: themeConfig.border }}
                            >
                                <span className="material-symbols-outlined text-4xl" style={{ color: themeConfig.textSecondary }}>link</span>
                                <p className="mt-2 font-semibold" style={{ color: themeConfig.text }}>No Pages connected</p>
                                <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                                    Connect a Facebook Page below to start receiving messages and publishing products.
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleConnect}
                        className="mt-8 rounded-xl px-5 py-2.5 text-white font-semibold shadow-sm transition-transform hover:scale-[0.99]"
                        style={{ backgroundColor: themeConfig.primary }}
                    >
                        Connect Facebook Page
                    </button>
                </div>
            </div>
        </VendorShell>
    );
}
