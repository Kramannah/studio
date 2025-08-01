"use client"

import type { CoverageEntry } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { format, parseISO } from "date-fns";
import Image from "next/image";
import { Button } from "./ui/button";
import { RefreshCw, Hourglass, Edit } from "lucide-react";

type OfflineListProps = {
  entries: CoverageEntry[];
  isSyncing: boolean;
  isOnline: boolean;
  syncAll: () => void;
  onEdit: (entry: CoverageEntry) => void;
};

export function OfflineList({ entries, isSyncing, isOnline, syncAll, onEdit }: OfflineListProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No offline entries pending.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
       <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
                <div>
                    <CardTitle className="font-headline">Pending Entries</CardTitle>
                    <CardDescription>{entries.length} entries waiting to be synced.</CardDescription>
                </div>
                <Button onClick={syncAll} disabled={isSyncing || !isOnline} className="font-headline">
                    {isSyncing ? <RefreshCw className="mr-2 animate-spin" /> : <RefreshCw className="mr-2" />}
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
            </div>
        </CardHeader>
      </Card>
      {entries.map(entry => (
        <Card key={entry.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-headline">{entry.firstName} {entry.lastName}</CardTitle>
                <CardDescription>{entry.specialty} - {entry.clinic}</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hourglass size={14} />
                <span>Pending Sync</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p><strong>Coverage Date:</strong> {format(parseISO(entry.coverageDate), "PPP")}</p>
            <p><strong>Coverage Type:</strong> <span className="capitalize">{entry.coverageType}</span></p>
            <p><strong>Submitted:</strong> {format(parseISO(entry.submittedAt), "PPpp")}</p>
            {entry.photos && entry.photos.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold font-headline">Photos</h4>
                <div className="flex gap-2 mt-2 overflow-x-auto">
                  {entry.photos.map((photo, index) => (
                    <Image key={index} src={photo} alt={`photo ${index}`} width={80} height={80} className="object-cover rounded-md" />
                  ))}
                </div>
              </div>
            )}
             {entry.signature && (
              <div className="mt-4">
                <h4 className="font-semibold font-headline">Signature</h4>
                <div className="p-2 mt-2 border rounded-md bg-muted">
                    <Image src={entry.signature} alt="signature" width={150} height={75} className="bg-white" />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => onEdit(entry)}>
                <Edit className="mr-2" />
                Edit Entry
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
