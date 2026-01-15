import apiClient from './client';

export interface AIProductDetails {
    title: string;
    description: string;
    tags: string[];
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
}

export const aiApi = {
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
            '/ai/generate-product/',
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
