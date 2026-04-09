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
    feedback: string;
    prompt: string;
    reviewedBy: string;
    reviewedAt: Date;
    generatedBy?: string;
    generatedAt?: Date;
}

export interface ArchiveImage {
    filename: string;
    path: string;
    url: string;
    timestamp: string;
}

export interface RecipeEvent {
    id: string;
    recipeId: string;
    type: 'generated' | 'approved' | 'flagged' | 'feedback' | 'assigned-archive';
    by: string;
    at: Date;
    prompt?: string;
    feedback?: string;
    notes?: string;
    imageUrl?: string;
    archivePath?: string;
}

export type FilterType = 'all' | 'approved' | 'flagged' | 'not-reviewed';
