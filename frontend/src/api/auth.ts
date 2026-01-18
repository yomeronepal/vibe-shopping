import apiClient from './client';

export interface LoginResponse {
    token: string;
}

export const authApi = {
    login: async (username: string, password: string): Promise<LoginResponse> => {
        const response = await apiClient.post('/auth/login/', { username, password });
        return response.data;
    },

    setToken: (token: string) => {
        localStorage.setItem('token', token);
    },

    getToken: () => {
        return localStorage.getItem('token');
    },

    logout: () => {
        localStorage.removeItem('token');
    }
};
