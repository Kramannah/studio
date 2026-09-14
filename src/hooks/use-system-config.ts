
'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { uploadFileToStorage, deleteStorageFile } from '@/lib/storage-utils';
import type { SystemConfig } from '@/lib/types';
import { useToast } from './use-toast';

/**
 * Hook for managing system-wide configurations, such as export templates.
 */
export function useSystemConfig() {
    const [planningTemplate, setPlanningTemplate] = useState<SystemConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchConfig = useCallback(async () => {
        if (!db) return;
        setLoading(true);
        try {
            const docRef = doc(db, "systemConfig", "planningTemplate");
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                setPlanningTemplate({ id: snap.id, ...snap.data() } as SystemConfig);
            } else {
                setPlanningTemplate(null);
            }
        } catch (error) {
            console.error("Error fetching system config:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const uploadTemplate = async (file: File) => {
        if (!db) return false;
        
        try {
            // 1. Delete old file if exists
            if (planningTemplate?.fileUrl) {
                await deleteStorageFile(planningTemplate.fileUrl);
            }

            // 2. Upload new file
            const path = `system/templates/planning_template_${Date.now()}_${file.name}`;
            const url = await uploadFileToStorage(file, path);

            // 3. Update Firestore
            const configData = {
                type: 'planning_export',
                fileUrl: url,
                fileName: file.name,
                updatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, "systemConfig", "planningTemplate"), configData, { merge: true });
            
            setPlanningTemplate({ id: "planningTemplate", ...configData });
            toast({ title: "Template Uploaded", description: "The system will now use this file for Call Planning exports." });
            return true;
        } catch (error) {
            console.error("Template upload failed:", error);
            toast({ variant: "destructive", title: "Upload Failed", description: "Could not save the template to the server." });
            return false;
        }
    };

    const deleteTemplate = async () => {
        if (!db || !planningTemplate) return false;

        try {
            // 1. Delete from Storage
            await deleteStorageFile(planningTemplate.fileUrl);

            // 2. Delete from Firestore
            await deleteDoc(doc(db, "systemConfig", "planningTemplate"));

            setPlanningTemplate(null);
            toast({ title: "Template Removed", description: "Export has been reverted to standard format." });
            return true;
        } catch (error) {
            console.error("Template deletion failed:", error);
            toast({ variant: "destructive", title: "Deletion Failed", description: "Could not remove the template." });
            return false;
        }
    };

    return {
        planningTemplate,
        loading,
        uploadTemplate,
        deleteTemplate,
        refresh: fetchConfig
    };
}
