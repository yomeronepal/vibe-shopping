import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { mediaUrl } from '../api/media';
import {
    getVendorOrder,
    updateVendorOrderStatus,
    ORDER_STATUSES,
    STATUS_LABELS,
    type VendorOrder,
} from '../api/orders';

export default function VendorOrderDetailPage() {
    const { id } = useParams();
    const { config: themeConfig } = useShopTheme();
    const [order, setOrder] = useState<VendorOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [packed, setPacked] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!id) return;
        getVendorOrder(Number(id))
            .then(setOrder)
            .catch(() => toast.error('Could not load the order.'))
            .finally(() => setLoading(false));
    }, [id]);

    const togglePacked = (index: number) => {
        setPacked((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const handleStatusChange = async (status: string) => {
        if (!order) return;
        try {
            const updated = await updateVendorOrderStatus(order.id, status);
            setOrder(updated);
            toast.success(
                updated.customer_notified
                    ? `Marked ${STATUS_LABELS[status] ?? status} — customer notified`
                    : `Marked ${STATUS_LABELS[status] ?? status}`
            );
        } catch {
            toast.error('Could not update the status.');
        }
    };

    const totalUnits = order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    const allPacked = order ? packed.size === order.items.length && order.items.length > 0 : false;
    const collected = (order?.metadata?.collected ?? {}) as Record<string, string>;

    return (
        <VendorShell>
            <div className="overflow-y-auto h-full">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-6 pb-24 md:pb-8">
                    <Link
                        to="/vendor/orders"
                        className="inline-flex items-center gap-1 text-sm font-semibold mb-4"
                        style={{ color: themeConfig.textSecondary }}
                    >
                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                        All orders
                    </Link>

                    {loading && (
                        <div className="h-40 rounded-2xl animate-pulse" style={{ backgroundColor: `${themeConfig.border}40` }} />
                    )}

                    {!loading && !order && (
                        <p className="font-semibold" style={{ color: themeConfig.text }}>Order not found.</p>
                    )}

                    {order && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                                        Order #{order.id}
                                    </h1>
                                    <p className="text-sm mt-0.5" style={{ color: themeConfig.textSecondary }}>
                                        {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        {order.metadata?.source === 'chat_bot' && ' · placed by the AI in chat'}
                                    </p>
                                </div>
                                <select
                                    value={order.status}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className="rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none"
                                    style={{ backgroundColor: themeConfig.surface, border: `1px solid ${themeConfig.border}`, color: themeConfig.text }}
                                >
                                    {ORDER_STATUSES.map((value) => (
                                        <option key={value} value={value}>{STATUS_LABELS[value]}</option>
                                    ))}
                                </select>
                            </div>

                            <div
                                className="mt-4 rounded-2xl border p-4"
                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                            >
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <p className="font-bold" style={{ color: themeConfig.text }}>
                                            {order.customer_name || 'Online customer'}
                                        </p>
                                        {Object.entries(collected).map(([key, value]) => (
                                            <p key={key} className="text-sm" style={{ color: themeConfig.textSecondary }}>
                                                <span className="font-semibold">{key}:</span> {value}
                                            </p>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {order.customer_phone && (
                                            <a
                                                href={`tel:${order.customer_phone}`}
                                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-white"
                                                style={{ backgroundColor: '#16a34a' }}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">call</span>
                                                Call
                                            </a>
                                        )}
                                        <Link
                                            to={`/vendor/orders/${order.id}/invoice`}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold border"
                                            style={{ backgroundColor: themeConfig.surface, borderColor: themeConfig.border, color: themeConfig.primary }}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                            Invoice
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between">
                                <h2 className="text-lg font-bold" style={{ color: themeConfig.text }}>
                                    Packing list — {totalUnits} unit{totalUnits === 1 ? '' : 's'}
                                </h2>
                                <span className="text-sm font-bold" style={{ color: allPacked ? '#16a34a' : themeConfig.textSecondary }}>
                                    {packed.size}/{order.items.length} packed
                                </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full" style={{ backgroundColor: `${themeConfig.border}50` }}>
                                <div
                                    className="h-1.5 rounded-full transition-all"
                                    style={{
                                        width: `${order.items.length ? (packed.size / order.items.length) * 100 : 0}%`,
                                        backgroundColor: allPacked ? '#16a34a' : themeConfig.primary,
                                    }}
                                />
                            </div>

                            <div className="mt-4 space-y-3">
                                {order.items.map((item, index) => {
                                    const isPacked = packed.has(index);
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => togglePacked(index)}
                                            className="w-full text-left rounded-2xl border p-4 flex items-center gap-4 transition-all"
                                            style={{
                                                backgroundColor: isPacked ? '#f0fdf4' : `${themeConfig.surface}90`,
                                                borderColor: isPacked ? '#86efac' : `${themeConfig.border}60`,
                                                opacity: isPacked ? 0.85 : 1,
                                            }}
                                        >
                                            {item.image ? (
                                                <img
                                                    src={mediaUrl(item.image) ?? undefined}
                                                    alt=""
                                                    className="size-20 rounded-xl object-cover shrink-0 border"
                                                    style={{ borderColor: `${themeConfig.border}60` }}
                                                />
                                            ) : (
                                                <div
                                                    className="size-20 rounded-xl flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: `${themeConfig.border}40` }}
                                                >
                                                    <span className="material-symbols-outlined text-[28px]" style={{ color: themeConfig.textSecondary }}>inventory_2</span>
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold leading-snug" style={{ color: themeConfig.text }}>
                                                    {item.product_name}
                                                </p>
                                                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                    {item.sku && (
                                                        <span
                                                            className="px-2 py-1 rounded-lg text-xs font-bold font-mono"
                                                            style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                                        >
                                                            {item.sku}
                                                        </span>
                                                    )}
                                                    {(item.size || item.color) && (
                                                        <span className="text-sm font-bold" style={{ color: themeConfig.text }}>
                                                            {[item.size, item.color].filter(Boolean).join(' · ')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                                                    Rs. {item.price} each
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-center gap-1 shrink-0">
                                                <span className="text-2xl font-extrabold" style={{ color: themeConfig.text }}>
                                                    ×{item.quantity}
                                                </span>
                                                <span
                                                    className="material-symbols-outlined text-[26px]"
                                                    style={{ color: isPacked ? '#16a34a' : themeConfig.border }}
                                                >
                                                    {isPacked ? 'check_circle' : 'radio_button_unchecked'}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div
                                className="mt-6 rounded-2xl border p-4 flex items-center justify-between"
                                style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                            >
                                <span className="font-bold" style={{ color: themeConfig.text }}>Total</span>
                                <span className="text-xl font-extrabold" style={{ color: themeConfig.text }}>
                                    Rs. {order.total_amount}
                                </span>
                            </div>

                            {allPacked && !['shipped', 'delivered', 'completed', 'cancelled'].includes(order.status) && (
                                <button
                                    onClick={() => handleStatusChange('shipped')}
                                    className="mt-4 w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2"
                                    style={{ backgroundColor: '#16a34a' }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">local_shipping</span>
                                    All packed — mark as shipped
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </VendorShell>
    );
}
