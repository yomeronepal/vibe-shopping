import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { connectMetaPage, finishOAuth } from '@/features/socials/socialsSlice';

export default function MetaCallbackPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { config: themeConfig } = useShopTheme();
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
                toast.error('Could not complete the Facebook connection. Try again.');
                navigate('/vendor/settings/accounts');
            });
    }, [dispatch, navigate, searchParams]);

    const handlePick = async (pageId: string, name: string) => {
        try {
            await dispatch(connectMetaPage(pageId)).unwrap();
            toast.success(`${name} connected`);
            navigate('/vendor/settings/accounts');
        } catch {
            toast.error('Could not connect the Page. Try again.');
        }
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-8">
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                        Choose a Page
                    </h1>
                    <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                        Pick the Facebook Page to connect to your business.
                    </p>
                    {loading && (
                        <p className="mt-6 text-sm" style={{ color: themeConfig.textSecondary }}>
                            Talking to Facebook…
                        </p>
                    )}
                    <div className="mt-6 space-y-3">
                        {availablePages.map((page) => (
                            <button
                                key={page.id}
                                onClick={() => handlePick(page.id, page.name)}
                                className="flex w-full items-center justify-between rounded-2xl border p-5 text-left backdrop-blur-xl shadow-sm transition-transform hover:scale-[0.995]"
                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                            >
                                <span className="font-bold" style={{ color: themeConfig.text }}>{page.name}</span>
                                <span className="text-sm font-semibold" style={{ color: themeConfig.primary }}>Connect</span>
                            </button>
                        ))}
                        {!loading && availablePages.length === 0 && (
                            <p className="text-sm" style={{ color: themeConfig.textSecondary }}>
                                No Pages available on this account. Make sure your Page was selected during the Facebook permission step.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </VendorShell>
    );
}
