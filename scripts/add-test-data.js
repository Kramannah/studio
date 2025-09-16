
// This is an example script to add a test time log entry to your Firestore database.
// You will need to configure your environment to run this against your Firebase project.

import { getFirestore, collection, addDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Note: This assumes you have already initialized Firebase in your script's entry point.
const db = getFirestore();
const auth = getAuth();

/**
 * Adds a single, correctly formatted time log entry to the 'timeLogs' collection in Firestore.
 * The application is designed to read from 'timeLogs' with the specified structure.
 * Using a different collection or structure will result in data not appearing in the app.
 */
async function addTestTimeLog() {
  const user = auth.currentUser;
  if (!user) {
    console.error("User not authenticated. Please log in to run this script.");
    return;
  }

  console.log(`Adding test time log for user: ${user.uid}`);

  try {
    const docRef = await addDoc(collection(db, "timeLogs"), {
      userId: user.uid,
      timeIn: new Date("2025-09-16T08:15:00Z").toISOString(),
      timeOut: new Date("2025-09-16T17:30:00Z").toISOString(),
      locationType: "inbase" // Note: The field is 'locationType', not 'location'.
    });
    console.log("Test time log successfully added with ID: ", docRef.id);
  } catch (error) {
    console.error("Error adding test document: ", error);
  }
}

// To use this, you would call addTestTimeLog() after a user is authenticated.
// e.g., onAuthStateChanged(auth, (user) => { if (user) { addTestTimeLog(); } });

