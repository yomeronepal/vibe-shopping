import apiClient from './client';

export interface MetaPage {
    id: string;
    name: string;
}

export interface ConnectedPage {
    id: number;
    page_id: string;
    name: string;
    instagram_account_id: string;
    instagram_username: string;
    status: 'connected' | 'disconnected' | 'token_expired';
    created_at: string;
}

export const getConnectUrl = async (): Promise<string> => {
    const response = await apiClient.get('/socials/connect-url/');
    return response.data.url;
};

export const completeOAuth = async (code: string, state: string): Promise<MetaPage[]> => {
    const response = await apiClient.post('/socials/oauth/callback/', { code, state });
    return response.data.pages;
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
