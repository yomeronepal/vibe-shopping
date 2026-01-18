import { useState, useEffect } from 'react';
import { Instagram, Facebook, Music, Check, Loader2, AlertCircle, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorApi } from '../../api/vendor';

interface SocialMediaAccount {
    connected: boolean;
    username?: string;
    page_id?: string;
    access_token?: string;
    profile_picture?: string;
}

interface SocialMediaData {
    instagram?: SocialMediaAccount;
    facebook?: SocialMediaAccount;
    tiktok?: SocialMediaAccount;
}

export default function SocialMediaSettings() {
    const [socialMedia, setSocialMedia] = useState<SocialMediaData>({});
    const [loading, setLoading] = useState(true);
    const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);

    useEffect(() => {
        loadSocialMediaConnections();
        checkOAuthCallback();
    }, []);

    const loadSocialMediaConnections = async () => {
        try {
            const response = await vendorApi.getSocialMediaConnections();
            setSocialMedia(response.social_media || {});
        } catch (error) {
            console.error('Failed to load social media connections:', error);
            toast.error('Failed to load social media connections');
        } finally {
            setLoading(false);
        }
    };

    const checkOAuthCallback = () => {
        const params = new URLSearchParams(window.location.search);
        const success = params.get('oauth_success');
        const error = params.get('oauth_error');

        if (success) {
            toast.success(`${success.charAt(0).toUpperCase() + success.slice(1)} connected successfully!`);
            loadSocialMediaConnections();
            window.history.replaceState({}, '', '/vendor');
        } else if (error) {
            toast.error(`OAuth failed: ${error}`);
            window.history.replaceState({}, '', '/vendor');
        }
    };

    const handleConnect = async (platform: 'instagram' | 'facebook' | 'tiktok') => {
        setConnectingPlatform(platform);

        try {
            // Get OAuth URL from backend
            const response = await vendorApi.startOAuth(platform);
            const authUrl = response.auth_url;

            // Redirect to OAuth page
            window.location.href = authUrl;

        } catch (error) {
            console.error(`Failed to start OAuth for ${platform}:`, error);
            toast.error(`Failed to start ${platform} authentication`);
            setConnectingPlatform(null);
        }
    };

    const handleDisconnect = async (platform: 'instagram' | 'facebook' | 'tiktok') => {
        try {
            const updatedData: SocialMediaData = {
                ...socialMedia,
                [platform]: {
                    connected: false,
                }
            };

            await vendorApi.updateSocialMediaConnections({
                social_media: updatedData
            });

            setSocialMedia(updatedData);
            toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected`);

        } catch (error) {
            console.error(`Failed to disconnect ${platform}:`, error);
            toast.error(`Failed to disconnect ${platform}`);
        }
    };

    const platforms = [
        {
            id: 'instagram' as const,
            name: 'Instagram',
            icon: Instagram,
            color: '#E4405F',
            description: 'Share your products as posts and stories'
        },
        {
            id: 'facebook' as const,
            name: 'Facebook',
            icon: Facebook,
            color: '#1877F2',
            description: 'Post to your Facebook business page'
        },
        {
            id: 'tiktok' as const,
            name: 'TikTok',
            icon: Music,
            color: '#000000',
            description: 'Create engaging product videos'
        }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--vibe-accent)' }} />
                    <p style={{ color: 'var(--vibe-accent)' }}>Loading connections...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--vibe-fg)' }}>
                    Social Media Connections
                </h2>
                <p style={{ color: 'var(--vibe-accent)' }}>
                    Connect your business accounts to share products across platforms
                </p>
            </div>

            <div className="space-y-6">
                {platforms.map((platform) => {
                    const account = socialMedia[platform.id];
                    const isConnected = account?.connected;

                    return (
                        <div
                            key={platform.id}
                            className="border-2 p-6 transition-all"
                            style={{
                                borderColor: 'var(--vibe-border)',
                                borderRadius: 'var(--vibe-radius)',
                                backgroundColor: 'var(--vibe-bg)',
                            }}
                        >
                            <div className="flex items-start gap-4">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: platform.color }}
                                >
                                    <platform.icon className="w-6 h-6 text-white" />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xl font-bold" style={{ color: 'var(--vibe-fg)' }}>
                                            {platform.name}
                                        </h3>
                                        {isConnected && (
                                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30">
                                                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                                    Connected
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-sm mb-4" style={{ color: 'var(--vibe-accent)' }}>
                                        {platform.description}
                                    </p>

                                    {isConnected ? (
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-3 flex-1">
                                                {account.profile_picture ? (
                                                    <img
                                                        src={account.profile_picture}
                                                        alt={account.username || 'Profile'}
                                                        className="w-10 h-10 rounded-full"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                                                        <User className="w-5 h-5" style={{ color: 'var(--vibe-accent)' }} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium" style={{ color: 'var(--vibe-fg)' }}>
                                                        {account.username || account.page_id || 'Connected'}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--vibe-accent)' }}>
                                                        Business Account
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDisconnect(platform.id)}
                                                className="px-4 py-2 border-2 rounded-lg hover:opacity-70 transition-opacity"
                                                style={{
                                                    borderColor: 'var(--vibe-border)',
                                                    color: 'var(--vibe-fg)'
                                                }}
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <button
                                                onClick={() => handleConnect(platform.id)}
                                                disabled={connectingPlatform === platform.id}
                                                className="px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                                style={{ backgroundColor: platform.color }}
                                            >
                                                {connectingPlatform === platform.id ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        Connecting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <platform.icon className="w-5 h-5" />
                                                        Connect {platform.name}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-8 p-6 border-2 border-blue-200 dark:border-blue-800 rounded-lg" style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
            }}>
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--vibe-fg)' }}>
                            OAuth Setup Required
                        </h4>
                        <p className="text-sm" style={{ color: 'var(--vibe-accent)' }}>
                            To enable posting, you need to register OAuth apps with Meta (Facebook/Instagram) and TikTok.
                            Add your app credentials to the backend environment variables, then click "Connect" to link your business accounts.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
