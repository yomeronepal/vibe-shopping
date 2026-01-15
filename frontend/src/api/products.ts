import apiClient from './client';

export interface Product {
    id: number;
    name: string;
    description: string;
    price: number;
    stock: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ProductsResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Product[];
}

export const productsApi = {
    getProducts: async (page = 1): Promise<ProductsResponse> => {
        const response = await apiClient.get<ProductsResponse>(`/products/?page=${page}`);
        return response.data;
    },

    getProduct: async (id: number): Promise<Product> => {
        const response = await apiClient.get<Product>(`/products/${id}/`);
        return response.data;
    },

    searchProducts: async (query: string): Promise<ProductsResponse> => {
        const response = await apiClient.get<ProductsResponse>(`/products/?search=${query}`);
        return response.data;
    },
};
