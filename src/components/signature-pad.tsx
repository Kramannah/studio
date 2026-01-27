"use client"

import React, { useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { Eraser } from 'lucide-react';

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

  const clearCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onChange(null);
    }
  }, [getCanvasContext, onChange]);

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
        // Use a fixed height if no height is provided by classname
        canvas.height = parent.clientHeight > 0 ? parent.clientHeight : 200;
      }
    }

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (value) {
      const img = new Image();
      img.onload = () => {
        // Make sure to draw on a clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    const pixelBuffer = new Uint32Array(
      context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(pixel => pixel !== 0);
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
        // Use JPEG with quality 0.5 for performance
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        onChange(dataUrl);
      }
    }
  };

  return (
    <div className={cn('relative w-full', className)}>
      <div className="w-full h-48 border rounded-md">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="bg-white rounded-md cursor-crosshair touch-none w-full h-full"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={clearCanvas}
        className="mt-2"
      >
        <Eraser className="mr-2 h-4 w-4" /> Clear
      </Button>
    </div>
  );
}
