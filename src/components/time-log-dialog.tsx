
"use client"

import { useState, useRef, useEffect } from "react"
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
import { Camera, LogIn, LogOut, Video } from "lucide-react"
import { Label } from "./ui/label"
import Image from "next/image"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

type TimeLogDialogProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  mode: "time-in" | "time-out"
  onTimeIn?: (photo: string, locationType: "inbase" | "outbase") => void
  onTimeOut?: (photo: string) => void
}

export function TimeLogDialog({ isOpen, onOpenChange, mode, onTimeIn, onTimeOut }: TimeLogDialogProps) {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [locationType, setLocationType] = useState<"inbase" | "outbase">("inbase")
  const [hasCameraPermission, setHasCameraPermission] = useState(true)
  const [isCameraActive, setIsCameraActive] = useState(false)

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
      setIsCameraActive(false);
    }
  }

  const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasCameraPermission(true);
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setIsCameraActive(true);
    } catch (error) {
        console.error("Error accessing camera:", error);
        setHasCameraPermission(false);
    }
  }

  const resetState = () => {
    setPhoto(null);
    setIsCameraActive(false);
    setHasCameraPermission(true);
  }

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetState();
    }
  }, [isOpen]);


  const handleCapture = () => {
    const video = videoRef.current
    if (video) {
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL("image/png")
        setPhoto(dataUrl)
        stopCamera()
      }
    }
  }
  
  const handleRetake = () => {
    setPhoto(null);
    setIsCameraActive(true); // Re-activate camera view, but don't auto-start
  }

  const handleSubmit = () => {
    if (!photo) {
      toast({
        variant: "destructive",
        title: "Photo Required",
        description: "Please capture a photo as proof.",
      })
      return
    }

    if (mode === "time-in" && onTimeIn) {
      onTimeIn(photo, locationType)
    } else if (mode === "time-out" && onTimeOut) {
      onTimeOut(photo)
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {mode === "time-in" ? "Time In Confirmation" : "Time Out Confirmation"}
          </DialogTitle>
          <DialogDescription>
            Please capture a photo as proof and confirm your location if applicable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
            {photo ? (
              <Image src={photo} alt="Captured proof" layout="fill" objectFit="cover" />
            ) : isCameraActive ? (
                <>
                    <video ref={videoRef} className="h-full w-full" autoPlay muted playsInline />
                    {!hasCameraPermission && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-black/50 text-white">
                         <Alert variant="destructive">
                            <AlertTitle>Camera Access Denied</AlertTitle>
                            <AlertDescription>
                                Please enable camera permissions in your browser settings to use this feature.
                            </AlertDescription>
                        </Alert>
                    </div>
                    )}
              </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                    <Video className="w-16 h-16 text-muted-foreground mb-4" />
                    <Button onClick={startCamera}>
                        <Camera className="mr-2" />
                        Start Camera
                    </Button>
                </div>
            )}
          </div>
          <div className="flex justify-center">
            {photo ? (
                <Button variant="outline" onClick={handleRetake}>
                  Retake Photo
                </Button>
            ) : (
                isCameraActive && (
                    <Button onClick={handleCapture} disabled={!hasCameraPermission}>
                      <Camera className="mr-2" />
                      Capture Photo
                    </Button>
                )
            )}
          </div>
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
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={!photo}>
            {mode === 'time-in' ? <LogIn className="mr-2"/> : <LogOut className="mr-2"/>}
            Confirm {mode === 'time-in' ? 'Time In' : 'Time Out'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
