export interface RecipeIngredient {
    name: string;
    quantity?: string;
}

export interface RecipeDirection {
    step: number;
    description: string;
}

export interface RecipeAsset {
    type: string;
    context: string;
    url: string;
}

export interface Recipe {
    id: string;
    name: string;
    description: string;
    proteinName?: string;
    calories?: number;
    ingredients: RecipeIngredient[];
    directions: RecipeDirection[];
    assets: RecipeAsset[];
}

export interface RecipeReview {
    recipeId: string;
    status: 'approved' | 'flagged';
    notes: string;
    reviewedBy: string;
    reviewedAt: Date;
    updatedBy: string;
    updatedAt: Date;
}

export type FilterType = 'all' | 'approved' | 'flagged' | 'not-reviewed';
