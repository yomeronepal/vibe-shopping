import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { vendorApi, type ProductAnalytics, type AnalyticsPost } from '../api/vendor';
import { mediaUrl } from '../api/media';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    posted: { bg: '#dcfce7', fg: '#15803d' },
    scheduled: { bg: '#dbeafe', fg: '#1d4ed8' },
    draft: { bg: '#f3f4f6', fg: '#4b5563' },
    pending: { bg: '#fef3c7', fg: '#b45309' },
    failed: { bg: '#fee2e2', fg: '#b91c1c' },
};

function StatusPill({ status }: { status: string }) {
    const palette = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
    return (
        <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap"
            style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
            {status}
        </span>
    );
}

function PlatformBadge({ platform }: { platform: AnalyticsPost['platform'] }) {
    const isInstagram = platform === 'instagram';
    return (
        <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
            style={{ background: isInstagram ? 'linear-gradient(135deg, #f09433, #dc2743)' : '#1877F2' }}
        >
            {isInstagram ? 'IG' : 'FB'}
        </span>
    );
}

function StatTile({ label, value }: { label: string; value: number }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className="flex-1 min-w-[120px] rounded-2xl border p-4 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
        >
            <p className="text-2xl font-extrabold" style={{ color: themeConfig.text }}>{value.toLocaleString()}</p>
            <p className="text-xs font-medium mt-1" style={{ color: themeConfig.textSecondary }}>{label}</p>
        </div>
    );
}

