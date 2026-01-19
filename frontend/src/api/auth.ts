import apiClient from './client';

export interface LoginResponse {
    token: string;
    user_id: number;
    username: string;
    tenant_id: number | null;
    is_onboarding_complete: boolean;
}

export const authApi = {
    login: async (username: string, password: string): Promise<LoginResponse> => {
        const response = await apiClient.post('/auth/login/', { username, password });
        return response.data;
    },

    logout: async () => {
        try {
            await apiClient.post('/auth/logout/');
        } catch (error) {
            console.error('Logout API error:', error);
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('shop-theme');
            localStorage.removeItem('ai-theme-config');
        }
    },

    setToken: (token: string) => {
        localStorage.setItem('token', token);
    },

    getToken: () => {
        return localStorage.getItem('token');
    }
};
