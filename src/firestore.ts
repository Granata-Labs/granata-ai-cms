import { collection, getDocs, addDoc, doc, setDoc, deleteDoc, onSnapshot, orderBy, query, where, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { ref, getDownloadURL, uploadBytes, listAll } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage } from './firebase-config';
import { getCurrentUser } from './auth';
import type { Recipe, RecipeReview, RecipeEvent, ArchiveImage } from './types';

const functions = getFunctions();
const urlCache = new Map<string, string>();

export function clearUrlCache(recipeId: string) {
    for (const key of urlCache.keys()) {
        if (key.includes(recipeId)) urlCache.delete(key);
    }
}

export async function getImageUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;
    if (urlCache.has(cleanPath)) return urlCache.get(cleanPath)!;
    try {
        const storageRef = ref(storage, cleanPath);
        const url = await getDownloadURL(storageRef);
        urlCache.set(cleanPath, url);
        return url;
    } catch { return null; }
}

export async function getArchiveImageUrl(coverPath: string): Promise<string | null> {
    if (!coverPath) return null;
    const cleanPath = coverPath.startsWith('/') ? coverPath.substring(1) : coverPath;
    const archivePath = cleanPath.replace('/images/', '/images/_archive/');
    return getImageUrl(archivePath);
}

export async function loadRecipes(): Promise<Recipe[]> {
    const q = query(collection(db, 'recipes'), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || 'Untitled',
        description: d.data().description || '',
        proteinName: d.data().proteinName || undefined,
        calories: d.data().calories || undefined,
        ingredients: (d.data().ingredients || []).map((i: any) => ({ id: i.id, name: i.name, quantity: i.quantity })),
        directions: (d.data().directions || []).map((dir: any) => ({ step: dir.step, description: dir.description, imagePrompt: dir.imagePrompt })),
        assets: d.data().assets || [],
    }));
}

export async function setReview(recipeId: string, status: 'approved' | 'flagged', notes: string = '', feedback: string = '', prompt: string = '') {
    const user = getCurrentUser();
    if (!user?.email) return;
    const reviewRef = doc(db, 'recipe-reviews', recipeId);
    await setDoc(reviewRef, {
        recipeId,
        status,
        notes,
        feedback,
        prompt,
        reviewedBy: user.email,
        reviewedAt: serverTimestamp(),
    }, { merge: true });
    // Log event
    const eventData: Record<string, any> = {
        recipeId,
        type: status,
        by: user.email,
        at: serverTimestamp(),
    };
    if (notes) eventData.notes = notes;
    await addDoc(collection(db, 'recipe-events'), eventData);
}

export async function clearReview(recipeId: string) {
    await deleteDoc(doc(db, 'recipe-reviews', recipeId));
}

export async function addFeedback(recipeId: string, text: string) {
    const user = getCurrentUser();
    if (!user?.email || !text.trim()) return;
    await addDoc(collection(db, 'recipe-events'), {
        recipeId,
        type: 'feedback',
        by: user.email,
        at: serverTimestamp(),
        feedback: text.trim(),
    });
}

export async function loadRecipeEvents(recipeId: string): Promise<RecipeEvent[]> {
    const q = query(collection(db, 'recipe-events'), where('recipeId', '==', recipeId), orderBy('at', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            recipeId: data.recipeId,
            type: data.type,
            by: data.by || '',
            at: data.at?.toDate() || new Date(),
            prompt: data.prompt,
            feedback: data.feedback,
            notes: data.notes,
            imageUrl: data.imageUrl,
            archivePath: data.archivePath,
            model: data.model,
            usedReference: data.usedReference,
            cost: data.cost,
            changes: data.changes,
            pdfUrl: data.pdfUrl,
            source: data.source,
            stepNumber: data.stepNumber,
        };
    });
}

export async function regenStepImage(
    recipeId: string,
    stepNumber: number,
    feedback?: string,
    promptMode?: 'tweak' | 'overwrite',
    model?: string,
    useReference?: boolean,
    extraReferenceUrls?: string[],
): Promise<{ downloadUrl: string; prompt: string; model: string; stepNumber: number }> {
    const fn = httpsCallable<
        { recipeId: string; stepNumber: number; feedback?: string; promptMode?: 'tweak' | 'overwrite'; model?: string; useReference?: boolean; extraReferenceUrls?: string[] },
        { success: boolean; downloadUrl: string; prompt: string; model: string; stepNumber: number }
    >(functions, 'aiRegenStepImage');
    const result = await fn({ recipeId, stepNumber, feedback, promptMode, model, useReference, extraReferenceUrls });
    clearUrlCache(recipeId);
    return result.data;
}

