import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { vendorApi, type Product } from '../api/vendor';
import { listVendorOrders, type VendorOrder } from '../api/orders';
import { listConversations, type InboxConversation } from '../api/inbox';
import { listConnectedPages, listPosts, type ConnectedPage, type ScheduledPost } from '../api/socials';
import { mediaUrl } from '../api/media';

const ORDER_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    pending_payment: { bg: '#fef3c7', fg: '#b45309' },
    pending_delivery: { bg: '#dbeafe', fg: '#1d4ed8' },
    preparing: { bg: '#fef9c3', fg: '#a16207' },
    returned: { bg: '#ffedd5', fg: '#c2410c' },
    shipped: { bg: '#e0e7ff', fg: '#4338ca' },
    delivered: { bg: '#dcfce7', fg: '#15803d' },
    completed: { bg: '#dcfce7', fg: '#15803d' },
    cancelled: { bg: '#f3f4f6', fg: '#4b5563' },
    disputed: { bg: '#fee2e2', fg: '#b91c1c' },
};

function formatDay(value: string | null): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function sumRevenue(orders: VendorOrder[]): number {
    return orders
        .filter((order) => !['cancelled', 'disputed'].includes(order.status))
        .reduce((total, order) => total + (parseFloat(order.total_amount) || 0), 0);
}

function StatTile({ icon, label, value, to }: { icon: string; label: string; value: string; to: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <Link
            to={to}
            className="flex-1 min-w-[150px] rounded-2xl border p-5 backdrop-blur-xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ backgroundColor: `${themeConfig.surface}85`, borderColor: `${themeConfig.border}60` }}
        >
            <div
                className="size-9 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
            >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            <p className="text-2xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>{value}</p>
            <p className="text-xs font-medium mt-1" style={{ color: themeConfig.textSecondary }}>{label}</p>
        </Link>
    );
}

interface SectionCardProps {
    title: string;
    actionLabel: string;
    actionTo: string;
    children: React.ReactNode;
    className?: string;
}

function SectionCard({ title, actionLabel, actionTo, children, className = '' }: SectionCardProps) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className={`rounded-2xl border p-6 backdrop-blur-xl shadow-sm flex flex-col ${className}`}
            style={{ backgroundColor: `${themeConfig.surface}85`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>{title}</h3>
                <Link to={actionTo} className="text-sm font-bold" style={{ color: themeConfig.primary }}>
                    {actionLabel}
                </Link>
            </div>
            {children}
        </div>
    );
}

function EmptyHint({ icon, text, to, cta }: { icon: string; text: string; to: string; cta: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <Link
            to={to}
            className="flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all hover:border-opacity-80"
            style={{ borderColor: themeConfig.border }}
        >
            <span className="material-symbols-outlined text-3xl mb-2" style={{ color: themeConfig.textSecondary }}>{icon}</span>
            <p className="text-sm font-semibold" style={{ color: themeConfig.text }}>{text}</p>
            <p className="text-xs mt-1 font-bold" style={{ color: themeConfig.primary }}>{cta}</p>
        </Link>
    );
}

function ChecklistItem({ done, label, to }: { done: boolean; label: string; to: string }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <Link to={to} className="flex items-center gap-3 py-2 group">
            <span
                className="size-6 rounded-full flex items-center justify-center shrink-0 border-2"
                style={{
                    backgroundColor: done ? '#16a34a' : 'transparent',
                    borderColor: done ? '#16a34a' : themeConfig.border,
                }}
            >
                {done && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
            </span>
            <span
                className={`text-sm font-semibold ${done ? 'line-through opacity-60' : 'group-hover:underline'}`}
                style={{ color: themeConfig.text }}
            >
                {label}
            </span>
            {!done && (
                <span className="material-symbols-outlined text-[16px] ml-auto" style={{ color: themeConfig.primary }}>arrow_forward</span>
            )}
        </Link>
    );
}

