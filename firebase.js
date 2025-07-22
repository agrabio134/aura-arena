import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBoCiG-vodydm1x9HEEh-nq1wNr9ozTP68",
  authDomain: "aura-78179.firebaseapp.com",
  projectId: "aura-78179",
  storageBucket: "aura-78179.firebasestorage.app",
  messagingSenderId: "89150772902",
  appId: "1:89150772902:web:cee5a2ab45a1633d6c4667",
  measurementId: "G-KD9V2GJ1XP"
};

export async function initializeFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    getAnalytics(app);
    const db = getFirestore(app);
    const auth = getAuth(app);
    console.log("Firebase initialized successfully");
    await signInAnonymously(auth);
    console.log("Signed in anonymously");
    return db;
  } catch (e) {
    console.error("Firebase initialization error:", e);
    return null;
  }
}