export function subscribeToReviews(callback: (reviews: Map<string, RecipeReview>) => void): Unsubscribe {
    const q = collection(db, 'recipe-reviews');
    return onSnapshot(q, (snap) => {
        const reviews = new Map<string, RecipeReview>();
        snap.docs.forEach(d => {
            const data = d.data();
            reviews.set(d.id, {
                recipeId: d.id,
                status: data.status,
                notes: data.notes || '',
                feedback: data.feedback || '',
                prompt: data.prompt || '',
                reviewedBy: data.reviewedBy || '',
                reviewedAt: data.reviewedAt?.toDate() || new Date(),
                generatedBy: data.generatedBy || undefined,
                generatedAt: data.generatedAt?.toDate() || undefined,
            });
        });
        callback(reviews);
    });
}

export async function uploadExtraReference(recipeId: string, file: File, index: number, namespace = 'cover'): Promise<string> {
    const storagePath = `recipes/${recipeId}/images/_temp/${namespace}-extra-reference-${index}.jpg`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return storagePath;
}

export async function regenRecipeImage(recipeId: string, feedback?: string, model?: string, useReference?: boolean, extraReferenceUrls?: string[]): Promise<{ downloadUrl: string; prompt: string; visualDescription: string; model: string; coverPath?: string }> {
    const fn = httpsCallable<{ recipeId: string; feedback?: string; model?: string; useReference?: boolean; extraReferenceUrls?: string[] }, { downloadUrl: string; prompt: string; visualDescription: string; model: string; coverPath?: string }>(functions, 'aiRegenRecipeImage');
    const result = await fn({ recipeId, feedback, model, useReference, extraReferenceUrls });
    clearUrlCache(recipeId);
    // Log who generated it on the review doc
    const user = getCurrentUser();
    if (user?.email) {
        const reviewRef = doc(db, 'recipe-reviews', recipeId);
        await setDoc(reviewRef, {
            recipeId,
            generatedBy: user.email,
            generatedAt: serverTimestamp(),
            prompt: result.data.prompt,
            feedback: feedback || '',
        }, { merge: true });
    }
    return result.data;
}

export async function listArchiveImages(recipeId: string): Promise<ArchiveImage[]> {
    const fn = httpsCallable<{ recipeId: string }, { images: ArchiveImage[] }>(functions, 'aiListArchiveImages');
    const result = await fn({ recipeId });
    return result.data.images;
}

export async function assignArchiveImage(recipeId: string, archivePath: string): Promise<{ downloadUrl: string; coverPath?: string }> {
    const fn = httpsCallable<{ recipeId: string; archivePath: string }, { downloadUrl: string; coverPath?: string }>(functions, 'aiAssignArchiveImage');
    const result = await fn({ recipeId, archivePath });
    clearUrlCache(recipeId);
    return result.data;
}

/** One cooking-mode picture: the counter for a servings count, or a doneness stage. */
export interface CookingModeImage {
    path: string;
    url: string;
    label: string;
    /** Sort order: counters by servings, then seasoned, cooking, cooked. */
    order: number;
}

const DONENESS_ORDER: Record<string, number> = { seasoned: 1, cooking: 2, cooked: 3 };

/**
 * The countertop pictures cooking mode made for a recipe, from
 * recipes/{id}/countertop/: servings-{n}.jpg and doneness-{stage}.jpg. They are
 * made the first time someone opens cooking mode, so most recipes have none.
 */
export async function listCookingModeImages(recipeId: string): Promise<CookingModeImage[]> {
    const listing = await listAll(ref(storage, `recipes/${recipeId}/countertop`));
    const images = await Promise.all(listing.items.map(async (item): Promise<CookingModeImage | null> => {
        const servings = item.name.match(/^servings-(\d+)\.(jpg|webp|png)$/);
        const stage = item.name.match(/^doneness-(seasoned|cooking|cooked)\.(jpg|webp|png)$/);
        if (!servings && !stage) return null;
        const url = await getDownloadURL(item).catch(() => '');
        if (!url) return null;
        return servings
            ? { path: item.fullPath, url, label: `Counter · ${servings[1]} servings`, order: Number(servings[1]) / 1000 }
            : { path: item.fullPath, url, label: stage![1][0].toUpperCase() + stage![1].slice(1), order: DONENESS_ORDER[stage![1]] };
    }));
    return images.filter((i): i is CookingModeImage => !!i).sort((a, b) => a.order - b.order);
}
