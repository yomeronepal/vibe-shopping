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
