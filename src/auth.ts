import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase-config';

const ALLOWED_DOMAIN = 'granatalabs.com';

let currentUser: User | null = null;
let onAuthChange: (user: User | null) => void = () => {};
let authResolved = false;

export function getCurrentUser(): User | null {
    return currentUser;
}

export function setAuthChangeHandler(handler: (user: User | null) => void) {
    onAuthChange = handler;
}

export async function initAuth() {
    // Handle redirect result first (for mobile sign-in flow)
    try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
            const email = result.user.email || '';
            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                await signOut(auth);
            }
        }
    } catch {
        // No redirect result — normal page load
    }

    // Then listen for auth state
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const email = user.email || '';
            if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
                await signOut(auth);
                currentUser = null;
                onAuthChange(null);
                if (authResolved) alert('Access denied. Only @granatalabs.com accounts are allowed.');
                authResolved = true;
                return;
            }
            currentUser = user;
        } else {
            currentUser = null;
        }
        authResolved = true;
        onAuthChange(currentUser);
    });
}

export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: ALLOWED_DOMAIN });

    // Use redirect on mobile (popup often fails), popup on desktop
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        await signInWithRedirect(auth, provider);
    } else {
        await signInWithPopup(auth, provider);
    }
}

export async function logOut() {
    await signOut(auth);
}
