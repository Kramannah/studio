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
