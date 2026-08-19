import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import { vendorApi, type Product } from '../../api/vendor';
import { createVendorOrder } from '../../api/orders';
import { mediaUrl } from '../../api/media';

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash on delivery' },
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'mobile_payment', label: 'Mobile wallet' },
    { value: 'credit_card', label: 'Card' },
];

const ORDER_STATES = [
    { value: 'completed', label: 'Paid & completed' },
    { value: 'pending_delivery', label: 'Paid — to deliver' },
    { value: 'pending_payment', label: 'Payment pending' },
];

export interface OrderPrefill {
    quantities: Record<number, number>;
    customerName?: string;
}

interface NewOrderModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    prefill?: OrderPrefill | null;
}

export default function NewOrderModal({ open, onClose, onCreated, prefill }: NewOrderModalProps) {
    const { config: themeConfig } = useShopTheme();
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState('');
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [orderStatus, setOrderStatus] = useState('completed');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !prefill) return;
        setQuantities(prefill.quantities);
        if (prefill.customerName) setCustomerName(prefill.customerName);
    }, [open, prefill]);

    useEffect(() => {
        if (!open) return;
        vendorApi.getProducts()
            .then((data: any) => {
                const list: Product[] = Array.isArray(data) ? data : data?.results ?? [];
                setProducts(list.filter((p) => p.status === 'published' && p.stock > 0));
            })
            .catch(() => toast.error('Could not load products'));
    }, [open]);

    const visibleProducts = useMemo(
        () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
        [products, search],
    );

    const selected = products.filter((p) => (quantities[p.id] || 0) > 0);
    const total = selected.reduce((sum, p) => sum + parseFloat(p.price) * (quantities[p.id] || 0), 0);

    const setQty = (product: Product, next: number) => {
        const clamped = Math.max(0, Math.min(product.stock, next));
        setQuantities((prev) => ({ ...prev, [product.id]: clamped }));
    };

    const resetForm = () => {
        setQuantities({});
        setCustomerName('');
        setCustomerPhone('');
        setPaymentMethod('cash');
        setOrderStatus('completed');
        setSearch('');
    };

    const handleCreate = async () => {
        if (selected.length === 0) {
            toast.error('Add at least one product');
            return;
        }
        if (!customerName.trim()) {
            toast.error('Customer name is required');
            return;
        }
        setSaving(true);
        try {
            const result = await createVendorOrder({
                items: selected.map((p) => ({ product_id: p.id, quantity: quantities[p.id] })),
                customer_name: customerName.trim(),
                customer_phone: customerPhone.trim(),
                payment_method: paymentMethod,
                status: orderStatus,
            });
            toast.success(`Order #${result.order_id} created`);
            resetForm();
            onCreated();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not create the order');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const fieldStyle = { backgroundColor: `${themeConfig.surface}80`, color: themeConfig.text };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div
                className="relative w-full max-w-2xl max-h-[90vh] rounded-[28px] shadow-2xl border overflow-hidden flex flex-col animate-pop-in"
                role="dialog"
                aria-modal="true"
                aria-label="New order"
                style={{ backgroundColor: themeConfig.cardBg, borderColor: `${themeConfig.border}50` }}
            >
                <div className="flex items-center justify-between px-6 pt-6 pb-4">
                    <h3 className="text-xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>New order</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="size-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: themeConfig.surface, color: themeConfig.textSecondary }}
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-5">
                    <div>
                        <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Products</label>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search products…"
                            className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm mb-3"
                            style={fieldStyle}
                        />
                        <div className="max-h-56 overflow-y-auto rounded-xl border divide-y" style={{ borderColor: `${themeConfig.border}60` }}>
                            {visibleProducts.map((product) => {
                                const qty = quantities[product.id] || 0;
                                return (
                                    <div key={product.id} className="flex items-center gap-3 p-3">
                                        <div className="size-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: `${themeConfig.border}50` }}>
                                            {mediaUrl(product.processed_image || product.image) ? (
                                                <img src={mediaUrl(product.processed_image || product.image) ?? ''} alt={product.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>image</span>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold truncate" style={{ color: themeConfig.text }}>{product.name}</p>
                                            <p className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                                Rs. {parseFloat(product.price).toLocaleString()} · {product.stock} in stock
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => setQty(product, qty - 1)}
                                                disabled={qty === 0}
                                                aria-label={`Fewer ${product.name}`}
                                                className="size-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30"
                                                style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                            >
                                                −
                                            </button>
                                            <span className="w-6 text-center text-sm font-bold tabular-nums" style={{ color: themeConfig.text }}>{qty}</span>
                                            <button
                                                onClick={() => setQty(product, qty + 1)}
                                                disabled={qty >= product.stock}
                                                aria-label={`More ${product.name}`}
                                                className="size-7 rounded-lg flex items-center justify-center font-bold disabled:opacity-30"
                                                style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {visibleProducts.length === 0 && (
                                <p className="p-4 text-sm text-center" style={{ color: themeConfig.textSecondary }}>
                                    No products in stock match your search.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Customer name</label>
                            <input
                                type="text"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="e.g. Sita Sharma"
                                className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm"
                                style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Phone (optional)</label>
                            <input
                                type="tel"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                placeholder="98XXXXXXXX"
                                className="w-full border-transparent rounded-xl text-sm py-2.5 px-4 shadow-sm"
                                style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Payment method</label>
                            <select
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent"
                                style={fieldStyle}
                            >
                                {PAYMENT_METHODS.map((method) => (
                                    <option key={method.value} value={method.value}>{method.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2" style={{ color: themeConfig.text }}>Order state</label>
                            <select
                                value={orderStatus}
                                onChange={(e) => setOrderStatus(e.target.value)}
                                className="w-full rounded-xl text-sm py-2.5 px-3 shadow-sm border-transparent"
                                style={fieldStyle}
                            >
                                {ORDER_STATES.map((state) => (
                                    <option key={state.value} value={state.value}>{state.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div
                    className="px-6 py-4 border-t flex items-center justify-between gap-4"
                    style={{ borderColor: `${themeConfig.border}60`, backgroundColor: `${themeConfig.surface}60` }}
                >
                    <div>
                        <p className="text-xs font-medium" style={{ color: themeConfig.textSecondary }}>
                            {selected.length} product(s)
                        </p>
                        <p className="text-lg font-extrabold" style={{ color: themeConfig.text }}>
                            Rs. {total.toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={handleCreate}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                        style={{ backgroundColor: themeConfig.primary, boxShadow: `0 10px 24px -8px ${themeConfig.primary}70` }}
                    >
                        <span className="material-symbols-outlined text-[20px]">{saving ? 'hourglass_empty' : 'add_shopping_cart'}</span>
                        {saving ? 'Creating…' : 'Create order'}
                    </button>
                </div>
            </div>
        </div>
    );
}
