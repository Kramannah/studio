
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { LogIn, User } from "lucide-react"
import { Label } from "./ui/label"
import { Card, CardContent } from "./ui/card"

type TimeInDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onTimeIn: (locationType: "inbase" | "outbase") => void
  userId: string
}

export function TimeInDialog({ isOpen, onOpenChange, onTimeIn, userId }: TimeInDialogProps) {
  const [locationType, setLocationType] = useState<"inbase" | "outbase">("inbase")

  const handleSubmit = () => {
    onTimeIn(locationType)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-headline">
            Time In Confirmation
          </DialogTitle>
          <DialogDescription>
            Confirm your details to start your session.
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
          <div>
            <Label htmlFor="locationType" className="font-headline">Location Type</Label>
            <Select onValueChange={(value: "inbase" | "outbase") => setLocationType(value)} defaultValue={locationType}>
              <SelectTrigger id="locationType">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inbase">In Base</SelectItem>
                <SelectItem value="outbase">Out Base</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSubmit}>
            <LogIn className="mr-2"/>
            Confirm Time In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
