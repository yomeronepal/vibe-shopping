import apiClient from './client';

export interface MetaPage {
    id: string;
    name: string;
}

export interface ConnectedPage {
    connection_type?: 'facebook_page' | 'instagram_direct';
    id: number;
    page_id: string;
    name: string;
    instagram_account_id: string;
    instagram_username: string;
    status: 'connected' | 'disconnected' | 'token_expired';
    created_at: string;
}

export interface BoostRecommendation {
    post_id: number;
    platform: string;
    post_url: string;
    caption: string;
    image: string | null;
    product: { id: number; name: string; price: number; stock: number; is_service: boolean };
    engagement: { likes: number; comments: number; shares: number };
    orders_30d: number;
    revenue_30d: number;
    suggested: { daily_budget: number; days: number; total_budget: number; audience: string; goal: string };
    warnings: string[];
    reasoning: string;
}

export interface BoostAdvice {
    generated_at: string;
    window_days: number;
    recommendations: BoostRecommendation[];
    posts_considered: number;
}

export interface AdAccount {
    id: string;
    account_id: string;
    name: string;
    currency: string;
}

export interface Boost {
    id: number;
    post_id: number;
    product_name: string;
    post_url: string;
    platform: string;
    ad_account_id: string;
    daily_budget: number;
    days: number;
    status: 'active' | 'paused' | 'completed' | 'failed';
    status_note: string;
    insights: {
        spend?: number;
        impressions?: number;
        reach?: number;
        conversations_started?: number;
        cost_per_conversation?: number | null;
        updated_at?: string;
    };
    ends_at: string | null;
    created_at: string;
}

export const listAdAccounts = async (): Promise<AdAccount[]> => {
    const response = await apiClient.get('/socials/ad-accounts/');
    return response.data.accounts;
};

export const listBoosts = async (): Promise<Boost[]> => {
    const response = await apiClient.get('/socials/boosts/');
    return response.data;
};

export const launchBoost = async (data: {
    post_id: number;
    ad_account_id: string;
    daily_budget: number;
    days: number;
    age_min?: number;
    age_max?: number;
}): Promise<Boost> => {
    const response = await apiClient.post('/socials/boosts/', data);
    return response.data;
};

export const setBoostAction = async (boostId: number, action: 'pause' | 'resume'): Promise<Boost> => {
    const response = await apiClient.post(`/socials/boosts/${boostId}/${action}/`);
    return response.data;
};

export const getBoostAdvice = async (refresh = false): Promise<BoostAdvice> => {
    const response = await apiClient.get('/socials/boost-advisor/', {
        params: refresh ? { refresh: 1 } : {},
    });
    return response.data;
};

export const getInstagramConnectUrl = async (): Promise<string> => {
    const response = await apiClient.get('/socials/instagram/connect-url/');
    return response.data.url;
};

export const completeInstagramOAuth = async (code: string, state: string): Promise<ConnectedPage> => {
    const response = await apiClient.post('/socials/instagram/oauth/callback/', { code, state });
    return response.data;
};

export const getConnectUrl = async (): Promise<string> => {
    const response = await apiClient.get('/socials/connect-url/');
    return response.data.url;
};

export const completeOAuth = async (code: string, state: string): Promise<MetaPage[]> => {
    const response = await apiClient.post('/socials/oauth/callback/', { code, state });
    return response.data.pages;
};

export const importPageProfile = async (): Promise<{ imported: string[] }> => {
    const response = await apiClient.post('/socials/pages/import-profile/');
    return response.data;
};

export const listConnectedPages = async (): Promise<ConnectedPage[]> => {
    const response = await apiClient.get('/socials/pages/');
    return response.data;
};

export const connectPage = async (pageId: string): Promise<ConnectedPage> => {
    const response = await apiClient.post(`/socials/pages/${pageId}/connect/`);
    return response.data;
};

export const disconnectPage = async (pageId: string): Promise<ConnectedPage> => {
    const response = await apiClient.post(`/socials/pages/${pageId}/disconnect/`);
    return response.data;
};

export interface PublishResult {
    platform: string;
    status: 'posted' | 'failed';
    post_url: string | null;
    error: string | null;
}

export const publishProductPost = async (
    productId: number,
    platforms: string[],
    caption: string,
): Promise<PublishResult[]> => {
    const response = await apiClient.post('/socials/posts/', {
        product_id: productId,
        platforms,
        caption,
    });
    return response.data.results;
};

export interface PostProductRef {
    id: number;
    name: string;
}

export interface ScheduledPost {
    id: number;
    platform: 'facebook' | 'instagram';
    status: 'draft' | 'scheduled' | 'pending' | 'posted' | 'failed';
    caption: string;
    image_url: string | null;
    product: PostProductRef | null;
    scheduled_for: string | null;
    post_url: string | null;
    error_message: string;
    created_at: string;
    post_format: 'feed' | 'story';
}

export const listPosts = async (fromDate: string, toDate: string): Promise<ScheduledPost[]> => {
    const response = await apiClient.get('/socials/posts/', {
        params: { from: fromDate, to: toDate },
    });
    return response.data;
};

export const createPost = async (form: FormData): Promise<ScheduledPost[] | { results: PublishResult[] }> => {
    const response = await apiClient.post('/socials/posts/', form);
    return response.data;
};

export const updatePost = async (postId: number, form: FormData): Promise<ScheduledPost> => {
    const response = await apiClient.patch(`/socials/posts/${postId}/`, form);
    return response.data;
};

export const deletePost = async (postId: number): Promise<void> => {
    await apiClient.delete(`/socials/posts/${postId}/`);
};

export const retryPost = async (postId: number): Promise<ScheduledPost> => {
    const response = await apiClient.post(`/socials/posts/${postId}/retry/`);
    return response.data;
};
