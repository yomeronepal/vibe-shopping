import apiClient from './client';

export interface AIProductDetails {
    title: string;
    description: string;
    tags: string[];
    vibe_tags?: string[];
    suggested_price_range?: {
        min: number;
        max: number;
    };
    category: string;
    subcategory: string;
    attributes: {
        color: string[];
        material: string[];
        style: string;
        fit: string;
        pattern: string;
        sleeve_length?: string;
        neckline?: string;
        length?: string;
    };
    target_audience: {
        gender: string;
        age_range: string;
        lifestyle: string;
    };
    occasions: string[];
    season: string[];
    care_instructions: string;
    seo_keywords: string[];
    selling_points: string[];
    similar_styles: string[];
    social_caption?: string;
}

export interface CaptionRequest {
    product_id?: number;
    context?: string;
    platform?: string;
}

export const aiApi = {
    generateCaption: async (payload: CaptionRequest): Promise<string> => {
        const response = await apiClient.post('/products/generate-caption/', payload);
        return response.data.caption;
    },

    generateProductDetailsFromBrief: async (
        brief: string,
        price?: number
    ): Promise<AIProductDetails> => {
        const response = await apiClient.post<AIProductDetails>(
            '/products/generate-details-from-text/',
            { brief, price }
        );
        return response.data;
    },

    generateProductDetails: async (
        image: File,
        price?: number
    ): Promise<AIProductDetails> => {
        const formData = new FormData();
        formData.append('image', image);
        if (price) {
            formData.append('price', price.toString());
        }

        const response = await apiClient.post<AIProductDetails>(
            '/products/generate-details/',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );

        return response.data;
    },
};
