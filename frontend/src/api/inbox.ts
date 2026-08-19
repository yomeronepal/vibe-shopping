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
    ai_paused: boolean;
    tags: string[];
    sentiment: string;
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
    source: 'dm' | 'comment';
    sent_by_ai: boolean;
}

export const listConversations = async (status?: string, q?: string): Promise<InboxConversation[]> => {
    const params: Record<string, string> = {};
    if (status && status !== 'all') params.status = status;
    if (q && q.trim()) params.q = q.trim();
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

export interface ExtractedOrderItem {
    product_id: number;
    name: string;
    price: string;
    quantity: number;
    stock: number;
}

export interface OrderExtraction {
    order_detected: boolean;
    items: ExtractedOrderItem[];
    customer_name: string;
    note: string;
}

export const extractOrder = async (conversationId: number): Promise<OrderExtraction> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/extract-order/`);
    return response.data;
};

export const setConversationAiPaused = async (conversationId: number, paused: boolean): Promise<InboxConversation> => {
    const response = await apiClient.patch(`/inbox/conversations/${conversationId}/`, { ai_paused: paused });
    return response.data;
};

export const setConversationTags = async (conversationId: number, tags: string[]): Promise<InboxConversation> => {
    const response = await apiClient.patch(`/inbox/conversations/${conversationId}/`, { tags });
    return response.data;
};

export const summarizeConversation = async (conversationId: number): Promise<string> => {
    const response = await apiClient.post(`/inbox/conversations/${conversationId}/summarize/`);
    return response.data.summary;
};

export interface CustomerCard {
    id: number;
    platform: string;
    platform_user_id: string;
    name: string;
    profile_pic_url: string;
    phone: string;
    email: string;
    location: string;
    notes: string;
    tags: string[];
    status: string;
    order_count: number;
    total_spent: number;
    last_purchase_at: string | null;
    product_interests: string[];
    last_active_at: string | null;
    recent_orders: { id: number; total_amount: string; status: string; created_at: string; summary: string }[];
}

export const listCustomers = async (q?: string): Promise<CustomerCard[]> => {
    const params = q && q.trim() ? { q: q.trim() } : {};
    const response = await apiClient.get('/inbox/customers/', { params });
    return response.data;
};

export const getCustomerCard = async (customerId: number): Promise<CustomerCard> => {
    const response = await apiClient.get(`/inbox/customers/${customerId}/`);
    return response.data;
};

export const updateCustomerCard = async (
    customerId: number,
    data: Partial<Pick<CustomerCard, 'name' | 'phone' | 'email' | 'location' | 'notes' | 'tags'>>,
): Promise<CustomerCard> => {
    const response = await apiClient.patch(`/inbox/customers/${customerId}/`, data);
    return response.data;
};

export const sendCampaign = async (message: string, audience: 'all' | 'buyers' | 'prospects'): Promise<{ sent: number; skipped: number }> => {
    const response = await apiClient.post('/inbox/campaigns/send/', { message, audience });
    return response.data;
};
