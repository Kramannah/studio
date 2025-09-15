

export interface CoverageEntry {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  specialty?: string;
  clinic?: string;
  hacme?: 'YES' | 'NO';
  coverageType?: 'inbase' | 'outbase' | 'joint';
  callType?: 'planned' | 'unplanned';
  coverageDate?: string; // Storing as ISO string
  photos?: string[]; // base64 encoded strings
  signature?: string | null; // base64 encoded string
  dsmSignature?: string | null; // base64 encoded string for DSM
  jointCallWith?: 'HOS' | 'GM' | 'PM' | 'SFE';
  jointCallSignature?: string | null;
  submittedAt: string; // Storing as ISO string
  callObjective?: string;
  primaryProduct?: string;
  secondaryProduct?: string;
  primarySampleName?: string;
  primaryProductQty?: number;
  primaryProductBal?: number;
  secondarySampleName?: string;
  secondaryProductQty?: number;
  secondaryProductBal?: number;
  topicsDiscussed?: string;
  doctorsIssue?: string;
  planOfAction?: string;
  whatWentWell?: string;
  areasForImprovement?: string;
  isOffline?: boolean;
}

export interface Doctor {
  id: string;
  userId: string;
  firstName: string;
  lastName:string;
  specialty: string;
  clinic: string;
  province?: string;
  municipality?: string;
  placeOfPractice?: string;
  frequency: '1x' | '2x' | '3x' | '4x';
  hacme: 'YES' | 'NO';
}

export interface Plan {
  id: string;
  userId: string;
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  plannedDate: string; // ISO string
  submittedAt?: string; 
  callType?: 'planned' | 'unplanned';
}

export interface NonCallDay {
  id: string;
  userId: string;
  date: string; // ISO string
  reason: string;
  remarks: string;
}

export interface MarketingSample {
    id: string;
    productGroup: string;
    materialName: string;
    allocationQuantity: number;
}

export interface TimeLog {
    id: string;
    userId: string;
    timeIn: string; // ISO string
    timeOut: string | null; // ISO string
    locationType: 'inbase' | 'outbase';
}

    
