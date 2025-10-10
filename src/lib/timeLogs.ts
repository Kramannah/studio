// src/lib/timeLogs.ts
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "./firebase"; // adjust if your firebase config is in another folder

// Fetch all timelogs from Firestore
export async function fetchAllTimeLogs() {
  try {
    const q = query(collection(db, "timeLogs"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error fetching time logs:", error);
    throw error;
  }
}
