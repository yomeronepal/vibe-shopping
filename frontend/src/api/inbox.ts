import apiClient from './client';

export interface InboxCustomer {
    id: number;
    platform: string;
    platform_user_id: string;
    name: string;
    profile_pic_url: string;
}

export interface InboxConversation {
    id: number;
    platform: 'facebook' | 'instagram';
    status: string;
    unread_count: number;
    last_message_at: string | null;
    last_message_preview: string;
    customer: InboxCustomer;
    page_id: string;
}

export interface InboxAttachment {
    type: string;
    url: string;
}

export interface InboxMessage {
    id: number;
    direction: 'in' | 'out';
    text: string;
    attachments: InboxAttachment[];
    platform_message_id: string;
    sent_at: string;
}

export const listConversations = async (status?: string): Promise<InboxConversation[]> => {
    const params = status && status !== 'all' ? { status } : {};
    const response = await apiClient.get('/inbox/conversations/', { params });
    return response.data;
};

export const listMessages = async (conversationId: number): Promise<InboxMessage[]> => {
    const response = await apiClient.get(`/inbox/conversations/${conversationId}/messages/`);
    return response.data;
};

export const sendMessage = async (conversationId: number, text: string): Promise<InboxMessage> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/messages/`, { text });
    return response.data;
};

export const markRead = async (conversationId: number): Promise<InboxConversation> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/read/`);
    return response.data;
};

export const updateConversationStatus = async (
    conversationId: number,
    status: string,
): Promise<InboxConversation> => {
    const response = await apiClient.patch(`/inbox/conversations/${conversationId}/`, { status });
    return response.data;
};

export const suggestReply = async (conversationId: number): Promise<string> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/suggest/`);
    return response.data.suggestion;
};
