import { useEffect, useRef, useState } from 'react';
import { useShopTheme } from '../contexts/ShopThemeContext';
import VendorShell from '../components/vendor/VendorShell';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    fetchConversations,
    fetchMessages,
    markConversationRead,
    sendReply,
    setActiveConversation,
    setConversationStatus,
    setStatusFilter,
} from '@/features/inbox/inboxSlice';
import { useInboxSocket } from '@/features/inbox/useInboxSocket';
import { extractOrder, setConversationAiPaused, setConversationTags, suggestReply, type InboxConversation, type InboxMessage } from '@/api/inbox';
import { getStoreProfile } from '@/api/vendor';
import NewOrderModal, { type OrderPrefill } from '../components/vendor/NewOrderModal';
import toast from 'react-hot-toast';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'waiting_business', label: 'Needs reply' },
    { key: 'open', label: 'Open' },
    { key: 'waiting_customer', label: 'Waiting' },
    { key: 'resolved', label: 'Resolved' },
];

function relativeTime(iso: string | null): string {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function displayName(conversation: InboxConversation): string {
    return conversation.customer.name || conversation.customer.platform_user_id;
}

function PlatformBadge({ platform }: { platform: InboxConversation['platform'] }) {
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

function CustomerAvatar({ conversation, size }: { conversation: InboxConversation; size: number }) {
    const { config: themeConfig } = useShopTheme();
    const name = displayName(conversation);
    if (conversation.customer.profile_pic_url) {
        return (
            <img
                src={conversation.customer.profile_pic_url}
                alt=""
                className="rounded-full object-cover shrink-0"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <div
            className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
            style={{ width: size, height: size, backgroundColor: themeConfig.primary, fontSize: size / 2.4 }}
        >
            {name.charAt(0).toUpperCase()}
        </div>
    );
}

function ConversationRow({
    conversation,
    active,
    onSelect,
}: {
    conversation: InboxConversation;
    active: boolean;
    onSelect: () => void;
}) {
    const { config: themeConfig } = useShopTheme();
    return (
        <button
            onClick={onSelect}
            className="w-full text-left px-4 py-3 transition-colors"
            style={{
                backgroundColor: active ? `${themeConfig.primary}12` : 'transparent',
                borderBottom: `1px solid ${themeConfig.border}50`,
            }}
        >
            <div className="flex items-center gap-3">
                <CustomerAvatar conversation={conversation} size={40} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <PlatformBadge platform={conversation.platform} />
                            <span className="font-semibold truncate text-sm" style={{ color: themeConfig.text }}>
                                {displayName(conversation)}
                            </span>
                        </div>
                        <span className="text-[11px] shrink-0" style={{ color: themeConfig.textSecondary }}>
                            {relativeTime(conversation.last_message_at)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-sm truncate" style={{ color: themeConfig.textSecondary }}>
                            {conversation.last_message_preview || 'No messages yet'}
                        </p>
                        {conversation.unread_count > 0 && (
                            <span
                                className="min-w-5 h-5 px-1.5 rounded-full text-white text-xs flex items-center justify-center shrink-0 font-bold"
                                style={{ backgroundColor: themeConfig.accent }}
                            >
                                {conversation.unread_count}
                            </span>
                        )}
                    </div>
                    {(conversation.tags ?? []).length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                            {(conversation.tags ?? []).slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                                    style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </button>
    );
}

function MessageBubble({ message, primaryColor }: { message: InboxMessage; primaryColor: string }) {
    const { config: themeConfig } = useShopTheme();
    const mine = message.direction === 'out';
    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
                className="max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm"
                style={
                    mine
                        ? { backgroundColor: primaryColor, color: '#ffffff' }
                        : { backgroundColor: themeConfig.surface, color: themeConfig.text, border: `1px solid ${themeConfig.border}60` }
                }
            >
                {message.source === 'comment' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">
                        <span className="material-symbols-outlined text-[12px]">comment</span>
                        Comment on your post
                    </span>
                )}
                {message.sent_by_ai && (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80"
                    >
                        <span className="material-symbols-outlined text-[12px]">smart_toy</span>
                        AI
                    </span>
                )}
                {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                {message.attachments.map((attachment, index) => (
                    <a
                        key={`${attachment.url}-${index}`}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block underline"
                        style={{ color: mine ? '#e0e7ff' : primaryColor }}
                    >
                        {attachment.type === 'image' ? (
                            <img src={attachment.url} alt="Shared image" className="mt-1 max-h-48 rounded-lg" />
                        ) : (
                            attachment.type
                        )}
                    </a>
                ))}
            </div>
        </div>
    );
}

export default function InboxPage() {
    const dispatch = useAppDispatch();
    const { config: themeConfig } = useShopTheme();
    const { conversations, messages, activeConversationId, statusFilter, loading, sendError } =
        useAppSelector((state) => state.inbox);
    const [draft, setDraft] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [tagDraft, setTagDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [draftFromAi, setDraftFromAi] = useState(false);
    const [autoReplyOn, setAutoReplyOn] = useState(false);
    const [botToggling, setBotToggling] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [orderModalOpen, setOrderModalOpen] = useState(false);
    const [orderPrefill, setOrderPrefill] = useState<OrderPrefill | null>(null);
    const threadEndRef = useRef<HTMLDivElement | null>(null);
    useInboxSocket();

    const primaryColor = themeConfig.primary;

    useEffect(() => {
        const handle = window.setTimeout(() => {
            dispatch(fetchConversations({ status: statusFilter, q: searchQuery }));
        }, searchQuery ? 350 : 0);
        return () => window.clearTimeout(handle);
    }, [dispatch, statusFilter, searchQuery]);

    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const active = conversations.find((c) => c.id === activeConversationId) ?? null;

    const openConversation = (conversation: InboxConversation) => {
        dispatch(setActiveConversation(conversation.id));
        dispatch(fetchMessages(conversation.id));
        if (conversation.unread_count > 0) {
            dispatch(markConversationRead(conversation.id));
        }
    };

    const handleSend = async () => {
        if (!active || !draft.trim() || sending) return;
        const text = draft.trim();
        setSending(true);
        const result = await dispatch(sendReply({ conversationId: active.id, text }));
        setSending(false);
        if (sendReply.fulfilled.match(result)) {
            setDraft('');
            setDraftFromAi(false);
        }
    };

    const handleSuggest = async () => {
        if (!active || suggesting) return;
        setSuggesting(true);
        try {
            const suggestion = await suggestReply(active.id);
            setDraft(suggestion);
            setDraftFromAi(true);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not draft a reply. Try again.');
        } finally {
            setSuggesting(false);
        }
    };

    const handleExtractOrder = async () => {
        if (!active || extracting) return;
        setExtracting(true);
        try {
            const extraction = await extractOrder(active.id);
            const quantities: Record<number, number> = {};
            extraction.items.forEach((item) => {
                quantities[item.product_id] = item.stock > 0 ? Math.min(item.quantity, item.stock) : item.quantity;
            });
            setOrderPrefill({ quantities, customerName: extraction.customer_name });
            setOrderModalOpen(true);
            if (!extraction.order_detected) {
                toast('No clear order in this chat yet — starting a blank one.', { icon: 'ℹ️' });
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Could not read an order from this chat.');
        } finally {
            setExtracting(false);
        }
    };

    useEffect(() => {
        getStoreProfile()
            .then((profile) => setAutoReplyOn(profile.ai_assistant_enabled && profile.ai_auto_reply))
            .catch(() => setAutoReplyOn(false));
    }, []);

    const updateTags = async (tags: string[]) => {
        if (!active) return;
        try {
            await setConversationTags(active.id, tags);
        } catch {
            toast.error('Could not update tags');
        }
    };

    const addTag = () => {
        if (!active || !tagDraft.trim()) return;
        const next = [...(active.tags ?? []), tagDraft.trim()];
        setTagDraft('');
        updateTags(next);
    };

    const toggleBotPause = async () => {
        if (!active || botToggling) return;
        setBotToggling(true);
        try {
            await setConversationAiPaused(active.id, !active.ai_paused);
            toast.success(active.ai_paused ? 'Bot resumed for this chat' : 'Bot paused for this chat');
        } catch {
            toast.error('Could not update the bot for this chat');
        } finally {
            setBotToggling(false);
        }
    };


    const toggleResolve = () => {
        if (!active) return;
        const next = active.status === 'resolved' ? 'open' : 'resolved';
        dispatch(setConversationStatus({ conversationId: active.id, status: next }));
    };

    return (
        <VendorShell>
            <div className="flex flex-col h-full px-4 md:px-6 py-4 gap-4">
                <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 backdrop-blur-xl border shadow-sm"
                    style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                >
                    <h1 className="text-xl font-extrabold tracking-tight" style={{ color: themeConfig.text }}>
                        Inbox
                    </h1>
                    <div className="flex gap-2 flex-wrap">
                        {FILTERS.map((filter) => {
                            const selected = statusFilter === filter.key;
                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => dispatch(setStatusFilter(filter.key))}
                                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                                    style={
                                        selected
                                            ? { backgroundColor: primaryColor, color: '#ffffff' }
                                            : { backgroundColor: `${themeConfig.border}40`, color: themeConfig.textSecondary }
                                    }
                                >
                                    {filter.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div
                    className="flex flex-1 min-h-0 rounded-2xl overflow-hidden backdrop-blur-xl border shadow-lg"
                    style={{ backgroundColor: `${themeConfig.surface}90`, borderColor: `${themeConfig.border}60` }}
                >
                    <div
                        className={`${active ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 border-r`}
                        style={{ borderColor: `${themeConfig.border}50` }}
                    >
                        <div className="p-3 border-b" style={{ borderColor: `${themeConfig.border}50` }}>
                            <div
                                className="flex items-center gap-2 rounded-xl px-3 py-2"
                                style={{ backgroundColor: `${themeConfig.border}30` }}
                            >
                                <span className="material-symbols-outlined text-[18px]" style={{ color: themeConfig.textSecondary }}>search</span>
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search name or messages…"
                                    className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm"
                                    style={{ color: themeConfig.text }}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        aria-label="Clear search"
                                        className="material-symbols-outlined text-[16px]"
                                        style={{ color: themeConfig.textSecondary }}
                                    >
                                        close
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                        {conversations.map((conversation) => (
                            <ConversationRow
                                key={conversation.id}
                                conversation={conversation}
                                active={conversation.id === activeConversationId}
                                onSelect={() => openConversation(conversation)}
                            />
                        ))}
                        {!loading && conversations.length === 0 && (
                            <div className="p-8 text-center">
                                <span className="material-symbols-outlined text-4xl mb-2" style={{ color: themeConfig.textSecondary }}>{searchQuery ? 'search_off' : 'forum'}</span>
                                <p className="text-sm font-medium" style={{ color: themeConfig.text }}>
                                    {searchQuery ? 'No conversations match' : 'No conversations yet'}
                                </p>
                                <p className="text-xs mt-1" style={{ color: themeConfig.textSecondary }}>
                                    {searchQuery
                                        ? 'Try a different name or keyword.'
                                        : 'Messages from your connected Facebook Page and Instagram will appear here.'}
                                </p>
                            </div>
                        )}
                        </div>
                    </div>
                    <div className={`${active ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
                        {active ? (
                            <>
                                <div
                                    className="flex items-center justify-between px-5 py-3 border-b"
                                    style={{ borderColor: `${themeConfig.border}50` }}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <button
                                            onClick={() => dispatch(setActiveConversation(null))}
                                            className="md:hidden material-symbols-outlined"
                                            style={{ color: themeConfig.textSecondary }}
                                        >
                                            arrow_back
                                        </button>
                                        <CustomerAvatar conversation={active} size={36} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold truncate" style={{ color: themeConfig.text }}>
                                                    {displayName(active)}
                                                </span>
                                                <PlatformBadge platform={active.platform} />
                                            </div>
                                            <span className="text-xs" style={{ color: themeConfig.textSecondary }}>
                                                {active.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {autoReplyOn && (
                                            <button
                                                onClick={toggleBotPause}
                                                disabled={botToggling}
                                                title={active.ai_paused ? 'The bot is paused here — resume auto-replies' : 'The bot replies automatically here — pause it'}
                                                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition-all disabled:opacity-50"
                                                style={active.ai_paused
                                                    ? { backgroundColor: '#fef3c7', color: '#b45309' }
                                                    : { backgroundColor: '#dcfce7', color: '#15803d' }}
                                            >
                                                <span className="material-symbols-outlined text-[16px]">
                                                    {active.ai_paused ? 'pause_circle' : 'smart_toy'}
                                                </span>
                                                {active.ai_paused ? 'Bot paused' : 'Bot on'}
                                            </button>
                                        )}
                                        <button
                                            onClick={handleExtractOrder}
                                            disabled={extracting}
                                            title="Create an order from this chat with AI"
                                            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition-all disabled:opacity-50"
                                            style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${themeConfig.accent}15)`, color: primaryColor, border: `1px solid ${primaryColor}30` }}
                                        >
                                            <span className={`material-symbols-outlined text-[16px] ${extracting ? 'animate-spin' : ''}`}>
                                                {extracting ? 'progress_activity' : 'shopping_cart'}
                                            </span>
                                            {extracting ? 'Reading…' : 'Create order'}
                                        </button>
                                    <button
                                        onClick={toggleResolve}
                                        className="text-sm font-semibold px-3 py-1.5 rounded-full"
                                        style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                                    >
                                        {active.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
                                    </button>
                                    </div>
                                </div>
                                <div
                                    className="flex items-center gap-1.5 px-5 py-2 border-b flex-wrap"
                                    style={{ borderColor: `${themeConfig.border}50` }}
                                >
                                    <span className="material-symbols-outlined text-[15px]" style={{ color: themeConfig.textSecondary }}>sell</span>
                                    {(active.tags ?? []).map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                                            style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
                                        >
                                            {tag}
                                            <button
                                                onClick={() => updateTags((active.tags ?? []).filter((t) => t !== tag))}
                                                aria-label={`Remove tag ${tag}`}
                                                className="material-symbols-outlined text-[12px] hover:opacity-70"
                                            >
                                                close
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        value={tagDraft}
                                        onChange={(e) => setTagDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addTag();
                                            }
                                        }}
                                        placeholder="Add tag…"
                                        className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs font-medium min-w-[70px] w-20"
                                        style={{ color: themeConfig.text }}
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                                    {messages.map((message) => (
                                        <MessageBubble
                                            key={message.platform_message_id}
                                            message={message}
                                            primaryColor={primaryColor}
                                        />
                                    ))}
                                    <div ref={threadEndRef} />
                                </div>
                                <div className="px-5 py-4 border-t" style={{ borderColor: `${themeConfig.border}50` }}>
                                    {sendError && (
                                        <p className="mb-2 text-sm font-medium text-red-600">{sendError}</p>
                                    )}
                                    {draftFromAi && draft && (
                                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: primaryColor }}>
                                            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                            AI draft — review and edit before sending
                                        </p>
                                    )}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleSuggest()}
                                            disabled={suggesting}
                                            title="Draft a reply with AI"
                                            className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all hover:shadow-sm disabled:opacity-50"
                                            style={{
                                                background: `linear-gradient(135deg, ${primaryColor}15, ${themeConfig.accent}15)`,
                                                color: primaryColor,
                                                border: `1px solid ${primaryColor}30`,
                                            }}
                                        >
                                            <span className={`material-symbols-outlined text-[18px] ${suggesting ? 'animate-spin' : ''}`}>
                                                {suggesting ? 'progress_activity' : 'auto_awesome'}
                                            </span>
                                            {suggesting ? 'Drafting…' : 'AI draft'}
                                        </button>
                                        <input
                                            value={draft}
                                            onChange={(e) => {
                                                setDraft(e.target.value);
                                                setDraftFromAi(false);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSend();
                                                }
                                            }}
                                            placeholder="Type a reply…"
                                            className="flex-1 rounded-xl px-4 py-2 focus:outline-none focus:ring-2"
                                            style={{
                                                backgroundColor: themeConfig.surface,
                                                border: `1px solid ${themeConfig.border}`,
                                                color: themeConfig.text,
                                            }}
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={sending || !draft.trim()}
                                            className="rounded-xl px-5 py-2 text-white font-semibold transition-opacity disabled:opacity-50"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            {sending ? 'Sending…' : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-5xl" style={{ color: `${themeConfig.textSecondary}80` }}>chat</span>
                                <p className="text-sm" style={{ color: themeConfig.textSecondary }}>
                                    Select a conversation to read and reply
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <NewOrderModal
                open={orderModalOpen}
                prefill={orderPrefill}
                onClose={() => setOrderModalOpen(false)}
                onCreated={() => setOrderModalOpen(false)}
            />
        </VendorShell>
    );
}
