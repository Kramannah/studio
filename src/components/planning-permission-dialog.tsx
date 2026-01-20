
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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

type PlanningPermissionDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (reason: string) => Promise<boolean>;
  weekStartDate: Date;
}

export function PlanningPermissionDialog({ isOpen, onOpenChange, onConfirm, weekStartDate }: PlanningPermissionDialogProps) {
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async () => {
        if (!reason.trim()) {
            toast({
                variant: "destructive",
                title: "Reason Required",
                description: "Please provide a reason for your request.",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const success = await onConfirm(reason);
            if (success) {
                onOpenChange(false);
                setReason("");
            }
        } catch (error: any) {
            console.error("An unexpected error occurred during submission:", error);
            toast({
                variant: "destructive",
                title: "Submission Error",
                description: `An unexpected error occurred: ${error.message || 'Please try again.'}`,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!isSubmitting) {
            onOpenChange(open);
            if(!open) {
                setReason("");
                setIsSubmitting(false);
            }
        }
    }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Request Planning Permission</DialogTitle>
          <DialogDescription>
            You are requesting permission to plan calls for the week of {format(weekStartDate, "PPP")}. Please provide a reason for not planning in advance.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea 
                id="reason" 
                placeholder="Type your reason here..." 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isSubmitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
