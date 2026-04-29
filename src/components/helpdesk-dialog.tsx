
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
import { Send, Info } from "lucide-react"

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

        const subject = `SFE App Support Request from ${userEmail}`;
        const body = `User: ${userEmail}\n\nConcern Description:\n${concern}\n\n---\nSent via SFE Offline App Support.`;
        const mailtoLink = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        window.location.href = mailtoLink;
        
        onOpenChange(false);
        setConcern("");
        
        toast({
            title: "Redirecting to Email",
            description: "Opening your email client to send the support request.",
        });
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
          <DialogTitle className="font-headline flex items-center gap-2">
            Contact Administrator
          </DialogTitle>
          <DialogDescription>
            Briefly describe the technical issue or concern you are experiencing. Clicking 'Send Concern' will open your default email application.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="concern" className="font-headline">Your Concern</Label>
            <Textarea 
                id="concern" 
                placeholder="e.g. My reports from Tuesday are not syncing..." 
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                rows={6}
            />
          </div>
          <div className="flex items-start gap-2 p-3 text-xs bg-muted rounded-md text-muted-foreground">
             <Info className="w-4 h-4 shrink-0 mt-0.5" />
             <p>Your logged email (${userEmail}) will be automatically included in the support request.</p>
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
