
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { useToast } from "@/hooks/use-toast"
import { auth, db } from "@/lib/firebase"
import { verifyBeforeUpdateEmail } from "firebase/auth"
import { Loader2, Mail, User, DatabaseZap, AlertTriangle } from "lucide-react"
import { collection, addDoc, writeBatch, doc } from "firebase/firestore"
import { addDays, startOfWeek } from "date-fns"

type ProfileDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  currentEmail: string;
}

export function ProfileDialog({ isOpen, onOpenChange, currentEmail }: ProfileDialogProps) {
    const [newEmail, setNewEmail] = useState(currentEmail);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const { toast } = useToast();

    const handleSeedData = async () => {
        const user = auth.currentUser;
        if (!user) return;

        setIsSeeding(true);
        try {
            const batch = writeBatch(db);
            const doctorsColl = collection(db, "doctors");
            const plansColl = collection(db, "plans");

            // 1. Create Sample Doctors
            const sampleDoctors = [
                { firstName: "Maria", lastName: "Santos", specialty: "Cardiology", clinic: "St. Lukes", frequency: "3x", municipality: "Quezon City", province: "Metro Manila", hacme: "YES", userId: user.uid },
                { firstName: "Juan", lastName: "Dela Cruz", specialty: "Pediatrics", clinic: "Makati Med", frequency: "2x", municipality: "Makati", province: "Metro Manila", hacme: "NO", userId: user.uid },
                { firstName: "Elena", lastName: "Reyes", specialty: "Internal Medicine", clinic: "Asian Hospital", frequency: "4x", municipality: "Muntinlupa", province: "Metro Manila", hacme: "YES", userId: user.uid },
                { firstName: "Roberto", lastName: "Gomez", specialty: "Dermatology", clinic: "VMC", frequency: "1x", municipality: "Pasig", province: "Metro Manila", hacme: "NO", userId: user.uid },
            ];

            const createdDoctorIds: { id: string, first: string, last: string }[] = [];

            for (const docData of sampleDoctors) {
                const docRef = doc(doctorsColl);
                batch.set(docRef, docData);
                createdDoctorIds.push({ id: docRef.id, first: docData.firstName, last: docData.lastName });
            }

            // 2. Plot Visits (Plans) across this week
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            
            createdDoctorIds.forEach((doctor, index) => {
                // Plot two visits for each doctor on different days
                [0, 2].forEach(dayOffset => {
                    const planRef = doc(plansColl);
                    batch.set(planRef, {
                        userId: user.uid,
                        doctorId: doctor.id,
                        doctorFirstName: doctor.first,
                        doctorLastName: doctor.last,
                        plannedDate: addDays(weekStart, index + dayOffset).toISOString(),
                        callType: 'planned'
                    });
                });
            });

            await batch.commit();
            
            toast({
                title: "Data Seeded Successfully",
                description: "Sample doctors and plotted visits have been added to your account.",
            });
            onOpenChange(false);
        } catch (error: any) {
            console.error("Seeding failed:", error);
            toast({
                variant: "destructive",
                title: "Seeding Failed",
                description: error.message || "An error occurred while generating sample data.",
            });
        } finally {
            setIsSeeding(false);
        }
    };

    const handleSubmit = async () => {
        if (!newEmail.trim() || newEmail === currentEmail) {
            onOpenChange(false);
            return;
        }

        setIsSubmitting(true);
        try {
            const user = auth.currentUser;
            if (user) {
                await verifyBeforeUpdateEmail(user, newEmail);
                toast({
                    title: "Verification Sent",
                    description: `A verification link has been sent to ${newEmail}. Please verify before your next login.`,
                });
                onOpenChange(false);
            }
        } catch (error: any) {
            console.error("Failed to update email:", error);
            let message = "Could not update email. Please try again later.";
            
            if (error.code === 'auth/requires-recent-login') {
                message = "For security reasons, please log out and sign back in before attempting to change your email.";
            }

            toast({
                variant: "destructive",
                title: "Update Failed",
                description: message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="font-headline flex items-center gap-2">
                        <User className="w-5 h-5" />
                        Account Settings
                    </DialogTitle>
                    <DialogDescription>
                        Manage your account profile and test data.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="email">Email Address</Label>
                        <Input 
                            id="email" 
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            disabled={isSubmitting}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Note: Changing your email requires verification before your next login.
                        </p>
                        <Button onClick={handleSubmit} disabled={isSubmitting || newEmail === currentEmail} className="mt-2">
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                            Update Email
                        </Button>
                    </div>
                    
                    <div className="pt-4 border-t space-y-3">
                        <div>
                            <Label className="text-primary font-bold">Developer Tools</Label>
                            <p className="text-xs text-muted-foreground">Add sample doctors and "plotted" visits to this account for testing.</p>
                        </div>
                        
                        <div className="bg-destructive/10 p-3 rounded-md flex items-start gap-2 border border-destructive/20">
                            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-[10px] text-destructive leading-tight font-medium">
                                <strong>WARNING:</strong> This action writes directly to the live Firebase database. Use only for initial testing or demonstration.
                            </p>
                        </div>

                        <Button 
                            variant="outline" 
                            className="w-full border-dashed border-primary/50 text-primary hover:bg-primary/5" 
                            onClick={handleSeedData}
                            disabled={isSeeding}
                        >
                            {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
                            Seed Test Plotted Visits
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting || isSeeding}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
