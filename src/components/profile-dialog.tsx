
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
                // verifyBeforeUpdateEmail is the recommended way to update emails in Firebase v10+
                await verifyBeforeUpdateEmail(user, newEmail);
                toast({
                    title: "Verification Sent",
                    description: `A verification link has been sent to ${newEmail}. Please check your inbox and verify the address before logging in again with the new email.`,
                });
                onOpenChange(false);
            }
        } catch (error: any) {
            console.error("Failed to update email:", error);
            let message = "Could not update email. Please try again later.";
            
            if (error.code === 'auth/requires-recent-login') {
                message = "For security reasons, please log out and sign back in before attempting to change your email.";
            } else if (error.code === 'auth/invalid-email') {
                message = "The email address is invalid.";
            } else if (error.code === 'auth/email-already-in-use') {
                message = "This email address is already registered to another account.";
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
                        Update your login email address. You will receive a verification link to confirm the change.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid w-full items-center gap-1.5">
                        <Label htmlFor="email">Email Address</Label>
                        <Input 
                            id="email" 
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        Note: Changing your email will require you to verify the new address before your next login.
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Update Email
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
