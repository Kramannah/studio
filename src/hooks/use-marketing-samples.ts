
"use client"

import { useState, useEffect, useCallback } from 'react';
import type { MarketingSample } from '@/lib/types';
import { useToast } from "@/hooks/use-toast";

const SAMPLES_KEY = 'sfe-offline-coverage-marketing-samples';
const USED_QUANTITIES_KEY = 'sfe-offline-coverage-used-quantities';

export const useMarketingSamples = () => {
  const { toast } = useToast();
  const [marketingSamples, setMarketingSamples] = useState<MarketingSample[]>([]);
  const [usedQuantities, setUsedQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedSamples = localStorage.getItem(SAMPLES_KEY);
        if (storedSamples) {
          setMarketingSamples(JSON.parse(storedSamples));
        }
        const storedUsedQuantities = localStorage.getItem(USED_QUANTITIES_KEY);
        if (storedUsedQuantities) {
          setUsedQuantities(JSON.parse(storedUsedQuantities));
        }
      } catch (error) {
        console.error("Failed to parse marketing samples from localStorage", error);
        toast({
          variant: 'destructive',
          title: 'Error loading data',
          description: 'Could not load your marketing sample masterlist.',
        });
      }
    }
  }, [toast]);

  const updateSamplesInStorage = (updatedSamples: MarketingSample[]) => {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(updatedSamples));
  };
  
  const updateUsedQuantitiesInStorage = (updatedQuantities: Record<string, number>) => {
    localStorage.setItem(USED_QUANTITIES_KEY, JSON.stringify(updatedQuantities));
  };

  const addMarketingSamplesBulk = useCallback((samplesData: Omit<MarketingSample, 'id'>[]) => {
    const newSamples: MarketingSample[] = samplesData.map(d => ({
        ...d,
        id: crypto.randomUUID(),
        allocationQuantity: Number(d.allocationQuantity) || 0
    }));

    setMarketingSamples(newSamples);
    updateSamplesInStorage(newSamples);
    
    // Reset usage when new list is uploaded
    setUsedQuantities({});
    updateUsedQuantitiesInStorage({});

    toast({
        title: "Upload Successful",
        description: `${newSamples.length} marketing samples have been loaded.`,
    });
  }, [toast]);

  const updateSampleUsage = useCallback((productName: string, quantity: number) => {
    setUsedQuantities(prev => {
        const newUsedQuantities = { ...prev };
        newUsedQuantities[productName] = (newUsedQuantities[productName] || 0) + quantity;
        updateUsedQuantitiesInStorage(newUsedQuantities);
        return newUsedQuantities;
    });
  }, []);

  return { marketingSamples, addMarketingSamplesBulk, usedQuantities, updateSampleUsage };
};
