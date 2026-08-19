import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useShopTheme } from '../../contexts/ShopThemeContext';
import { getCustomerCard, updateCustomerCard, type CustomerCard } from '../../api/inbox';

export default function CustomerPanel({ customerId, onClose }: { customerId: number; onClose: () => void }) {
    const { config: themeConfig } = useShopTheme();
    const [card, setCard] = useState<CustomerCard | null>(null);
    const [saving, setSaving] = useState(false);
    const [tagDraft, setTagDraft] = useState('');

    useEffect(() => {
        getCustomerCard(customerId).then(setCard).catch(() => toast.error('Could not load customer profile'));
    }, [customerId]);

    const save = async () => {
        if (!card) return;
        setSaving(true);
        try {
            setCard(await updateCustomerCard(card.id, {
                name: card.name, phone: card.phone, email: card.email,
                location: card.location, notes: card.notes, tags: card.tags,
            }));
            toast.success('Customer profile saved');
        } catch {
            toast.error('Could not save the customer profile');
        } finally {
            setSaving(false);
        }
    };

    const set = (field: keyof CustomerCard, value: string) => {
        setCard((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

    const fieldStyle = {
        backgroundColor: `${themeConfig.background}`,
        border: `1px solid ${themeConfig.border}`,
        color: themeConfig.text,
    };

    return (
        <div className="fixed inset-0 z-[150] flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div
                className="relative w-full max-w-sm h-full overflow-y-auto p-5 shadow-2xl animate-pop-in"
                style={{ backgroundColor: themeConfig.surface }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-extrabold" style={{ color: themeConfig.text }}>Customer profile</h3>
                    <button onClick={onClose} aria-label="Close customer panel" className="material-symbols-outlined" style={{ color: themeConfig.textSecondary }}>close</button>
                </div>
                {!card ? (
                    <p className="text-sm" style={{ color: themeConfig.textSecondary }}>Loading…</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            {card.profile_pic_url ? (
                                <img src={card.profile_pic_url} alt="" className="size-12 rounded-full object-cover" />
                            ) : (
                                <div className="size-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: themeConfig.primary }}>
                                    {(card.name || '?').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0">
                                <input
                                    value={card.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    className="font-bold text-base bg-transparent border-none focus:ring-0 focus:outline-none w-full"
                                    style={{ color: themeConfig.text }}
                                />
                                <span
                                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                                    style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                >
                                    {card.status}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="rounded-xl p-3" style={{ backgroundColor: `${themeConfig.border}30` }}>
                                <p className="text-lg font-extrabold" style={{ color: themeConfig.text }}>Rs. {card.total_spent.toLocaleString()}</p>
                                <p className="text-[10px] font-semibold uppercase" style={{ color: themeConfig.textSecondary }}>Total spent</p>
                            </div>
                            <div className="rounded-xl p-3" style={{ backgroundColor: `${themeConfig.border}30` }}>
                                <p className="text-lg font-extrabold" style={{ color: themeConfig.text }}>{card.order_count}</p>
                                <p className="text-[10px] font-semibold uppercase" style={{ color: themeConfig.textSecondary }}>Orders</p>
                            </div>
                        </div>
                        <div className="text-xs space-y-1" style={{ color: themeConfig.textSecondary }}>
                            {card.last_purchase_at && (
                                <p>Last purchase: {new Date(card.last_purchase_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            )}
                            {card.last_active_at && (
                                <p>Last active: {new Date(card.last_active_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            )}
                        </div>
                        {card.product_interests.length > 0 && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: themeConfig.textSecondary }}>Interested in</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {card.product_interests.map((name) => (
                                        <span key={name} className="px-2 py-0.5 rounded-lg text-[11px] font-semibold" style={{ backgroundColor: `${themeConfig.primary}10`, color: themeConfig.primary }}>
                                            {name.slice(0, 28)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(['phone', 'email', 'location'] as const).map((field) => (
                            <div key={field}>
                                <label className="block text-xs font-bold capitalize mb-1" style={{ color: themeConfig.textSecondary }}>{field}</label>
                                <input
                                    value={card[field]}
                                    onChange={(e) => set(field, e.target.value)}
                                    placeholder={field === 'phone' ? '98XXXXXXXX' : field === 'email' ? 'name@example.com' : 'City / area'}
                                    className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    style={fieldStyle}
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-xs font-bold mb-1" style={{ color: themeConfig.textSecondary }}>Tags</label>
                            <div className="flex flex-wrap gap-1.5 items-center rounded-xl px-3 py-2" style={fieldStyle}>
                                {card.tags.map((tag) => (
                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}>
                                        {tag}
                                        <button
                                            onClick={() => setCard((prev) => prev ? { ...prev, tags: prev.tags.filter((t) => t !== tag) } : prev)}
                                            className="material-symbols-outlined text-[12px]"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            close
                                        </button>
                                    </span>
                                ))}
                                <input
                                    value={tagDraft}
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && tagDraft.trim()) {
                                            e.preventDefault();
                                            setCard((prev) => prev ? { ...prev, tags: [...prev.tags, tagDraft.trim()] } : prev);
                                            setTagDraft('');
                                        }
                                    }}
                                    placeholder="Add tag…"
                                    className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs min-w-[60px] flex-1"
                                    style={{ color: themeConfig.text }}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold mb-1" style={{ color: themeConfig.textSecondary }}>Notes</label>
                            <textarea
                                value={card.notes}
                                onChange={(e) => set('notes', e.target.value)}
                                placeholder="Preferences, sizes, delivery instructions…"
                                className="w-full min-h-[90px] rounded-xl px-3 py-2 text-sm resize-none focus:outline-none"
                                style={fieldStyle}
                            />
                        </div>
                        {card.recent_orders.length > 0 && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: themeConfig.textSecondary }}>Orders</p>
                                <div className="rounded-xl border divide-y" style={{ borderColor: themeConfig.border }}>
                                    {card.recent_orders.map((order) => (
                                        <Link
                                            key={order.id}
                                            to={`/vendor/orders?q=${order.id}`}
                                            className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:opacity-80"
                                        >
                                            <span className="min-w-0">
                                                <span className="font-bold" style={{ color: themeConfig.text }}>#{order.id}</span>
                                                <span className="ml-1.5 truncate" style={{ color: themeConfig.textSecondary }}>{order.summary}</span>
                                            </span>
                                            <span className="shrink-0 font-bold" style={{ color: themeConfig.text }}>
                                                Rs. {parseFloat(order.total_amount).toLocaleString()}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={save}
                            disabled={saving}
                            className="w-full py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
                            style={{ backgroundColor: themeConfig.primary }}
                        >
                            {saving ? 'Saving…' : 'Save profile'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

