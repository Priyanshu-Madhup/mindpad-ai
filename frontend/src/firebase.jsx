import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCq-Z2h8Ebv2Wumgmm3JiY4IbanmXQZS5s",
    authDomain: "mindpad-ai.firebaseapp.com",
    projectId: "mindpad-ai",
    storageBucket: "mindpad-ai.firebasestorage.app",
    messagingSenderId: "159253872071",
    appId: "1:159253872071:web:01f9907f45911d26c1ade2",
    measurementId: "G-21WDHDLLSQ"
};

const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);