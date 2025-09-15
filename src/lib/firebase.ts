
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  projectId: "hovidcoverage",
  appId: "1:321369261510:web:9c4b76565d68b8c9875ec7",
  storageBucket: "hovidcoverage.appspot.com",
  apiKey: "AIzaSyCqtWu5SXQmQllqN61DM80uquFa0K06QCE",
  authDomain: "hovidcoverage.firebaseapp.com",
  messagingSenderId: "321369261510",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, app };
