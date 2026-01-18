import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const apiClient = axios.create({
    baseURL: API_URL,
    // headers: { 'Content-Type': 'application/json' } // Removed to allow auto-detection (multipart/form-data)
});

// Add interceptor to include subdomain header if present in URL (for local testing mostly)
apiClient.interceptors.request.use((config) => {
    // Check if we are checking a store page via query param (e.g. ?subdomain=xyz)
    // Or if we need to force it.
    // Ideally, we just rely on standard Host header, but for cross-domain local calls:
    return config;
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Token ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Handle unauthorized access
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default apiClient;
