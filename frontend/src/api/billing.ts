import apiClient from './client';

export interface BillingPlan {
    key: string;
    name: string;
    price: number;
    monthly_ai_replies: number | null;
    pitch: string;
}

export interface BillingInfo {
    plan: string;
    status: 'active' | 'grace' | 'expired';
    is_trial: boolean;
    period_end: string;
    days_left: number;
    usage: { used: number; limit: number | null };
    plans: BillingPlan[];
    payment_instructions: string;
}

export const getBilling = async (): Promise<BillingInfo> => {
    const response = await apiClient.get('/vendor/billing/');
    return response.data;
};
