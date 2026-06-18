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
  migrationStatus?: 'optimized';
}

export interface Doctor {
  id: string;
  userId: string;
  firstName: string;
  lastName:string;
  specialty?: string;
  clinic?: string;
  hcpCode?: string;
  coverageType?: 'inbase' | 'outbase';
  province?: string;
  municipality?: string;
  placeOfPractice?: string;
  frequency: '1x' | '2x' | '3x' | '4x';
  hacme: 'YES' | 'NO';
  dapavid?: string;
  hofovir?: string;
  inox?: string;
  irinovid?: string;
  ondavid?: string;
  ricamTablet?: string;
  tocovid100mg?: string;
  tocovid200mg?: string;
  tocovidVitality?: string;
  virestCream?: string;
  virestTab?: string;
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

export interface Q4Allocation {
    id: string;
    prodGroupProdSubGroup: string;
    displayMaterialName: string;
    allocationQuantity: number;
    quarter?: 'Q3' | 'Q4';
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

export interface UserProfile {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email?: string;
    code?: string;
    managerId?: string;
    role?: 'Admin' | 'Manager' | 'PMR' | 'Marketing' | 'HR';
    updatedAt: string;
}

export interface AdminData {
    allEntries: CoverageEntry[];
    allDoctors: Doctor[];
    allPlans: Plan[];
    allNonCallDays: NonCallDay[];
    allTimeLogs: TimeLog[];
    allMarketingSamples: MarketingSample[];
    allPlanningRequests: PlanningPermissionRequest[];
    q4Allocations: Q4Allocation[];
}