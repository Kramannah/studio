"use client"

import { SignaturePad } from "./signature-pad"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"
import { useState, useEffect } from "react"
import { Eraser, Save } from "lucide-react"

type SignatureDialogProps = {
    isOpen: boolean
    onOpenChange: (isOpen: boolean) => void
    onSave: (signature: string | null) => void
    initialSignature: string | null | undefined
    title?: string;
}

export function SignatureDialog({ isOpen, onOpenChange, onSave, initialSignature, title = "Provide Signature" }: SignatureDialogProps) {
    const [signature, setSignature] = useState<string | null>(null)

    useEffect(() => {
        // Only set the signature when the dialog opens
        if (isOpen) {
            setSignature(initialSignature || null)
        }
    }, [isOpen, initialSignature])

    const handleSave = () => {
        onSave(signature)
        onOpenChange(false)
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle className="font-headline">{title}</DialogTitle>
                    <DialogDescription>Draw the signature in the box below.</DialogDescription>
                </DialogHeader>
                <div className="flex-grow p-4 bg-muted">
                    <div className="w-full h-full bg-white rounded-md">
                         <SignaturePad value={signature} onChange={setSignature} />
                    </div>
                </div>
                <DialogFooter className="p-4 border-t bg-background">
                    <Button variant="ghost" onClick={() => setSignature(null)}>
                        <Eraser className="mr-2" /> Clear
                    </Button>
                    <Button onClick={handleSave}>
                        <Save className="mr-2" /> Use this signature
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
