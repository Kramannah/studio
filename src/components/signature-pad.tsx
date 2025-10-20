
"use client"

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Eraser, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface SignaturePadProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
  internalStateManagement?: boolean;
}

export function SignaturePad({ value, onChange, className, internalStateManagement = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [internalValue, setInternalValue] = useState<string | null | undefined>(value);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const clearCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onChange(null);
      if (internalStateManagement) {
        setInternalValue(null);
      }
    }
  }, [getCanvasContext, onChange, internalStateManagement]);
  
  const currentValue = internalStateManagement ? internalValue : value;

  useEffect(() => {
    if (internalStateManagement && value !== internalValue) {
        setInternalValue(value);
    }
  }, [value, internalStateManagement, internalValue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      if(canvas.width !== rect.width) {
        canvas.width = rect.width;
      }
      if (canvas.height !== rect.height) {
        canvas.height = className ? rect.height : 200;
      }
    } else {
        canvas.height = 200;
    }

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentValue) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = currentValue;
    }

  }, [currentValue, getCanvasContext, className]);

  const getPosition = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPosition(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current || !lastPos.current) return;

    const ctx = getCanvasContext();
    const currentPos = getPosition(e);
    if (!ctx || !currentPos) return;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();

    lastPos.current = currentPos;
  };
  
  const isCanvasBlank = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return true;
    const pixelBuffer = new Uint32Array(
        context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(pixel => pixel !== 0);
  }

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const isEmpty = isCanvasBlank(canvas);
      const finalValue = isEmpty ? null : dataUrl;
      onChange(finalValue);
      if (internalStateManagement) {
        setInternalValue(finalValue);
      }
    }
  };


  return (
    <div className={cn('relative w-full h-full', className)}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="w-full h-full bg-white rounded-md cursor-crosshair touch-none border"
      />
    </div>
  );
}


interface SignaturePadFullScreenProps {
    open: boolean;
    onClose: () => void;
    onSave: (value: string | null) => void;
    value: string | null | undefined;
}

export function SignaturePadFullScreen({ open, onClose, onSave, value }: SignaturePadFullScreenProps) {
    const [currentSignature, setCurrentSignature] = useState<string | null>(null);

    useEffect(() => {
        if(open) {
            setCurrentSignature(value || null);
        }
    }, [open, value]);

    const handleSave = () => {
        onSave(currentSignature);
        onClose();
    }
    
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="p-0 border-0 w-screen h-screen max-w-full max-h-screen rounded-none flex flex-col">
                <DialogHeader className="p-4 border-b flex-row items-center justify-between">
                    <DialogTitle>Signature</DialogTitle>
                     <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setCurrentSignature(null)}><Eraser className="mr-2" /> Clear</Button>
                        <Button onClick={handleSave}><Save className="mr-2" /> Save</Button>
                        <Button variant="outline" onClick={onClose} size="icon"><X/></Button>
                    </div>
                </DialogHeader>
                <div className="flex-1 p-4">
                    <SignaturePad 
                        value={currentSignature}
                        onChange={setCurrentSignature}
                        className="w-full h-full"
                        internalStateManagement={true}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
