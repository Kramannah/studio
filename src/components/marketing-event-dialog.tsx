
'use client';

/**
 * @fileOverview Placeholder for the Marketing Event Dialog.
 * Contents have been cleared per user request.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

type MarketingEventDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function MarketingEventDialog({ isOpen, onOpenChange }: MarketingEventDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Marketing Event</DialogTitle>
          <DialogDescription>
            This dialog is currently empty.
          </DialogDescription>
        </DialogHeader>
        <div className="py-8 text-center text-muted-foreground italic">
            Form contents removed.
        </div>
      </DialogContent>
    </Dialog>
  )
}
