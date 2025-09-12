
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "hovidcoverage",
  appId: "1:321369261510:web:9c4b76565d68b8c9875ec7",
  storageBucket: "hovidcoverage.firebasestorage.app",
  apiKey: "AIzaSyCqtWu5SXQmQllqN61DM80uquFa0K06QCE",
  authDomain: "hovidcoverage.firebaseapp.com",
  messagingSenderId: "321369261510",
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db = getFirestore(app);

export { db };
