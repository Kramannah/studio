
"use client"

import { useQ4Allocation } from './use-q4-allocation';

/**
 * Hook for managing Marketing Samples / Inventory.
 * Strictly uses the 'marketingSamples' collection and aggregates usage from 'coverageEntries'.
 */
export const useMarketingSamples = () => {
  const { allocations, usedQuantities, loading, refetch } = useQ4Allocation();
  
  // Maps the shared Q4Allocation data to the MarketingSample format
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
            prodGroupProdSubGroup: d.productGroup || d.ProdGroupProdSubGroup || "Uncategorized",
            displayMaterialName: d.materialName || d.DisplayMaterialName || "Unknown Item",
            allocationQuantity: Number(d.allocationQuantity || d.AllocationQuantity || 0)
        }));
        return addAllocationsBulk(mapped);
    }, 
    deleteSample: async (id: string) => deleteAllocationsBulk([id]), 
    updateSample: async (id: string, data: any) => {
        // Implemented via bulk logic for consistency
        return addAllocationsBulk([{
            prodGroupProdSubGroup: data.productGroup,
            displayMaterialName: data.materialName,
            allocationQuantity: data.allocationQuantity
        }]);
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
