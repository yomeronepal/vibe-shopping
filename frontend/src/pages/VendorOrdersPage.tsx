import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import NewOrderModal from '../components/vendor/NewOrderModal';
import {
    listVendorOrders,
    updateVendorOrderStatus,
    ORDER_STATUSES,
    type VendorOrder,
} from '../api/orders';

const STATUS_LABELS: Record<string, string> = {
    pending_payment: 'Pending payment',
    pending_delivery: 'Pending delivery',
    preparing: 'Preparing',
    returned: 'Returned',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
    disputed: 'Disputed',
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
    pending_payment: { bg: '#fef3c7', fg: '#b45309' },
    pending_delivery: { bg: '#dbeafe', fg: '#1d4ed8' },
    preparing: { bg: '#fef9c3', fg: '#a16207' },
    returned: { bg: '#ffedd5', fg: '#c2410c' },
    shipped: { bg: '#e0e7ff', fg: '#4338ca' },
    delivered: { bg: '#dcfce7', fg: '#15803d' },
    completed: { bg: '#dcfce7', fg: '#166534' },
    cancelled: { bg: '#f3f4f6', fg: '#4b5563' },
    disputed: { bg: '#fee2e2', fg: '#b91c1c' },
};

function StatusPill({ status }: { status: string }) {
    const palette = STATUS_COLORS[status] ?? STATUS_COLORS.pending_payment;
    return (
        <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: palette.bg, color: palette.fg }}
        >
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function OrderCard({ order, onStatusChange }: { order: VendorOrder; onStatusChange: (status: string) => void }) {
    const { config: themeConfig } = useShopTheme();
    return (
        <div
            className="rounded-2xl border p-5 backdrop-blur-xl shadow-sm"
            style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="font-bold" style={{ color: themeConfig.text }}>Order #{order.id}</span>
                        <StatusPill status={order.status} />
                        {order.metadata?.source === 'chat_bot' && (
                            <span
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}
                            >
                                <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                                Chat bot
                            </span>
                        )}
                    </div>
                    <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                        {order.customer_name || 'Online customer'}
                        {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                        {' · '}
                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {order.metadata?.collected && Object.keys(order.metadata.collected).length > 0 && (
                        <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                            {Object.entries(order.metadata.collected as Record<string, string>)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(' · ')}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-extrabold text-lg" style={{ color: themeConfig.text }}>
                        Rs. {order.total_amount}
                    </span>
                    <Link
                        to={`/vendor/orders/${order.id}/invoice`}
                        title="Invoice"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all hover:shadow-sm"
                        style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.primary }}
                    >
                        <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                        Invoice
                    </Link>
                    <select
                        value={order.status}
                        onChange={(e) => onStatusChange(e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                        style={{
                            backgroundColor: themeConfig.surface,
                            border: `1px solid ${themeConfig.border}`,
                            color: themeConfig.text,
                        }}
                    >
                        {ORDER_STATUSES.map((value) => (
                            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                        ))}
                    </select>
                </div>
            </div>
            {order.items.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1" style={{ borderColor: `${themeConfig.border}50` }}>
                    {order.items.map((item, index) => (
                        <p key={index} className="text-sm" style={{ color: themeConfig.textSecondary }}>
                            {item.quantity} × {item.product_name}
                            {(item.size || item.color) && (
                                <span className="font-semibold"> ({[item.size, item.color].filter(Boolean).join(', ')})</span>
                            )}
                            {' — Rs. '}{item.price}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function VendorOrdersPage() {
    const { config: themeConfig } = useShopTheme();
    const [searchParams] = useSearchParams();
    const [orders, setOrders] = useState<VendorOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState(searchParams.get('q') ?? '');
    const [statusFilter, setStatusFilter] = useState('all');

    const loadOrders = (q = search, status = statusFilter) => {
        listVendorOrders(q, status)
            .then(setOrders)
            .catch(() => toast.error('Could not load orders. Refresh to retry.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const handle = window.setTimeout(() => loadOrders(), search ? 350 : 0);
        return () => window.clearTimeout(handle);
    }, [search, statusFilter]);

    const handleStatusChange = async (order: VendorOrder, status: string) => {
        try {
            const updated = await updateVendorOrderStatus(order.id, status);
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            toast.success(
                updated.customer_notified
                    ? `Order #${order.id} marked ${STATUS_LABELS[status] ?? status} — customer notified on Messenger`
                    : `Order #${order.id} marked ${STATUS_LABELS[status] ?? status}`
            );
        } catch {
            toast.error('Could not update the order status');
        }
    };

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                Orders
                            </h1>
                            <p className="mt-1" style={{ color: themeConfig.textSecondary }}>
                                Track and update every order placed with your store.
                            </p>
                        </div>
                        <button
                            onClick={() => setCreating(true)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all hover:-translate-y-0.5"
                            style={{ backgroundColor: themeConfig.primary, boxShadow: `0 10px 24px -8px ${themeConfig.primary}70` }}
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            New order
                        </button>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <div
                            className="flex items-center gap-2 rounded-xl px-3 py-2 flex-1 min-w-[220px] border"
                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border }}
                        >
                            <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>search</span>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search order #, customer, phone, or product…"
                                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm"
                                style={{ color: themeConfig.text }}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    aria-label="Clear order search"
                                    className="material-symbols-outlined text-[16px]"
                                    style={{ color: themeConfig.textSecondary }}
                                >
                                    close
                                </button>
                            )}
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
                            style={{ backgroundColor: themeConfig.surface, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                        >
                            <option value="all">All statuses</option>
                            {ORDER_STATUSES.map((value) => (
                                <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="mt-6 space-y-4">
                        {orders.map((order) => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                onStatusChange={(status) => handleStatusChange(order, status)}
                            />
                        ))}
                        {!loading && orders.length === 0 && (
                            <div
                                className="rounded-2xl border border-dashed p-10 text-center"
                                style={{ borderColor: themeConfig.border }}
                            >
                                <span className="material-symbols-outlined text-4xl" style={{ color: themeConfig.textSecondary }}>shopping_bag</span>
                                <p className="mt-2 font-semibold" style={{ color: themeConfig.text }}>No orders yet</p>
                                <p className="text-sm mt-1" style={{ color: themeConfig.textSecondary }}>
                                    Orders from your store and social channels will appear here.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <NewOrderModal
                open={creating}
                onClose={() => setCreating(false)}
                onCreated={() => {
                    setCreating(false);
                    loadOrders();
                }}
            />
        </VendorShell>
    );
}
