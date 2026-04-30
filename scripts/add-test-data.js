
import { db } from "@/lib/firebase";
import { collection, writeBatch, doc } from "firebase/firestore";

/**
 * SEED DATA ENGINE
 * This script generates a comprehensive set of dummy data for the test environment.
 * It populates: Doctors, Marketing Samples, Coverage Reports, and Plans.
 */

export async function seedTestData(userId) {
  if (!userId) return { success: false, message: "No User ID provided." };

  const batch = writeBatch(db);
  const now = new Date();

  // 1. Seed Marketing Samples
  const samples = [
    { productGroup: "Tocovid - Tocovid 200mg", materialName: "Tocovid 200mg 10s Sample", allocationQuantity: 100 },
    { productGroup: "CNS/Pain - Biovid Forte", materialName: "Biovid Forte Promo Pack", allocationQuantity: 50 },
    { productGroup: "Gastro - Hovizol", materialName: "Hovizol 20mg Starter Kit", allocationQuantity: 75 },
    { productGroup: "Endocrine - Dapavid", materialName: "Dapavid 10mg Patient Sample", allocationQuantity: 40 },
    { productGroup: "Tocovid - Tocovid Vitality", materialName: "Vitality Energy Drink Sample", allocationQuantity: 200 },
  ];

  samples.forEach(s => {
    const ref = doc(collection(db, "marketingSamples"));
    batch.set(ref, s);
  });

  // 2. Seed Doctors
  const specialties = ["Cardiology", "Dermatology", "Gastroenterology", "Internal Medicine", "Pediatrics"];
  const doctorIds = [];
  
  for (let i = 1; i <= 15; i++) {
    const docId = `doc_seed_${i}`;
    doctorIds.push(docId);
    const docRef = doc(db, "doctors", docId);
    batch.set(docRef, {
      userId,
      firstName: `SeedDoctor_${i}`,
      lastName: "Test",
      specialty: specialties[i % specialties.length],
      clinic: `Community Clinic ${i}`,
      municipality: "Quezon City",
      province: "Metro Manila",
      frequency: i % 3 === 0 ? "3x" : "2x",
      hacme: i % 4 === 0 ? "YES" : "NO",
      hcpCode: `HCP-${1000 + i}`
    });
  }

  // 3. Seed Coverage Reports (50 entries for pagination testing)
  for (let i = 1; i <= 50; i++) {
    const reportRef = doc(collection(db, "coverageEntries"));
    const reportDate = new Date();
    reportDate.setDate(now.getDate() - (i % 25)); // Spread reports across 25 days

    batch.set(reportRef, {
      userId,
      firstName: `SeedDoctor_${(i % 15) + 1}`,
      lastName: "Test",
      specialty: specialties[i % specialties.length],
      clinic: `Community Clinic ${(i % 15) + 1}`,
      coverageDate: reportDate.toISOString(),
      submittedAt: reportDate.toISOString(),
      coverageType: i % 3 === 0 ? "outbase" : "inbase",
      callType: "planned",
      primaryProduct: samples[i % samples.length].productGroup,
      primarySampleName: samples[i % samples.length].materialName,
      primaryProductQty: (i % 3) + 1,
      callObjective: "Introduce new clinical studies",
      planOfAction: "Schedule follow-up next month",
      signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" // Tiny dummy pixel
    });
  }

  try {
    await batch.commit();
    return { success: true, message: "Test database seeded successfully!" };
  } catch (error) {
    console.error("Seeding failed:", error);
    return { success: false, message: "Error seeding database." };
  }
}
