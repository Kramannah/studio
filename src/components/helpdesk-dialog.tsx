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
import { useToast } from "@/hooks/use-toast"
import { Loader2, Send } from "lucide-react"

type HelpdeskDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  adminEmail: string;
  userEmail: string;
}

export function HelpdeskDialog({ isOpen, onOpenChange, adminEmail, userEmail }: HelpdeskDialogProps) {
    const [concern, setConcern] = useState("");
    const { toast } = useToast();

    const handleSubmit = () => {
        if (!concern.trim()) {
            toast({
                variant: "destructive",
                title: "Message Required",
                description: "Please describe your concern before sending.",
            });
            return;
        }

        const subject = `Helpdesk Request from ${userEmail}`;
        const body = `User: ${userEmail}\n\nConcern:\n${concern}`;
        const mailtoLink = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        window.location.href = mailtoLink;
        
        onOpenChange(false);
        setConcern("");
    };

    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if(!open) {
            setConcern("");
        }
    }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Contact Admin</DialogTitle>
          <DialogDescription>
            Describe your issue below. Clicking 'Send' will open your default email client to send the message.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="concern">Your Concern</Label>
            <Textarea 
                id="concern" 
                placeholder="Please provide details about the issue you are facing..." 
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>
            <Send className="mr-2 h-4 w-4" />
            Send Concern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