function PostRow({ post }: { post: AnalyticsPost }) {
    const { config: themeConfig } = useShopTheme();
    const posted = post.status === 'posted';
    return (
        <div
            className="rounded-2xl border p-4 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <PlatformBadge platform={post.platform} />
                    {post.post_format === 'story' && (
                        <span className="text-xs font-semibold" style={{ color: themeConfig.textSecondary }}>Story</span>
                    )}
                    <StatusPill status={post.status} />
                    <span className="text-xs" style={{ color: themeConfig.textSecondary }}>
                        {new Date(post.scheduled_for ?? post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                </div>
                {posted && post.post_url && (
                    <a
                        href={post.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold"
                        style={{ color: themeConfig.primary }}
                    >
                        View post
                    </a>
                )}
            </div>
            {post.caption && (
                <p className="mt-2 text-sm truncate" style={{ color: themeConfig.text }}>{post.caption}</p>
            )}
            {posted ? (
                <div className="mt-3 flex gap-5 text-sm" style={{ color: themeConfig.textSecondary }}>
                    <span>❤️ {post.engagement.likes.toLocaleString()} likes</span>
                    <span>💬 {post.engagement.comments.toLocaleString()} comments</span>
                    {post.platform === 'facebook' && (
                        <span>↗️ {post.engagement.shares.toLocaleString()} shares</span>
                    )}
                </div>
            ) : post.status === 'failed' ? (
                <p className="mt-2 text-sm text-red-600">{post.error_message}</p>
            ) : null}
        </div>
    );
}

export default function VendorProductDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { config: themeConfig } = useShopTheme();
    const [data, setData] = useState<ProductAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = (refresh = false) => {
        if (!id) return;
        if (refresh) setRefreshing(true);
        else setLoading(true);
        vendorApi.getProductAnalytics(id, refresh)
            .then((payload) => {
                setData(payload);
                setSelectedImage((current) => current ?? mediaUrl(payload.product.processed_image || payload.product.image));
            })
            .catch(() => toast.error('Could not load this product. Refresh to retry.'))
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    };

    useEffect(() => {
        load();
    }, [id]);

    const product = data?.product;
    const gallery = product
        ? [product.processed_image, product.image, ...(product.images ?? []).map((img) => img.image)]
            .map((path) => mediaUrl(path ?? null))
            .filter((src): src is string => Boolean(src))
        : [];

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-5xl px-4 md:px-6 py-8">
                    <Link to="/vendor/products" className="text-sm font-semibold" style={{ color: themeConfig.primary }}>
                        ← All products
                    </Link>
                    {loading && (
                        <p className="mt-8 text-sm" style={{ color: themeConfig.textSecondary }}>Loading product…</p>
                    )}
                    {!loading && !product && (
                        <p className="mt-8 text-sm" style={{ color: themeConfig.textSecondary }}>
                            Product not found. It may have been deleted.
                        </p>
                    )}
                    {product && data && (
                        <>
                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <div
                                        className="aspect-square rounded-2xl overflow-hidden border flex items-center justify-center"
                                        style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                                    >
                                        {selectedImage ? (
                                            <img src={selectedImage} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-5xl" style={{ color: themeConfig.textSecondary }}>image</span>
                                        )}
                                    </div>
                                    {gallery.length > 1 && (
                                        <div className="flex gap-2 overflow-x-auto">
                                            {gallery.map((src) => (
                                                <button
                                                    key={src}
                                                    onClick={() => setSelectedImage(src)}
                                                    className="w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0"
                                                    style={{ borderColor: selectedImage === src ? themeConfig.primary : 'transparent' }}
                                                >
                                                    <img src={src} alt={product.name} className="w-full h-full object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                        {product.name}
                                    </h1>
                                    <p className="text-xl font-bold mt-1" style={{ color: themeConfig.primary }}>
                                        Rs. {Number(product.price).toLocaleString()}
                                    </p>
                                    <p className="mt-3 text-sm leading-relaxed" style={{ color: themeConfig.textSecondary }}>
                                        {product.description || 'No description yet.'}
                                    </p>
                                    <div className="mt-5 grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs" style={{ color: themeConfig.textSecondary }}>Stock</p>
                                            <p className="font-bold" style={{ color: themeConfig.text }}>{product.stock} units</p>
                                        </div>
                                        <div>
                                            <p className="text-xs" style={{ color: themeConfig.textSecondary }}>Status</p>
                                            <p className="font-bold capitalize" style={{ color: themeConfig.text }}>{product.status}</p>
                                        </div>
                                    </div>
                                    {(product.tags?.length || product.vibe_tags?.length) ? (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {[...(product.tags ?? []), ...(product.vibe_tags ?? [])].slice(0, 8).map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="px-2 py-1 rounded-full text-xs font-semibold"
                                                    style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-10 flex items-center justify-between gap-3">
                                <h2 className="text-xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                    Social performance
                                </h2>
                                <button
                                    onClick={() => load(true)}
                                    disabled={refreshing}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold disabled:opacity-50"
                                    style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                >
                                    <span className={`material-symbols-outlined text-[18px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
                                    {refreshing ? 'Refreshing…' : 'Refresh'}
                                </button>
                            </div>
                            <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                                Engagement from Facebook and Instagram, refreshed every 10 minutes.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3">
                                <StatTile label="Published posts" value={data.totals.published_posts} />
                                <StatTile label="Likes" value={data.totals.likes} />
                                <StatTile label="Comments" value={data.totals.comments} />
                                <StatTile label="Shares" value={data.totals.shares} />
                            </div>
                            <div className="mt-5 space-y-3">
                                {data.posts.map((post) => (
                                    <PostRow key={post.id} post={post} />
                                ))}
                                {data.posts.length === 0 && (
                                    <div
                                        className="rounded-2xl border border-dashed p-8 text-center"
                                        style={{ borderColor: themeConfig.border }}
                                    >
                                        <p className="font-semibold" style={{ color: themeConfig.text }}>No posts yet</p>
                                        <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                                            Publish or schedule this product from the Publishing calendar to see its performance here.
                                        </p>
                                        <Link
                                            to="/vendor/calendar"
                                            className="inline-block mt-4 px-4 py-2 rounded-xl text-white font-semibold"
                                            style={{ backgroundColor: themeConfig.primary }}
                                        >
                                            Open Publishing
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
