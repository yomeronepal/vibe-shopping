import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { completeInstagramOAuth } from '../api/socials';

export default function InstagramCallbackPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { config: themeConfig } = useShopTheme();
    const exchanged = useRef(false);

    useEffect(() => {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        if (!code || !state) {
            toast.error('Instagram connection was cancelled');
            navigate('/vendor/settings/accounts');
            return;
        }
        if (exchanged.current) return;
        exchanged.current = true;
        completeInstagramOAuth(code, state)
            .then((page) => {
                toast.success(`@${page.instagram_username || page.name} connected`);
            })
            .catch((error) => {
                toast.error(error.response?.data?.error || 'Could not complete the Instagram connection.');
            })
            .finally(() => navigate('/vendor/settings/accounts'));
    }, [navigate, searchParams]);

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-8">
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                        Connecting Instagram…
                    </h1>
                    <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                        Finishing the connection with Instagram.
                    </p>
                </div>
            </div>
        </VendorShell>
    );
}
