export interface CoverageEntry {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  clinic: string;
  coverageType: 'inbase' | 'outbase';
  coverageDate: string; // Storing as ISO string
  photos: string[]; // base64 encoded strings
  signature: string | null; // base64 encoded string
  submittedAt: string; // Storing as ISO string
}

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  clinic: string;
  frequency: '1x' | '2x' | '3x' | '4x';
}

export interface Plan {
  id: string;
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  plannedDate: string; // ISO string
}
