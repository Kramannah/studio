
"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LogOut, User } from "lucide-react"
import { Label } from "./ui/label"
import { Card, CardContent } from "./ui/card"

type TimeOutDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onTimeOut: () => void
  userId: string
}

export function TimeOutDialog({ isOpen, onOpenChange, onTimeOut, userId }: TimeOutDialogProps) {
  
  const handleSubmit = () => {
    onTimeOut();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-headline">
            Time Out Confirmation
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to end your session?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label className="font-headline">Your Unique ID</Label>
                 <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-4">
                            <User className="w-6 h-6 text-primary"/>
                            <p className="font-mono text-lg">{userId}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={handleSubmit}>
            <LogOut className="mr-2"/>
            Confirm Time Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
