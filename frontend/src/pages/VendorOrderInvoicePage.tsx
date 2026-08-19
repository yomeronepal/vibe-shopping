import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getVendorOrder, sendOrderInvoice, type VendorOrder } from '../api/orders';
import { listConversations, type InboxConversation } from '../api/inbox';
import { vendorApi } from '../api/vendor';
import { mediaUrl } from '../api/media';

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash on delivery',
    bank_transfer: 'Bank transfer',
    mobile_payment: 'Mobile wallet',
    credit_card: 'Card',
    debit_card: 'Card',
};

const STATUS_LABELS: Record<string, string> = {
    pending_payment: 'Payment pending',
    pending_delivery: 'Pending delivery',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Paid',
    cancelled: 'Cancelled',
    disputed: 'Disputed',
};

interface ConversationPickerProps {
    open: boolean;
    sending: boolean;
    onPick: (conversation: InboxConversation) => void;
    onClose: () => void;
}

function ConversationPicker({ open, sending, onPick, onClose }: ConversationPickerProps) {
    const [conversations, setConversations] = useState<InboxConversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        listConversations()
            .then(setConversations)
            .catch(() => toast.error('Could not load conversations'))
            .finally(() => setLoading(false));
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 print:hidden">
            <div className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div
                className="relative w-full max-w-md max-h-[80vh] rounded-[28px] bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col animate-pop-in"
                role="dialog"
                aria-modal="true"
                aria-label="Send invoice via Messenger"
            >
                <div className="flex items-center justify-between px-6 pt-6 pb-3">
                    <h3 className="text-lg font-extrabold text-gray-900">Send invoice to…</h3>
                    <button onClick={onClose} aria-label="Close" className="size-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <p className="px-6 text-xs text-gray-500">
                    Pick the customer's conversation. Meta only allows replies within 24 hours of their last message.
                </p>
                <div className="flex-1 overflow-y-auto mt-3 divide-y divide-gray-100">
                    {loading && <p className="p-5 text-sm text-gray-500">Loading conversations…</p>}
                    {!loading && conversations.length === 0 && (
                        <p className="p-5 text-sm text-gray-500">No conversations yet — invoices can only be sent to customers who have messaged you.</p>
                    )}
                    {conversations.map((convo) => (
                        <button
                            key={convo.id}
                            disabled={sending}
                            onClick={() => onPick(convo)}
                            className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
                        >
                            <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-extrabold text-white shrink-0"
                                style={{ background: convo.platform === 'instagram' ? 'linear-gradient(135deg, #f09433, #dc2743)' : '#1877F2' }}
                            >
                                {convo.platform === 'instagram' ? 'IG' : 'FB'}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-gray-900 truncate">{convo.customer.name || 'Customer'}</span>
                                <span className="block text-xs text-gray-500 truncate">{convo.last_message_preview}</span>
                            </span>
                            <span className="material-symbols-outlined text-gray-400 text-[18px]">send</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function VendorOrderInvoicePage() {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<VendorOrder | null>(null);
    const [storeName, setStoreName] = useState('');
    const [storeLogo, setStoreLogo] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!id) return;
        Promise.allSettled([getVendorOrder(id), vendorApi.getVendorProfile()])
            .then(([orderRes, profileRes]) => {
                if (orderRes.status === 'fulfilled') setOrder(orderRes.value);
                if (profileRes.status === 'fulfilled') {
                    setStoreName(profileRes.value.store_name || 'Vibe Shop');
                    setStoreLogo(mediaUrl(profileRes.value.logo));
                }
            })
            .finally(() => setLoading(false));
    }, [id]);

    const handleSend = async (conversation: InboxConversation) => {
        if (!order) return;
        setSending(true);
        try {
            await sendOrderInvoice(order.id, conversation.id);
            toast.success(`Invoice sent to ${conversation.customer.name || 'the customer'}`);
            setPickerOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not send the invoice');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-white flex items-center justify-center text-gray-500 text-sm">Loading invoice…</div>;
    }
    if (!order) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 text-gray-600">
                <p className="font-semibold">Order not found.</p>
                <Link to="/vendor/orders" className="text-sm font-bold text-violet-600">← Back to orders</Link>
            </div>
        );
    }

    const subtotal = order.items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

    return (
        <div className="min-h-screen bg-gray-100 print:bg-white py-8 print:py-0 px-4">
            <div className="max-w-2xl mx-auto mb-5 flex items-center justify-between print:hidden">
                <Link to="/vendor/orders" className="text-sm font-bold text-violet-600">← Back to orders</Link>
                <div className="flex gap-3">
                    <button
                        onClick={() => setPickerOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-md"
                        style={{ background: '#1877F2' }}
                    >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        Send via Messenger
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gray-900 shadow-md"
                    >
                        <span className="material-symbols-outlined text-[18px]">print</span>
                        Print / Save PDF
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto bg-white rounded-2xl print:rounded-none shadow-lg print:shadow-none border border-gray-200 print:border-0 p-8 md:p-10">
                <div className="flex items-start justify-between gap-4 pb-6 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        {storeLogo && <img src={storeLogo} alt={storeName} className="size-12 rounded-xl object-cover" />}
                        <div>
                            <h1 className="text-xl font-extrabold text-gray-900">{storeName}</h1>
                            <p className="text-xs text-gray-500">Sales invoice</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-extrabold text-gray-900">#{order.id}</p>
                        <p className="text-xs text-gray-500">
                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 py-6 border-b border-gray-200">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Billed to</p>
                        <p className="text-sm font-bold text-gray-900">{order.customer_name || 'Online customer'}</p>
                        {order.customer_phone && <p className="text-sm text-gray-600">{order.customer_phone}</p>}
                        {order.customer_email && <p className="text-sm text-gray-600">{order.customer_email}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Payment</p>
                        <p className="text-sm font-bold text-gray-900">{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
                        <p className="text-sm text-gray-600">{STATUS_LABELS[order.status] ?? order.status}</p>
                    </div>
                </div>

                <table className="w-full mt-6">
                    <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-200">
                            <th className="text-left pb-2">Item</th>
                            <th className="text-center pb-2 w-16">Qty</th>
                            <th className="text-right pb-2 w-28">Price</th>
                            <th className="text-right pb-2 w-28">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {order.items.map((item, index) => (
                            <tr key={index}>
                                <td className="py-3 text-sm font-semibold text-gray-900">{item.product_name}</td>
                                <td className="py-3 text-sm text-gray-600 text-center">{item.quantity}</td>
                                <td className="py-3 text-sm text-gray-600 text-right">Rs. {parseFloat(item.price).toLocaleString()}</td>
                                <td className="py-3 text-sm font-bold text-gray-900 text-right">
                                    Rs. {(parseFloat(item.price) * item.quantity).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                        {order.items.length === 0 && (
                            <tr>
                                <td colSpan={4} className="py-4 text-sm text-gray-500 text-center">No line items recorded for this order.</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <div className="mt-6 flex justify-end">
                    <div className="w-56">
                        {order.items.length > 0 && subtotal !== parseFloat(order.total_amount) && (
                            <div className="flex justify-between text-sm text-gray-600 py-1">
                                <span>Subtotal</span>
                                <span>Rs. {subtotal.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center py-2 border-t-2 border-gray-900">
                            <span className="text-sm font-bold text-gray-900">Total</span>
                            <span className="text-xl font-extrabold text-gray-900">
                                Rs. {parseFloat(order.total_amount).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                <p className="mt-10 text-center text-xs text-gray-400">
                    Thank you for shopping with {storeName}!
                </p>
            </div>

            <ConversationPicker
                open={pickerOpen}
                sending={sending}
                onPick={handleSend}
                onClose={() => setPickerOpen(false)}
            />
        </div>
    );
}
