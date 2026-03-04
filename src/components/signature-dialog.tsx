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
            <DialogContent className="p-0 gap-0 flex flex-col w-screen h-[100dvh] max-w-none top-0 left-0 translate-x-0 translate-y-0 rounded-none border-none overflow-hidden z-[100]">
                <DialogHeader className="p-4 border-b bg-background flex-shrink-0">
                    <DialogTitle className="font-headline">{title}</DialogTitle>
                    <DialogDescription>Draw the signature in the box below.</DialogDescription>
                </DialogHeader>
                <div className="flex-grow p-4 bg-muted overflow-hidden">
                    <div className="w-full h-full bg-white rounded-md relative shadow-inner overflow-hidden">
                         <SignaturePad value={signature} onChange={setSignature} />
                    </div>
                </div>
                <DialogFooter className="p-4 border-t bg-background flex-shrink-0 flex flex-row gap-4 justify-between sm:justify-between items-center sticky bottom-0">
                    <Button variant="outline" onClick={() => setSignature(null)} className="flex-1 font-headline">
                        <Eraser className="mr-2 h-4 w-4" /> Clear
                    </Button>
                    <Button onClick={handleSave} className="flex-1 font-headline">
                        <Save className="mr-2 h-4 w-4" /> Save Signature
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
