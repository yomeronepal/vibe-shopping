import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { getInstagramConnectUrl } from '../api/socials';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import SettingsTabs from '../components/vendor/SettingsTabs';
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

    const handleConnectInstagram = async () => {
        try {
            const url = await getInstagramConnectUrl();
            window.location.href = url;
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not start the Instagram connection.');
        }
    };

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
                    <h1 className="text-3xl font-extrabold tracking-tight mb-6" style={{ color: themeConfig.text }}>
                        Settings
                    </h1>
                    <SettingsTabs />
                    <p style={{ color: themeConfig.textSecondary }}>
                        Connect your Facebook Page to manage messages, comments, and posts from this dashboard.
                    </p>
                    <div className="mt-6 space-y-4">
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
                    <div className="mt-8 flex flex-wrap gap-3">
                        <button
                            onClick={handleConnect}
                            className="rounded-xl px-5 py-2.5 text-white font-semibold shadow-sm transition-transform hover:scale-[0.99]"
                            style={{ backgroundColor: '#1877F2' }}
                        >
                            Connect Facebook Page
                        </button>
                        <button
                            onClick={handleConnectInstagram}
                            className="rounded-xl px-5 py-2.5 text-white font-semibold shadow-sm transition-transform hover:scale-[0.99]"
                            style={{ background: 'linear-gradient(135deg, #f09433, #dc2743, #bc1888)' }}
                        >
                            Connect Instagram only
                        </button>
                    </div>
                    <p className="mt-3 text-xs" style={{ color: themeConfig.textSecondary }}>
                        Have both? Connect the Facebook Page — a linked Instagram comes with it.
                        "Instagram only" is for professional accounts without a Facebook Page.
                    </p>
                </div>
            </div>
        </VendorShell>
    );
}
