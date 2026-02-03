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

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!canvas || !ctx) return;

    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      // Ensure we have actual dimensions before initializing
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Set a solid white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (value) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = value;
        }
      }
    }
  }, [value, getCanvasContext]);

  useEffect(() => {
    // Initial load
    initializeCanvas();

    // Use a small delay to handle dialog opening animations
    const timer = setTimeout(initializeCanvas, 100);

    // Watch for window resizes
    window.addEventListener('resize', initializeCanvas);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', initializeCanvas);
    };
  }, [initializeCanvas]);

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
    
    // Create a small hidden canvas to compare if it's still pure white
    // This is faster than comparing full resolution strings
    const pixelData = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixelData.length; i += 4) {
      // Check if any pixel is not white (255, 255, 255)
      if (pixelData[i] !== 255 || pixelData[i+1] !== 255 || pixelData[i+2] !== 255) {
        return false;
      }
    }
    return true;
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
        // High compression for fast syncing
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
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
