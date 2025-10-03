
"use client"

import { useState, useEffect, useCallback } from "react"
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
import { useToast } from "@/hooks/use-toast"
import { LogIn, LogOut } from "lucide-react"
import { Label } from "./ui/label"

type TimeLogDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  mode: "time-in" | "time-out"
  onTimeIn?: (locationType: "inbase" | "outbase") => void
  onTimeOut?: () => void
}

export function TimeLogDialog({ isOpen, onOpenChange, mode, onTimeIn, onTimeOut }: TimeLogDialogProps) {
  const { toast } = useToast()
  const [locationType, setLocationType] = useState<"inbase" | "outbase">("inbase")

  const handleSubmit = () => {
    if (mode === "time-in" && onTimeIn) {
      onTimeIn(locationType)
    } else if (mode === "time-out" && onTimeOut) {
      onTimeOut()
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {mode === "time-in" ? "Confirm Time In" : "Confirm Time Out"}
          </DialogTitle>
          <DialogDescription>
            {mode === "time-in" ? "Please confirm your location type and time in." : "Please confirm your time out."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {mode === "time-in" && (
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
          )}
           <p className="text-sm text-muted-foreground">
            Your current time will be recorded.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSubmit}>
            {mode === 'time-in' ? <LogIn className="mr-2"/> : <LogOut className="mr-2"/>}
            Confirm {mode === 'time-in' ? 'Time In' : 'Time Out'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
