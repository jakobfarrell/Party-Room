
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-database.js";

// Your Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyCKN0SBbf0R8jHqNWSLTlM-XQqYKq3x4rI",
    authDomain: "party-room-e8e3a.firebaseapp.com",
    projectId: "party-room-e8e3a",
    storageBucket: "party-room-e8e3a.firebasestorage.app",
    messagingSenderId: "184336197621",
    appId: "1:184336197621:web:78dbf4f07d5c0723ad62bc",
    databaseURL: "https://party-room-e8e3a-default-rtdb.firebaseio.com/",
    measurementId: "G-8J1JZQSVFY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const database = getDatabase(app);

export default app;
