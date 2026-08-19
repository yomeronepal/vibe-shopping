import apiClient from './client';

export interface VendorOrderItem {
    product_name: string;
    quantity: number;
    price: string;
}

export interface VendorOrder {
    id: number;
    status: string;
    total_amount: string;
    order_type: string;
    payment_method: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    metadata?: Record<string, any>;
    created_at: string;
    items: VendorOrderItem[];
}

export const ORDER_STATUSES = [
    'pending_payment',
    'pending_delivery',
    'shipped',
    'delivered',
    'completed',
    'cancelled',
    'disputed',
] as const;

export const listVendorOrders = async (): Promise<VendorOrder[]> => {
    const response = await apiClient.get('/vendor/orders/');
    return response.data;
};

export const updateVendorOrderStatus = async (orderId: number, status: string): Promise<VendorOrder> => {
    const response = await apiClient.patch(`/vendor/orders/${orderId}/`, { status });
    return response.data;
};

export interface CreateOrderItem {
    product_id: number;
    quantity: number;
}

export interface CreateOrderPayload {
    items: CreateOrderItem[];
    customer_name: string;
    customer_phone?: string;
    customer_email?: string;
    metadata?: Record<string, any>;
    payment_method: string;
    status?: string;
}

export interface SendInvoiceResponse {
    sent: boolean;
    message_id: number;
    text: string;
}

export const createVendorOrder = async (payload: CreateOrderPayload): Promise<{ order_id: number }> => {
    const response = await apiClient.post('/vendor/orders/pos/', { ...payload, order_type: 'pos' });
    return response.data;
};

export const getVendorOrder = async (orderId: number | string): Promise<VendorOrder> => {
    const response = await apiClient.get(`/vendor/orders/${orderId}/`);
    return response.data;
};

export const sendOrderInvoice = async (orderId: number | string, conversationId: number): Promise<SendInvoiceResponse> => {
    const response = await apiClient.post(`/vendor/orders/${orderId}/send-invoice/`, { conversation_id: conversationId });
    return response.data;
};
