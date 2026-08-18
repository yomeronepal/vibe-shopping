import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    listConversations,
    listMessages,
    markRead,
    sendMessage,
    updateConversationStatus,
    type InboxConversation,
    type InboxMessage,
} from '@/api/inbox';

interface InboxState {
    conversations: InboxConversation[];
    messages: InboxMessage[];
    activeConversationId: number | null;
    statusFilter: string;
    loading: boolean;
    error: string | null;
    sendError: string | null;
}

const initialState: InboxState = {
    conversations: [],
    messages: [],
    activeConversationId: null,
    statusFilter: 'all',
    loading: false,
    error: null,
    sendError: null,
};

const upsertConversation = (state: InboxState, conversation: InboxConversation) => {
    state.conversations = [
        conversation,
        ...state.conversations.filter((c) => c.id !== conversation.id),
    ];
};

export const fetchConversations = createAsyncThunk(
    'inbox/fetchConversations',
    async (status: string) => listConversations(status),
);

export const fetchMessages = createAsyncThunk(
    'inbox/fetchMessages',
    async (conversationId: number) => listMessages(conversationId),
);

export const sendReply = createAsyncThunk(
    'inbox/sendReply',
    async (
        { conversationId, text }: { conversationId: number; text: string },
        { rejectWithValue },
    ) => {
        try {
            return await sendMessage(conversationId, text);
        } catch (error) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            return rejectWithValue(detail ?? 'Could not send the message');
        }
    },
);

export const markConversationRead = createAsyncThunk(
    'inbox/markConversationRead',
    async (conversationId: number) => markRead(conversationId),
);

export const setConversationStatus = createAsyncThunk(
    'inbox/setConversationStatus',
    async ({ conversationId, status }: { conversationId: number; status: string }) =>
        updateConversationStatus(conversationId, status),
);

const inboxSlice = createSlice({
    name: 'inbox',
    initialState,
    reducers: {
        setActiveConversation(state, action: PayloadAction<number | null>) {
            state.activeConversationId = action.payload;
            state.messages = [];
            state.sendError = null;
        },
        setStatusFilter(state, action: PayloadAction<string>) {
            state.statusFilter = action.payload;
        },
        socketMessageReceived(
            state,
            action: PayloadAction<{ conversation: InboxConversation; message: InboxMessage }>,
        ) {
            upsertConversation(state, action.payload.conversation);
            const isActive = state.activeConversationId === action.payload.conversation.id;
            const alreadyStored = state.messages.some(
                (m) => m.platform_message_id === action.payload.message.platform_message_id,
            );
            if (isActive && !alreadyStored) {
                state.messages = [...state.messages, action.payload.message];
            }
        },
        socketConversationUpdated(
            state,
            action: PayloadAction<{ conversation: InboxConversation }>,
        ) {
            upsertConversation(state, action.payload.conversation);
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConversations.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchConversations.fulfilled, (state, action) => {
                state.conversations = action.payload;
                state.loading = false;
            })
            .addCase(fetchConversations.rejected, (state) => {
                state.loading = false;
                state.error = 'Could not load conversations';
            })
            .addCase(fetchMessages.fulfilled, (state, action) => {
                state.messages = action.payload;
            })
            .addCase(sendReply.pending, (state) => {
                state.sendError = null;
            })
            .addCase(sendReply.fulfilled, (state, action) => {
                const alreadyStored = state.messages.some(
                    (m) => m.platform_message_id === action.payload.platform_message_id,
                );
                if (!alreadyStored) {
                    state.messages = [...state.messages, action.payload];
                }
            })
            .addCase(sendReply.rejected, (state, action) => {
                state.sendError = (action.payload as string) ?? 'Could not send the message';
            })
            .addCase(markConversationRead.fulfilled, (state, action) => {
                upsertConversation(state, action.payload);
            })
            .addCase(setConversationStatus.fulfilled, (state, action) => {
                upsertConversation(state, action.payload);
            });
    },
});

export const {
    setActiveConversation,
    setStatusFilter,
    socketMessageReceived,
    socketConversationUpdated,
} = inboxSlice.actions;
export default inboxSlice.reducer;
