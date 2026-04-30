
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
import { auth } from "@/lib/firebase"
import { verifyBeforeUpdateEmail } from "firebase/auth"
import { Loader2, Mail, User } from "lucide-react"

type ProfileDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  currentEmail: string;
}

export function ProfileDialog({ isOpen, onOpenChange, currentEmail }: ProfileDialogProps) {
    const [newEmail, setNewEmail] = useState(currentEmail);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

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
                        Manage your account profile and authentication details.
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
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
