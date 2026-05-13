
"use client"

import { useQ4Allocation } from './use-q4-allocation';

// This hook is now a lightweight proxy to useQ4Allocation to share the singleton cache
export const useMarketingSamples = () => {
  const { allocations, usedQuantities, loading, refetch } = useQ4Allocation();
  
  // Map Q4Allocation back to MarketingSample format if needed, 
  // though they are identical in this app's implementation
  return { 
    marketingSamples: allocations.map(a => ({
        id: a.id,
        productGroup: a.prodGroupProdSubGroup,
        materialName: a.displayMaterialName,
        allocationQuantity: a.allocationQuantity
    })), 
    usedQuantities, 
    loading, 
    refetch 
  };
};

export const useAdminMarketingSamples = () => {
  const { addAllocationsBulk, deleteAllocationsBulk, refetch } = useQ4Allocation();

  return { 
    addMarketingSamplesBulk: async (data: any[]) => {
        const mapped = data.map(d => ({
            prodGroupProdSubGroup: d.productGroup,
            displayMaterialName: d.materialName,
            allocationQuantity: d.allocationQuantity
        }));
        return addAllocationsBulk(mapped);
    }, 
    deleteSample: async (id: string) => deleteAllocationsBulk([id]), 
    updateSample: async (id: string, data: any) => {
        // Implement single update if needed, or use bulk with one item
        return false; 
    },
    addSample: async (data: any) => {
        return addAllocationsBulk([{
            prodGroupProdSubGroup: data.productGroup,
            displayMaterialName: data.materialName,
            allocationQuantity: data.allocationQuantity
        }]);
    }
  };
};
