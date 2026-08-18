import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import type { InboxConversation, InboxMessage } from '@/api/inbox';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'waiting_business', label: 'Needs reply' },
    { key: 'waiting_customer', label: 'Waiting' },
    { key: 'resolved', label: 'Resolved' },
];

function PlatformBadge({ platform }: { platform: InboxConversation['platform'] }) {
    const label = platform === 'instagram' ? 'IG' : 'FB';
    const color = platform === 'instagram' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700';
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>{label}</span>;
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
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active ? 'bg-indigo-50' : 'bg-white'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <PlatformBadge platform={conversation.platform} />
                    <span className="font-semibold text-gray-900 truncate">
                        {conversation.customer.name || conversation.customer.platform_user_id}
                    </span>
                </div>
                {conversation.unread_count > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">
                        {conversation.unread_count}
                    </span>
                )}
            </div>
            <p className="mt-1 text-sm text-gray-500 truncate">{conversation.last_message_preview}</p>
        </button>
    );
}

function MessageBubble({ message }: { message: InboxMessage }) {
    const mine = message.direction === 'out';
    return (
        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'}`}
            >
                {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                {message.attachments.map((attachment) => (
                    <a
                        key={attachment.url}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`block underline ${mine ? 'text-indigo-100' : 'text-indigo-600'}`}
                    >
                        {attachment.type === 'image' ? (
                            <img src={attachment.url} alt="attachment" className="mt-1 max-h-48 rounded-lg" />
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
    const { conversations, messages, activeConversationId, statusFilter, loading, sendError } =
        useAppSelector((state) => state.inbox);
    const [draft, setDraft] = useState('');
    useInboxSocket();

    useEffect(() => {
        dispatch(fetchConversations(statusFilter));
    }, [dispatch, statusFilter]);

    const active = conversations.find((c) => c.id === activeConversationId) ?? null;

    const openConversation = (conversation: InboxConversation) => {
        dispatch(setActiveConversation(conversation.id));
        dispatch(fetchMessages(conversation.id));
        if (conversation.unread_count > 0) {
            dispatch(markConversationRead(conversation.id));
        }
    };

    const handleSend = async () => {
        if (!active || !draft.trim()) return;
        const text = draft.trim();
        setDraft('');
        await dispatch(sendReply({ conversationId: active.id, text }));
    };

    const toggleResolve = () => {
        if (!active) return;
        const next = active.status === 'resolved' ? 'open' : 'resolved';
        dispatch(setConversationStatus({ conversationId: active.id, status: next }));
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
                <div className="flex items-center gap-4">
                    <Link to="/vendor" className="text-sm text-indigo-600">
                        ← Dashboard
                    </Link>
                    <h1 className="text-xl font-bold text-gray-900">Inbox</h1>
                </div>
                <div className="flex gap-2">
                    {FILTERS.map((filter) => (
                        <button
                            key={filter.key}
                            onClick={() => dispatch(setStatusFilter(filter.key))}
                            className={`px-3 py-1.5 rounded-full text-sm ${statusFilter === filter.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-1 min-h-0">
                <div className="w-96 border-r border-gray-200 bg-white overflow-y-auto">
                    {conversations.map((conversation) => (
                        <ConversationRow
                            key={conversation.id}
                            conversation={conversation}
                            active={conversation.id === activeConversationId}
                            onSelect={() => openConversation(conversation)}
                        />
                    ))}
                    {!loading && conversations.length === 0 && (
                        <p className="p-6 text-sm text-gray-500">No conversations yet.</p>
                    )}
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                    {active ? (
                        <>
                            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <PlatformBadge platform={active.platform} />
                                    <span className="font-semibold text-gray-900">
                                        {active.customer.name || active.customer.platform_user_id}
                                    </span>
                                    <span className="text-xs text-gray-400">{active.status}</span>
                                </div>
                                <button onClick={toggleResolve} className="text-sm text-indigo-600">
                                    {active.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                                {messages.map((message) => (
                                    <MessageBubble key={message.platform_message_id} message={message} />
                                ))}
                            </div>
                            <div className="px-6 py-4 bg-white border-t border-gray-200">
                                {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
                                <div className="flex gap-3">
                                    <input
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder="Type a reply…"
                                        className="flex-1 rounded-xl border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <button
                                        onClick={handleSend}
                                        className="rounded-xl bg-indigo-600 px-5 py-2 text-white hover:bg-indigo-700"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            Select a conversation
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
