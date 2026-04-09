import { collection, getDocs, doc, setDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase-config';
import { getCurrentUser } from './auth';
import type { Recipe, RecipeReview } from './types';

// Cache for storage download URLs
const urlCache = new Map<string, string>();

export async function getImageUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    const cleanPath = storagePath.startsWith('/') ? storagePath.substring(1) : storagePath;
    if (urlCache.has(cleanPath)) return urlCache.get(cleanPath)!;
    try {
        const storageRef = ref(storage, cleanPath);
        const url = await getDownloadURL(storageRef);
        urlCache.set(cleanPath, url);
        return url;
    } catch {
        return null;
    }
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
        ingredients: (d.data().ingredients || []).map((i: any) => ({ name: i.name, quantity: i.quantity })),
        directions: (d.data().directions || []).map((dir: any) => ({ step: dir.step, description: dir.description })),
        assets: d.data().assets || [],
    }));
}

export async function setReview(recipeId: string, status: 'approved' | 'flagged', notes: string = '') {
    const user = getCurrentUser();
    if (!user) return;
    const reviewRef = doc(db, 'recipe-reviews', recipeId);
    await setDoc(reviewRef, {
        recipeId,
        status,
        notes,
        reviewedBy: user.email,
        reviewedAt: serverTimestamp(),
        updatedBy: user.email,
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

export async function clearReview(recipeId: string) {
    const reviewRef = doc(db, 'recipe-reviews', recipeId);
    await deleteDoc(reviewRef);
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
                reviewedBy: data.reviewedBy || '',
                reviewedAt: data.reviewedAt?.toDate() || new Date(),
                updatedBy: data.updatedBy || '',
                updatedAt: data.updatedAt?.toDate() || new Date(),
            });
        });
        callback(reviews);
    });
}
