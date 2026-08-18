import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { connectMetaPage, finishOAuth } from '@/features/socials/socialsSlice';

export default function MetaCallbackPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { availablePages, loading } = useAppSelector((state) => state.socials);
    const exchanged = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) {
            toast.error('Facebook connection was cancelled');
            navigate('/vendor/settings/accounts');
            return;
        }
        if (exchanged.current) return;
        exchanged.current = true;
        dispatch(finishOAuth({ code, state }))
            .unwrap()
            .catch(() => {
                toast.error('Could not complete the Facebook connection');
                navigate('/vendor/settings/accounts');
            });
    }, [dispatch, navigate, searchParams]);

    const handlePick = async (pageId: string, name: string) => {
        try {
            await dispatch(connectMetaPage(pageId)).unwrap();
            toast.success(`${name} connected`);
            navigate('/vendor/settings/accounts');
        } catch {
            toast.error('Could not connect the Page');
        }
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10">
            <h1 className="text-2xl font-bold text-gray-900">Choose a Page</h1>
            <p className="mt-1 text-gray-500">
                Pick the Facebook Page to connect to your business.
            </p>
            {loading && <p className="mt-6 text-sm text-gray-500">Talking to Facebook…</p>}
            <div className="mt-6 space-y-3">
                {availablePages.map((page) => (
                    <button
                        key={page.id}
                        onClick={() => handlePick(page.id, page.name)}
                        className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-indigo-400"
                    >
                        <span className="font-semibold text-gray-900">{page.name}</span>
                        <span className="text-sm text-indigo-600">Connect</span>
                    </button>
                ))}
                {!loading && availablePages.length === 0 && (
                    <p className="text-sm text-gray-500">No Pages available on this account.</p>
                )}
            </div>
        </div>
    );
}
