"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { LogIn, LogOut, Camera, RefreshCw } from "lucide-react"
import { Label } from "./ui/label"
import Image from "next/image"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

type TimeLogDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mode: "time-in" | "time-out";
  onTimeIn?: (photo: string, locationType: "inbase" | "outbase") => void;
  onTimeOut?: (photo: string) => void;
}

export function TimeLogDialog({ isOpen, onOpenChange, mode, onTimeIn, onTimeOut }: TimeLogDialogProps) {
  const { toast } = useToast()
  const [locationType, setLocationType] = useState<"inbase" | "outbase">("inbase")
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const getCameraPermission = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
            variant: 'destructive',
            title: 'Camera Not Supported',
            description: 'Your browser does not support camera access.',
        });
        setHasCameraPermission(false);
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setHasCameraPermission(true);
    } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
            variant: 'destructive',
            title: 'Camera Access Denied',
            description: 'Please enable camera permissions in your browser settings.',
        });
    }
  }, [toast]);
  

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      getCameraPermission();
    } else {
      stopCamera();
    }
    
    return () => {
        stopCamera();
    }
  }, [isOpen, stopCamera, getCameraPermission]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    getCameraPermission();
  };


  const handleSubmit = () => {
    if (!capturedImage) {
        toast({ variant: "destructive", title: "No Photo", description: "Please capture a photo before submitting." });
        return;
    }
    if (mode === "time-in" && onTimeIn) {
      onTimeIn(capturedImage, locationType)
    } else if (mode === "time-out" && onTimeOut) {
      onTimeOut(capturedImage)
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {mode === "time-in" ? "Confirm Time In" : "Confirm Time Out"}
          </DialogTitle>
          <DialogDescription>
            {mode === "time-in" ? "Take a photo and confirm your location to time in." : "Take a photo to confirm your time out."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="relative w-full aspect-video bg-muted rounded-md overflow-hidden flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />

                {hasCameraPermission === false && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <p className="text-destructive-foreground p-4 text-center">Camera not available. Please check permissions.</p>
                    </div>
                )}
                {capturedImage && (
                    <div className="absolute inset-0">
                         <Image src={capturedImage} alt="Captured" layout="fill" objectFit="contain" />
                    </div>
                )}
                 <canvas ref={canvasRef} className="hidden" />
            </div>

            {hasCameraPermission === false && (
                <Alert variant="destructive">
                    <AlertTitle>Camera Access Required</AlertTitle>
                    <AlertDescription>
                        Please allow camera access to use this feature. You may need to grant permissions in your browser's settings.
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex gap-2">
                {capturedImage ? (
                    <Button variant="outline" onClick={handleRetake} className="w-full">
                        <RefreshCw className="mr-2" /> Retake
                    </Button>
                ) : (
                    <Button onClick={handleCapture} disabled={!hasCameraPermission} className="w-full">
                        <Camera className="mr-2" /> Capture
                    </Button>
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
           <p className="text-sm text-muted-foreground">
            Your current time will be recorded.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={!capturedImage}>
            {mode === 'time-in' ? <LogIn className="mr-2"/> : <LogOut className="mr-2"/>}
            Confirm {mode === 'time-in' ? 'Time In' : 'Time Out'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
