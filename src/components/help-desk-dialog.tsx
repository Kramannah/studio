"use client"

import { useState, useRef } from "react"
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
import { Loader2, Send, Upload } from "lucide-react"
import { Input } from "./ui/input"

type HelpdeskDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  adminEmail: string;
  userEmail: string;
}

export function HelpdeskDialog({ isOpen, onOpenChange, adminEmail, userEmail }: HelpdeskDialogProps) {
    const [concern, setConcern] = useState("");
    const [attachment, setAttachment] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setAttachment(e.target.files[0]);
        } else {
            setAttachment(null);
        }
    }

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
        let body = `User: ${userEmail}\n\nConcern:\n${concern}`;

        if (attachment) {
            body += `\n\n---
[Reminder: Please manually attach the file named "${attachment.name}" to this email before sending.]`;
        }

        const mailtoLink = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        window.location.href = mailtoLink;
        
        onOpenChange(false);
        setConcern("");
        setAttachment(null);
    };

    const handleOpenChange = (open: boolean) => {
        onOpenChange(open);
        if(!open) {
            setConcern("");
            setAttachment(null);
        }
    }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline">Contact Admin</DialogTitle>
          <DialogDescription>
            Describe your issue below. You can also select a file to attach. Clicking 'Send' will open your default email client.
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
           <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="attachment">Attach File (Optional)</Label>
            <Input 
                id="attachment" 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
            />
            {attachment && <p className="text-sm text-muted-foreground">Selected: {attachment.name}</p>}
            <p className="text-xs text-muted-foreground">Note: You will need to manually attach the file in your email client.</p>
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
