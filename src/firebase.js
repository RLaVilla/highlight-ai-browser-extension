// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB26ZBlJKJiSrDG3ZeIgIwBCR_gaYGluZA",
  authDomain: "homework-extension.firebaseapp.com",
  projectId: "homework-extension",
  storageBucket: "homework-extension.firebasestorage.app",
  messagingSenderId: "746557303617",
  appId: "1:746557303617:web:d0b38d5f001d562d9a0fc0",
  measurementId: "G-9Y6JT2QGTY",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// User Analytics Class
class UserAnalytics {
  constructor() {
    this.userId = null;
    this.isInitialized = false;
    this.userDoc = null;
  }

  async init() {
    if (this.isInitialized) return;

    try {
      // Sign in anonymously
      const userCredential = await signInAnonymously(auth);
      this.userId = userCredential.user.uid;
      console.log("Firebase user initialized:", this.userId);

      // Create or get user document
      await this.createOrUpdateUser();
      this.isInitialized = true;
    } catch (error) {
      console.error("Firebase initialization error:", error);
    }
  }

  async createOrUpdateUser() {
    if (!this.userId) return;

    const userRef = doc(db, "users", this.userId);
    const userSnap = await getDoc(userRef);
    const today = new Date().toISOString().split("T")[0];

    if (!userSnap.exists()) {
      // New user - create document
      const newUser = {
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        totalQuestions: 0,
        questionsToday: 0,
        lastQuestionDate: today,
        textHighlightCount: 0,
        imageDropCount: 0,
        manualSearchCount: 0,
        aiRequestCount: 0,
        cheggRequestCount: 0,
        quizletRequestCount: 0,
        googleRequestCount: 0,
        autoAskEnabled: true,
        preferredSource: "AI",
        isPremium: false,
        dailyLimit: 1000,
        hasHitLimit: false,
      };

      await setDoc(userRef, newUser);
      this.userDoc = newUser;
      console.log("New user created");
    } else {
      // Existing user - update last active AND check if we need to update limit
      const userData = userSnap.data();
      const updates = { lastActive: serverTimestamp() };

      // Update limit for existing users if needed (for switching between free/paid modes)
      if (userData.dailyLimit !== 1000) {
        // Change this number when switching modes
        updates.dailyLimit = 1000; // Change this to 10 when going to paid mode
        console.log(`Updating user limit from ${userData.dailyLimit} to 1000`);
      }

      await updateDoc(userRef, updates);
      this.userDoc = { ...userData, ...updates };
      console.log("Existing user updated");
    }
  }

  async updateSearchCounter(source) {
    if (!this.userId) {
      await this.init();
    }

    const userRef = doc(db, "users", this.userId);
    const updates = { lastActive: serverTimestamp() };

    // Update the appropriate counter
    if (source === "Google") updates.googleRequestCount = increment(1);
    if (source === "Chegg") updates.cheggRequestCount = increment(1);
    if (source === "Quizlet") updates.quizletRequestCount = increment(1);

    await updateDoc(userRef, updates);
  }

  async checkDailyLimit() {
    if (!this.userId || !this.userDoc) {
      await this.init();
    }

    const userRef = doc(db, "users", this.userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data();

    if (userData.isPremium) {
      return { canAsk: true, remaining: -1, total: -1 }; // Unlimited
    }

    const today = new Date().toISOString().split("T")[0];
    let questionsToday = userData.questionsToday || 0;

    // Reset daily counter if it's a new day
    if (userData.lastQuestionDate !== today) {
      questionsToday = 0;
      await updateDoc(userRef, {
        questionsToday: 0,
        lastQuestionDate: today,
        hasHitLimit: false,
      });
    }

    const remaining = userData.dailyLimit - questionsToday;
    return {
      canAsk: remaining > 0,
      remaining: Math.max(0, remaining),
      total: userData.dailyLimit,
    };
  }

  async trackQuestion(source, method, website, questionText) {
    if (!this.userId) {
      await this.init();
    }

    const userRef = doc(db, "users", this.userId);
    const today = new Date().toISOString().split("T")[0];

    // Update user counters
    const updates = {
      totalQuestions: increment(1),
      questionsToday: increment(1),
      lastQuestionDate: today,
      lastActive: serverTimestamp(),
      hasHitLimit: false,
    };

    // Update method counters
    if (method === "text_highlight") updates.textHighlightCount = increment(1);
    if (method === "image_drop") updates.imageDropCount = increment(1);
    if (method === "manual") updates.manualSearchCount = increment(1);

    // Update source counters
    if (source === "AI") updates.aiRequestCount = increment(1);
    if (source === "Chegg") updates.cheggRequestCount = increment(1);
    if (source === "Quizlet") updates.quizletRequestCount = increment(1);
    if (source === "Google") updates.googleRequestCount = increment(1);

    await updateDoc(userRef, updates);

    // Track detailed event (optional - for advanced analytics)
    await this.trackEvent("question_asked", {
      source,
      method,
      website,
      questionLength: questionText?.length || 0,
    });

    console.log(`Question tracked: ${source} via ${method}`);
  }

  async trackEvent(eventType, data) {
    if (!this.userId) return;

    // You can add this later for detailed analytics
    // For now, we'll just log it
    console.log(`Event: ${eventType}`, data);
  }

  async getUserData() {
    if (!this.userId) {
      await this.init();
    }

    const userRef = doc(db, "users", this.userId);
    const userSnap = await getDoc(userRef);
    return userSnap.data();
  }
}

// Export singleton instance
export const analytics = new UserAnalytics();

// Export Firebase services if needed elsewhere
export { auth, db };
