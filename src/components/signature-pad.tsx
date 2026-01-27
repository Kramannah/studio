"use client"

import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
}

export function SignaturePad({ value, onChange, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    // Adjust canvas size to its container
    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      if (canvas.width !== rect.width) {
        canvas.width = rect.width;
      }
      if (canvas.height !== rect.height) {
        canvas.height = parent.clientHeight > 0 ? parent.clientHeight : 200;
      }
    }

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Set a white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);


    if (value) {
      const img = new Image();
      img.onload = () => {
        // Draw the saved signature over the white background
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [value, getCanvasContext]);

  const getPosition = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const touch = 'touches' in e ? e.touches[0] : null;

    return {
      x: (touch ? touch.clientX : (e as MouseEvent).clientX) - rect.left,
      y: (touch ? touch.clientY : (e as MouseEvent).clientY) - rect.top,
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
    
    // Create a blank canvas with a white background to compare against
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    const blankCtx = blank.getContext('2d');
    if(!blankCtx) return true;
    blankCtx.fillStyle = 'white';
    blankCtx.fillRect(0,0,blank.width, blank.height);

    return canvas.toDataURL() === blank.toDataURL();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      if (isCanvasBlank(canvas)) {
        onChange(null);
      } else {
        // Use JPEG with quality 0.5 for performance and to enforce a background
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        onChange(dataUrl);
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
          className="rounded-md cursor-crosshair touch-none w-full h-full"
        />
    </div>
  );
}
