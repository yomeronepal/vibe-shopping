import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { store } from '@/store';
import {
    fetchConversations,
    fetchMessages,
    socketConversationUpdated,
    socketMessageReceived,
} from './inboxSlice';

const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function useInboxSocket() {
    const dispatch = useAppDispatch();
    const retryRef = useRef(0);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let closed = false;
        let reconnectTimer: number | undefined;

        const connect = () => {
            const token = localStorage.getItem('token');
            if (!token) return;
            socket = new WebSocket(`${WS_BASE}/ws/inbox/?token=${token}`);
            socket.onopen = () => {
                if (retryRef.current > 0) {
                    const { statusFilter, activeConversationId } = store.getState().inbox;
                    dispatch(fetchConversations({ status: statusFilter }));
                    if (activeConversationId) {
                        dispatch(fetchMessages(activeConversationId));
                    }
                }
                retryRef.current = 0;
            };
            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'message') {
                    dispatch(socketMessageReceived({ conversation: data.conversation, message: data.message }));
                } else if (data.type === 'conversation_update') {
                    dispatch(socketConversationUpdated({ conversation: data.conversation }));
                }
            };
            socket.onclose = () => {
                if (closed) return;
                retryRef.current += 1;
                const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
                reconnectTimer = window.setTimeout(connect, delay);
            };
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [dispatch]);
}
