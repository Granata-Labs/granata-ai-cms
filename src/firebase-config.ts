import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyCT_8DPG1i-IW9VrbzTKywKJmPh_lFOvbU",
    authDomain: "granata-ai.firebaseapp.com",
    projectId: "granata-ai",
    storageBucket: "granata-ai.appspot.com",
    messagingSenderId: "505743521090",
    appId: "1:505743521090:web:001c1fceec99559cff84db",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