export default function VendorDashboardPage() {
    const { config: themeConfig } = useShopTheme();
    const [storeName, setStoreName] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<VendorOrder[]>([]);
    const [conversations, setConversations] = useState<InboxConversation[]>([]);
    const [connectedPage, setConnectedPage] = useState<ConnectedPage | null>(null);
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [loading, setLoading] = useState(true);

    const primaryColor = themeConfig.primary;
    const accentColor = themeConfig.accent;

    useEffect(() => {
        const now = new Date();
        const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
        const to = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
        Promise.allSettled([
            vendorApi.getVendorProfile(),
            vendorApi.getProducts(),
            listVendorOrders(),
            listConversations(),
            listConnectedPages(),
            listPosts(from, to),
        ]).then(([profile, productsRes, ordersRes, convosRes, pagesRes, postsRes]) => {
            if (profile.status === 'fulfilled') setStoreName(profile.value.store_name || 'Vibe Shop');
            if (productsRes.status === 'fulfilled') {
                const data: any = productsRes.value;
                setProducts(Array.isArray(data) ? data : data?.results ?? []);
            }
            if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
            if (convosRes.status === 'fulfilled') setConversations(convosRes.value);
            if (pagesRes.status === 'fulfilled') {
                setConnectedPage(pagesRes.value.find((p) => p.status === 'connected') ?? null);
            }
            if (postsRes.status === 'fulfilled') setPosts(postsRes.value);
            setLoading(false);
        });
    }, []);

    const liveProducts = products.filter((p) => p.status === 'published');
    const unreadMessages = conversations.reduce((total, convo) => total + (convo.unread_count || 0), 0);
    const revenue = sumRevenue(orders);
    const recentOrders = orders.slice(0, 4);
    const recentProducts = products.slice(0, 3);
    const postedCount = posts.filter((p) => p.status === 'posted').length;
    const upcomingPosts = posts
        .filter((p) => p.status === 'scheduled' && p.scheduled_for && new Date(p.scheduled_for) > new Date())
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
        .slice(0, 3);

    const checklist = [
        { done: Boolean(connectedPage), label: 'Connect your Facebook Page', to: '/vendor/settings/accounts' },
        { done: products.length > 0, label: 'Add your first product', to: '/vendor/products/new' },
        { done: postedCount > 0, label: 'Publish your first social post', to: '/vendor/calendar' },
    ];
    const setupComplete = checklist.every((item) => item.done);

    const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="px-6 md:px-10 py-8 max-w-[1300px] mx-auto w-full">
                    <header className="flex flex-wrap justify-between items-end gap-4 mb-8">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium" style={{ color: themeConfig.textSecondary }}>{getGreeting()}</span>
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Welcome back,{' '}
                                <span
                                    style={{
                                        backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text',
                                    }}
                                >
                                    {storeName || 'Shop'}
                                </span>
                            </h2>
                        </div>
                        <div
                            className="px-4 py-2 rounded-full flex items-center gap-2 shadow-sm text-sm font-medium backdrop-blur-xl border"
                            style={{ backgroundColor: `${themeConfig.surface}80`, borderColor: `${themeConfig.border}60`, color: themeConfig.text }}
                        >
                            <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>calendar_today</span>
                            {currentDate}
                        </div>
                    </header>

                    {loading ? (
                        <div className="flex flex-wrap gap-4 animate-pulse">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="flex-1 min-w-[150px] h-32 rounded-2xl" style={{ backgroundColor: `${themeConfig.border}40` }} />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-4">
                                <StatTile icon="payments" label="Revenue (all orders)" value={`Rs. ${revenue.toLocaleString()}`} to="/vendor/orders" />
                                <StatTile icon="shopping_bag" label="Orders" value={orders.length.toLocaleString()} to="/vendor/orders" />
                                <StatTile icon="sell" label="Live products" value={liveProducts.length.toLocaleString()} to="/vendor/products" />
                                <StatTile icon="chat" label="Unread messages" value={unreadMessages.toLocaleString()} to="/vendor/inbox" />
                            </div>

                            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                {!setupComplete && (
                                    <div
                                        className="lg:col-span-12 rounded-2xl border p-6 backdrop-blur-xl shadow-sm"
                                        style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}25` }}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="material-symbols-outlined" style={{ color: primaryColor }}>rocket_launch</span>
                                            <h3 className="text-lg font-bold" style={{ color: themeConfig.text }}>Finish setting up your store</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
                                            {checklist.map((item) => (
                                                <ChecklistItem key={item.label} done={item.done} label={item.label} to={item.to} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <SectionCard title="Recent orders" actionLabel="View all" actionTo="/vendor/orders" className="lg:col-span-7 min-h-[280px]">
                                    {recentOrders.length === 0 ? (
                                        <EmptyHint icon="shopping_bag" text="No orders yet" to="/vendor/orders" cta="Open Orders" />
                                    ) : (
                                        <div className="flex flex-col divide-y" style={{ borderColor: `${themeConfig.border}60` }}>
                                            {recentOrders.map((order) => {
                                                const palette = ORDER_STATUS_COLORS[order.status] ?? ORDER_STATUS_COLORS.pending_payment;
                                                return (
                                                    <Link key={order.id} to="/vendor/orders" className="flex items-center justify-between gap-3 py-3 group">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold truncate group-hover:underline" style={{ color: themeConfig.text }}>
                                                                #{order.id} · {order.customer_name || 'Online customer'}
                                                            </p>
                                                            <p className="text-xs mt-0.5" style={{ color: themeConfig.textSecondary }}>
                                                                {formatDay(order.created_at)} · {order.items.length} item(s)
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <span className="text-sm font-extrabold" style={{ color: themeConfig.text }}>
                                                                Rs. {parseFloat(order.total_amount).toLocaleString()}
                                                            </span>
                                                            <span
                                                                className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize whitespace-nowrap"
                                                                style={{ backgroundColor: palette.bg, color: palette.fg }}
                                                            >
                                                                {order.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </SectionCard>

                                <SectionCard title="Social connections" actionLabel="Manage" actionTo="/vendor/settings/accounts" className="lg:col-span-5 min-h-[280px]">
                                    {connectedPage ? (
                                        <div className="flex flex-col gap-3">
                                            <div
                                                className="flex items-center gap-3 p-3 rounded-xl border"
                                                style={{ backgroundColor: `${themeConfig.surface}60`, borderColor: `${themeConfig.border}60` }}
                                            >
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white" style={{ background: '#1877F2' }}>FB</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold truncate" style={{ color: themeConfig.text }}>{connectedPage.name}</p>
                                                    <p className="text-xs" style={{ color: themeConfig.textSecondary }}>Facebook Page</p>
                                                </div>
                                                <span className="size-2.5 rounded-full bg-green-500 shrink-0" />
                                            </div>
                                            {connectedPage.instagram_account_id ? (
                                                <div
                                                    className="flex items-center gap-3 p-3 rounded-xl border"
                                                    style={{ backgroundColor: `${themeConfig.surface}60`, borderColor: `${themeConfig.border}60` }}
                                                >
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg, #f09433, #dc2743)' }}>IG</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold truncate" style={{ color: themeConfig.text }}>@{connectedPage.instagram_username || 'instagram'}</p>
                                                        <p className="text-xs" style={{ color: themeConfig.textSecondary }}>Instagram Business</p>
                                                    </div>
                                                    <span className="size-2.5 rounded-full bg-green-500 shrink-0" />
                                                </div>
                                            ) : (
                                                <p className="text-xs px-1" style={{ color: themeConfig.textSecondary }}>
                                                    No Instagram account linked to this Page yet.
                                                </p>
                                            )}
                                            <Link
                                                to="/vendor/calendar"
                                                className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:-translate-y-0.5"
                                                style={{ backgroundColor: primaryColor, boxShadow: `0 8px 20px -8px ${primaryColor}60` }}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">campaign</span>
                                                Schedule a post
                                            </Link>
                                        </div>
                                    ) : (
                                        <EmptyHint icon="link" text="No social accounts connected" to="/vendor/settings/accounts" cta="Connect Facebook & Instagram" />
                                    )}
                                </SectionCard>

                                <SectionCard title="Recent products" actionLabel="View all" actionTo="/vendor/products" className="lg:col-span-7 min-h-[220px]">
                                    {recentProducts.length === 0 ? (
                                        <EmptyHint icon="sell" text="Create your first product" to="/vendor/products/new" cta="New product" />
                                    ) : (
                                        <div className="flex flex-col divide-y" style={{ borderColor: `${themeConfig.border}60` }}>
                                            {recentProducts.map((product) => (
                                                <Link key={product.id} to={`/vendor/products/${product.id}`} className="flex items-center gap-3 py-3 group">
                                                    <div className="size-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: `${themeConfig.border}50` }}>
                                                        {mediaUrl(product.processed_image || product.image) ? (
                                                            <img src={mediaUrl(product.processed_image || product.image) ?? ''} alt={product.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="material-symbols-outlined text-[20px]" style={{ color: themeConfig.textSecondary }}>image</span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold truncate group-hover:underline" style={{ color: themeConfig.text }}>{product.name}</p>
                                                        <p className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                                            Rs. {parseFloat(product.price).toLocaleString()} · {product.stock} in stock
                                                        </p>
                                                    </div>
                                                    {product.status !== 'published' && (
                                                        <span
                                                            className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                                            style={{
                                                                backgroundColor: product.status === 'draft' ? '#fef3c7' : '#f3f4f6',
                                                                color: product.status === 'draft' ? '#b45309' : '#4b5563',
                                                            }}
                                                        >
                                                            {product.status}
                                                        </span>
                                                    )}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </SectionCard>

                                <SectionCard title="Upcoming posts" actionLabel="Open Publishing" actionTo="/vendor/calendar" className="lg:col-span-5 min-h-[220px]">
                                    {upcomingPosts.length === 0 ? (
                                        <EmptyHint icon="calendar_month" text="Nothing scheduled yet" to="/vendor/calendar" cta="Schedule a post" />
                                    ) : (
                                        <div className="flex flex-col divide-y" style={{ borderColor: `${themeConfig.border}60` }}>
                                            {upcomingPosts.map((post) => (
                                                <Link key={post.id} to="/vendor/calendar" className="flex items-center gap-3 py-3 group">
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white shrink-0"
                                                        style={{ background: post.platform === 'instagram' ? 'linear-gradient(135deg, #f09433, #dc2743)' : '#1877F2' }}
                                                    >
                                                        {post.platform === 'instagram' ? 'IG' : 'FB'}
                                                    </span>
                                                    <p className="text-sm truncate flex-1 group-hover:underline" style={{ color: themeConfig.text }}>
                                                        {post.caption || (post.post_format === 'story' ? 'Story' : 'Post')}
                                                    </p>
                                                    <span className="text-xs font-bold shrink-0" style={{ color: themeConfig.textSecondary }}>
                                                        {formatDay(post.scheduled_for)}
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </SectionCard>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
