

export interface ReminderProduct {
    productName?: string;
    sampleName?: string;
    quantity?: number;
    balance?: number;
}

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
  jointCallWith?: string;
  jointCallSignature?: string | null; // base64 encoded string
  dsmSignature?: string | null;
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
  reminderProducts?: ReminderProduct[];
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
  specialty?: string;
  clinic?: string;
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
  callType: 'planned' | 'unplanned';
  submittedAt?: string; 
}

export interface NonCallDay {
  id: string;
  userId: string;
  date: string; // ISO string
  reason: string;
  remarks: string;
  dayType: 'wholeday' | 'halfday-am' | 'halfday-pm';
  status: 'pending' | 'approved' | 'rejected';
}

export interface PlanningPermissionRequest {
  id: string;
  userId: string;
  weekStartDate: string; // ISO string for the Monday of the week
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string; // ISO string
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
    timeOut?: string; // ISO string
    locationType: 'inbase' | 'outbase';
    timeInPhoto?: string;
    timeOutPhoto?: string;
}

export interface TeamSummaryData {
    entries: CoverageEntry[];
    doctors: Doctor[];
    nonCallDays: NonCallDay[];
    timeLogs: TimeLog[];
}

    
