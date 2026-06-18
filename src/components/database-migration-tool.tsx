"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, ShieldOff } from "lucide-react";

/**
 * DATABASE OPTIMIZATION ENGINE (RETIRED)
 * The automated and manual migration tools have been removed from the application.
 */
export function DatabaseMigrationTool() {
    return (
        <Card className="border-2 shadow-lg max-w-4xl mx-auto">
            <CardHeader className="bg-muted/30 border-b-2">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-muted rounded-xl">
                        <Database className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black font-headline tracking-tight text-muted-foreground">Migration Engine Retired</CardTitle>
                        <CardDescription>Automated data offloading tools have been disabled.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-10 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <ShieldOff className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="max-w-md">
                    <p className="text-muted-foreground font-medium">
                        The centralized migration engine and individual background self-healing logic have been removed from the application codebase. 
                    </p>
                    <p className="text-xs text-muted-foreground mt-4 italic">
                        Manual optimization is no longer available via this interface.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
