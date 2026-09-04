import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { connectWhatsApp, getInstagramConnectUrl } from '../api/socials';
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
    const isWhatsApp = page.connection_type === 'whatsapp';

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
                    style={{ background: isWhatsApp ? '#25D366' : '#1877F2' }}
                >
                    <span className="material-symbols-outlined">{isWhatsApp ? 'chat' : 'flag'}</span>
                </div>
                <div className="min-w-0">
                    <p className="font-bold truncate" style={{ color: themeConfig.text }}>{page.name}</p>
                    {isWhatsApp ? (
                        <p className="text-sm" style={{ color: themeConfig.textSecondary }}>
                            WhatsApp Business number
                        </p>
                    ) : page.instagram_username ? (
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

    const [waOpen, setWaOpen] = useState(false);
    const [waPhoneId, setWaPhoneId] = useState('');
    const [waToken, setWaToken] = useState('');
    const [waSaving, setWaSaving] = useState(false);

    const handleConnectWhatsApp = async () => {
        setWaSaving(true);
        try {
            await connectWhatsApp(waPhoneId.trim(), waToken.trim());
            toast.success('WhatsApp number connected');
            setWaOpen(false);
            setWaPhoneId('');
            setWaToken('');
            dispatch(fetchConnectedPages());
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not connect WhatsApp.');
        } finally {
            setWaSaving(false);
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
                    <div className="mt-4">
                        <button
                            onClick={() => setWaOpen(true)}
                            className="rounded-xl px-5 py-2.5 text-white font-semibold shadow-sm transition-transform hover:scale-[0.99]"
                            style={{ backgroundColor: '#25D366' }}
                        >
                            Connect WhatsApp
                        </button>
                        <p className="mt-3 text-xs" style={{ color: themeConfig.textSecondary }}>
                            Customers message your WhatsApp Business number and the AI replies there too.
                        </p>
                    </div>

                    {waOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                            <div
                                className="w-full max-w-md rounded-2xl border p-6"
                                style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border }}
                            >
                                <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>Connect WhatsApp Business</h3>
                                <p className="text-xs mt-1 mb-4" style={{ color: themeConfig.textSecondary }}>
                                    In Meta for Developers, open your app → WhatsApp → API Setup. Copy the
                                    Phone number ID and a permanent access token, and paste them here.
                                </p>
                                <input
                                    value={waPhoneId}
                                    onChange={(e) => setWaPhoneId(e.target.value)}
                                    placeholder="Phone number ID"
                                    className="w-full rounded-xl text-sm py-2.5 px-4 border mb-3"
                                    style={{ backgroundColor: themeConfig.background, borderColor: themeConfig.border, color: themeConfig.text }}
                                />
                                <input
                                    value={waToken}
                                    onChange={(e) => setWaToken(e.target.value)}
                                    placeholder="Access token"
                                    className="w-full rounded-xl text-sm py-2.5 px-4 border"
                                    style={{ backgroundColor: themeConfig.background, borderColor: themeConfig.border, color: themeConfig.text }}
                                />
                                <div className="mt-5 flex justify-end gap-3">
                                    <button
                                        onClick={() => setWaOpen(false)}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold"
                                        style={{ color: themeConfig.textSecondary }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConnectWhatsApp}
                                        disabled={waSaving || !waPhoneId.trim() || !waToken.trim()}
                                        className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                                        style={{ backgroundColor: '#25D366' }}
                                    >
                                        {waSaving ? 'Connecting…' : 'Connect'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
