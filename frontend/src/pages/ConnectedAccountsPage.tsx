import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    disconnectMetaPage,
    fetchConnectedPages,
    startConnect,
} from '@/features/socials/socialsSlice';
import type { ConnectedPage } from '@/api/socials';

function StatusBadge({ status }: { status: ConnectedPage['status'] }) {
    const styles: Record<ConnectedPage['status'], string> = {
        connected: 'bg-green-100 text-green-800',
        disconnected: 'bg-gray-100 text-gray-600',
        token_expired: 'bg-amber-100 text-amber-800',
    };
    const labels: Record<ConnectedPage['status'], string> = {
        connected: 'Connected',
        disconnected: 'Disconnected',
        token_expired: 'Reconnect needed',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

function PageCard({ page }: { page: ConnectedPage }) {
    const dispatch = useAppDispatch();

    const handleDisconnect = async () => {
        try {
            await dispatch(disconnectMetaPage(page.page_id)).unwrap();
            toast.success(`${page.name} disconnected`);
        } catch {
            toast.error('Could not disconnect the Page');
        }
    };

    return (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div>
                <p className="font-semibold text-gray-900">{page.name}</p>
                {page.instagram_username && (
                    <p className="text-sm text-gray-500">Instagram: @{page.instagram_username}</p>
                )}
            </div>
            <div className="flex items-center gap-3">
                <StatusBadge status={page.status} />
                {page.status === 'connected' ? (
                    <button
                        onClick={handleDisconnect}
                        className="text-sm text-red-600 hover:text-red-700"
                    >
                        Disconnect
                    </button>
                ) : (
                    <Link to="/vendor/settings/accounts" className="text-sm text-indigo-600">
                        Reconnect below
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function ConnectedAccountsPage() {
    const dispatch = useAppDispatch();
    const { pages, loading } = useAppSelector((state) => state.socials);

    useEffect(() => {
        dispatch(fetchConnectedPages());
    }, [dispatch]);

    const handleConnect = async () => {
        try {
            const url = await dispatch(startConnect()).unwrap();
            window.location.href = url;
        } catch {
            toast.error('Could not start the Facebook connection');
        }
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
            <p className="mt-1 text-gray-500">
                Connect your Facebook Page to manage messages, comments, and posts.
            </p>
            <div className="mt-6 space-y-3">
                {pages.map((page) => (
                    <PageCard key={page.id} page={page} />
                ))}
                {!loading && pages.length === 0 && (
                    <p className="text-sm text-gray-500">No Pages connected yet.</p>
                )}
            </div>
            <button
                onClick={handleConnect}
                className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
            >
                Connect Facebook Page
            </button>
        </div>
    );
}
