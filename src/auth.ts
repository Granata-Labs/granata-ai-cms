import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase-config';

let currentUser: User | null = null;
let onAuthChange: (user: User | null) => void = () => {};

export function getCurrentUser(): User | null {
    return currentUser;
}

export function setAuthChangeHandler(handler: (user: User | null) => void) {
    onAuthChange = handler;
}

export function initAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const allowed = await checkWhitelist(user.email || '');
            if (!allowed) {
                await signOut(auth);
                currentUser = null;
                onAuthChange(null);
                alert('Access denied. Your account is not on the whitelist.');
                return;
            }
            currentUser = user;
        } else {
            currentUser = null;
        }
        onAuthChange(currentUser);
    });
}

async function checkWhitelist(email: string): Promise<boolean> {
    if (!email) return false;
    // Check admin-portal whitelist (same as granata-labs-admin)
    const whitelistRef = doc(db, 'admin-portal', 'whitelist');
    const whitelistDoc = await getDoc(whitelistRef);
    if (!whitelistDoc.exists()) return false;
    const data = whitelistDoc.data();
    return !!data?.users?.[email];
}

export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'granatalabs.com' });
    await signInWithPopup(auth, provider);
}

export async function logOut() {
    await signOut(auth);
}
