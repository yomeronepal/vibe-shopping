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
