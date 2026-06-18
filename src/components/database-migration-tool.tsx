"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database } from "lucide-react";

/**
 * MIGRATION ENGINE RETIRED
 * Standard operation mode: Base64 storage in Firestore enabled.
 */
export function DatabaseMigrationTool() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <Card className="border-2 shadow-lg overflow-hidden max-w-4xl mx-auto">
                <CardHeader className="bg-muted/30 border-b-2 py-6 text-center">
                    <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Database className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-black font-headline text-primary tracking-tight">System Operation Mode</CardTitle>
                    <CardDescription>Administrative migration tools have been disabled. All data is processed using standard document protocols.</CardDescription>
                </CardHeader>
                <CardContent className="p-10 text-center">
                    <p className="text-muted-foreground italic">No further database optimizations are active at this time.</p>
                </CardContent>
            </Card>
        </div>
    );
}
