export interface RecipeIngredient {
    id?: string;
    name: string;
    quantity?: string;
}

export interface RecipeDirection {
    step: number;
    description: string;
    imagePrompt?: string;
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

export interface RecipeFieldDiff {
    before?: string | number | null;
    after?: string | number | null;
}

export interface RecipeAuditChanges {
    name?: RecipeFieldDiff;
    description?: RecipeFieldDiff;
    calories?: RecipeFieldDiff;
    ingredients?: {
        added?: { name: string; quantity?: string }[];
        removed?: { name: string; quantity?: string }[];
        changed?: { name: string; before?: string; after?: string }[];
        linked?: number;
    };
    directions?: {
        added?: number;
        removed?: number;
        changed?: number;
    };
}

export interface RecipeEvent {
    id: string;
    recipeId: string;
    type: 'generated' | 'approved' | 'flagged' | 'feedback' | 'assigned-archive' | 'audited';
    by: string;
    at: Date;
    prompt?: string;
    feedback?: string;
    notes?: string;
    imageUrl?: string;
    archivePath?: string;
    model?: string;
    usedReference?: boolean;
    cost?: number;
    changes?: RecipeAuditChanges;
    pdfUrl?: string;
    source?: 'ai' | 'manual';
    stepNumber?: number;
}

export type FilterType = 'all' | 'approved' | 'flagged' | 'not-reviewed';
