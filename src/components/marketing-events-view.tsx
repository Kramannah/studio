'use client';

import React, { useState, useMemo, useRef } from "react";
import { useMarketingEvents } from "@/hooks/use-marketing-events";
import { useDoctors } from "@/hooks/use-doctors";
import { MarketingEventForm } from "./marketing-event-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Plus, 
    Calendar, 
    Pencil, 
    Trash2, 
    Presentation, 
    Loader2, 
    Users, 
    CheckCircle2, 
    XCircle,
    ChevronLeft,
    Camera,
    Image as ImageIcon,
    Filter,
    Maximize2,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { MarketingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";
import { compressImage } from "@/lib/storage-utils";
import { useToast } from "@/hooks/use-toast";

interface MarketingEventsViewProps {
    userId?: string;
    readOnly?: boolean;
}

export function MarketingEventsView({ userId, readOnly = false }: MarketingEventsViewProps) {
    const { events, loading, addEvent, updateEvent, deleteEvent } = useMarketingEvents(true, undefined, userId);
    const { doctors } = useDoctors();
    const { toast } = useToast();
    
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingEvent, setEditingEvent] = useState<MarketingEvent | undefined>(undefined);
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedQuarter, setSelectedQuarter] = useState<'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('all');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    
    // Completion Dialog State
    const [completionDialog, setCompletionDialog] = useState<{ isOpen: boolean; group: MarketingEvent[] | null }>({
        isOpen: false,
        group: null
    });
    const [attendance, setAttendance] = useState<'attended' | 'not-attended'>('attended');
    const [proofPhoto, setProofPhoto] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Image Preview State
    const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

    const filteredEvents = useMemo(() => {
        if (selectedQuarter === 'all') return events;
        return events.filter(e => e.quarter === selectedQuarter);
    }, [events, selectedQuarter]);

    // Grouping Logic: Treat multiple docs as 1 report based on groupId
    const groupedEvents = useMemo(() => {
        const groups: Record<string, MarketingEvent[]> = {};
        
        filteredEvents.forEach(e => {
            const gid = e.groupId || e.id; // Use groupId if available, else doc id for single entries
            if (!groups[gid]) groups[gid] = [];
            groups[gid].push(e);
        });

        const sortedGroups = Object.values(groups).sort((a, b) => 
            new Date(b[0].eventDate).getTime() - new Date(a[0].eventDate).getTime()
        );

        return {
            pending: sortedGroups.filter(g => g[0].status === 'planned'),
            completed: sortedGroups.filter(g => g[0].status === 'completed'),
            canceled: sortedGroups.filter(g => g[0].status === 'cancelled')
        };
    }, [filteredEvents]);

    const handleAdd = () => {
        setEditingEvent(undefined);
        setView('form');
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const handleOpenComplete = (group: MarketingEvent[]) => {
        setAttendance('attended');
        setProofPhoto(null);
        setCompletionDialog({ isOpen: true, group });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                const compressed = await compressImage(base64, 800, 0.5);
                setProofPhoto(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveCompletion = async () => {
        if (!completionDialog.group || isProcessing) return;
        
        setIsProcessing(true);
        try {
            // Update all records in the group
            await Promise.all(completionDialog.group.map(event => 
                updateEvent({
                    ...event,
                    status: 'completed',
                    attendanceStatus: attendance,
                    proofPhoto: attendance === 'attended' ? proofPhoto || undefined : undefined
                })
            ));
            
            setCompletionDialog({ isOpen: false, group: null });
            setActiveTab('completed');
        } catch (error) {
            console.error("Failed to complete programs:", error);
            toast({ variant: 'destructive', title: "Process Failed", description: "Could not finalize the program records." });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancelGroup = async (group: MarketingEvent[]) => {
        await Promise.all(group.map(event => updateEvent({ ...event, status: 'cancelled' })));
        setActiveTab('canceled');
    };

    if (view === 'form') {
        return (
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <Button variant="ghost" onClick={() => setView('list')} className="gap-2 mb-2 font-headline">
                    <ChevronLeft className="w-4 h-4" />
                    Back to Events
                </Button>
                <MarketingEventForm 
                    doctors={doctors}
                    event={editingEvent}
                    onCancel={() => setView('list')}
                    onSave={async (dataArray) => {
                        if (editingEvent) {
                            await updateEvent({ ...editingEvent, ...dataArray[0] });
                        } else {
                            // Bulk create mode: Hook handles individual addDoc calls
                            for (const data of dataArray) {
                                await addEvent(data as any);
                            }
                        }
                        setView('list');
                        setActiveTab('pending');
                    }}
                />
            </div>
        );
    }

    const currentGroups = activeTab === 'pending' ? groupedEvents.pending : 
                        activeTab === 'completed' ? groupedEvents.completed : 
                        groupedEvents.canceled;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 w-full max-w-[1400px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black font-headline text-primary tracking-tight">Marketing Events</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl border-2">
                        <Filter className="w-4 h-4 text-primary ml-2" />
                        <Select value={selectedQuarter} onValueChange={(v: any) => setSelectedQuarter(v)}>
                            <SelectTrigger className="h-9 w-[140px] bg-transparent border-none shadow-none font-headline focus:ring-0">
                                <SelectValue placeholder="Quarter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Quarters</SelectItem>
                                <SelectItem value="Q1">Quarter 1</SelectItem>
                                <SelectItem value="Q2">Quarter 2</SelectItem>
                                <SelectItem value="Q3">Quarter 3</SelectItem>
                                <SelectItem value="Q4">Quarter 4</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {!readOnly && (
                        <Button onClick={handleAdd} size="lg" className="h-12 rounded-xl font-headline shadow-xl gap-2 transition-all active:scale-95">
                            <Plus className="w-5 h-5" />
                            Log New Event
                        </Button>
                    )}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 rounded-xl border-2 mb-6 w-full sm:w-fit overflow-x-auto justify-start scrollbar-hide flex-nowrap">
                    <TabsTrigger value="pending" className="px-8 rounded-lg font-headline whitespace-nowrap">Pending ({groupedEvents.pending.length})</TabsTrigger>
                    <TabsTrigger value="completed" className="px-8 rounded-lg font-headline whitespace-nowrap">Completed ({groupedEvents.completed.length})</TabsTrigger>
                    <TabsTrigger value="canceled" className="px-8 rounded-lg font-headline whitespace-nowrap">Canceled ({groupedEvents.canceled.length})</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab}>
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Doctor's Name</TableHead>
                                    <TableHead className="font-bold">Quarter</TableHead>
                                    <TableHead className="font-bold">Marketing Event</TableHead>
                                    <TableHead className="font-bold text-center">Scheduled Date</TableHead>
                                    {activeTab === 'completed' && <TableHead className="font-bold text-center">Proof</TableHead>}
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {currentGroups.length > 0 ? currentGroups.map((group) => {
                                    const firstEvent = group[0];
                                    const gid = firstEvent.groupId || firstEvent.id;
                                    const isExpanded = expandedGroups.has(gid);
                                    const isGroup = group.length > 1;

                                    return (
                                        <React.Fragment key={gid}>
                                            <TableRow className={cn("h-20 hover:bg-muted/20 border-b", isExpanded && "bg-muted/10")}>
                                                <TableCell className="pl-6 font-bold text-base">
                                                    <div className="flex items-center gap-2">
                                                        {isGroup ? (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="sm" 
                                                                onClick={() => toggleGroup(gid)}
                                                                className="p-0 h-auto hover:bg-transparent text-primary flex items-center gap-2"
                                                            >
                                                                {group.length} Doctors Invited
                                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </Button>
                                                        ) : (
                                                            `Dr. ${firstEvent.doctorFirstName} ${firstEvent.doctorLastName}`
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="font-mono">{firstEvent.quarter || 'Q1'}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{firstEvent.eventName}</Badge>
                                                </TableCell>
                                                <TableCell className="text-center text-sm font-medium text-muted-foreground">
                                                    {firstEvent.eventDate ? format(parseISO(firstEvent.eventDate), 'MMM d, yyyy') : 'N/A'}
                                                </TableCell>
                                                
                                                {activeTab === 'completed' && (
                                                    <TableCell className="text-center">
                                                        {firstEvent.proofPhoto ? (
                                                            <div className="flex justify-center">
                                                                <div 
                                                                    className="w-10 h-10 rounded border-2 border-primary/20 overflow-hidden relative group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                                                    onClick={() => setPreviewImage({ src: firstEvent.proofPhoto!, title: `Group Proof: ${firstEvent.eventName}` })}
                                                                >
                                                                    <Image src={firstEvent.proofPhoto} alt="Proof" fill className="object-cover" />
                                                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Maximize2 className="w-3 h-3 text-white" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                                    </TableCell>
                                                )}

                                                <TableCell className="text-right pr-6">
                                                    {!readOnly && activeTab === 'pending' && (
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" onClick={() => handleOpenComplete(group)} className="bg-[#10b981] hover:bg-[#059669] font-headline h-9">
                                                                Complete
                                                            </Button>
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive hover:text-white font-headline h-9">
                                                                        Cancel
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
                                                                        <AlertDialogDescription>This will move all {group.length} records in this batch to the Canceled section.</AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleCancelGroup(group)} className="bg-destructive text-white">Confirm Cancellation</AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    )}
                                                    {activeTab === 'completed' && (
                                                        <Badge variant={firstEvent.attendanceStatus === 'attended' ? 'default' : 'secondary'} className={cn(firstEvent.attendanceStatus === 'attended' ? "bg-green-600" : "opacity-50")}>
                                                            {firstEvent.attendanceStatus === 'attended' ? 'Attended' : 'Not Attended'}
                                                        </Badge>
                                                    )}
                                                    {activeTab === 'canceled' && (
                                                         <Badge variant="outline" className="border-destructive/30 text-destructive/50">Canceled</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>

                                            {/* EXPANDED NAMES SECTION */}
                                            {isExpanded && (
                                                <TableRow className="bg-muted/5">
                                                    <TableCell colSpan={activeTab === 'completed' ? 6 : 5} className="p-0">
                                                        <div className="px-12 py-4 space-y-2 border-l-4 border-primary/20 animate-in slide-in-from-top-2 duration-300">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Providers in this report:</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                {group.map((e, idx) => (
                                                                    <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-background border shadow-sm">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                                                        <span className="text-sm font-bold truncate">Dr. {e.doctorFirstName} {e.doctorLastName}</span>
                                                                        {e.isListed && <Badge variant="outline" className="text-[8px] h-4 ml-auto opacity-50">Masterlist</Badge>}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <TableRow><TableCell colSpan={activeTab === 'completed' ? 6 : 5} className="h-40 text-center text-muted-foreground italic">No entries found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Completion Dialog */}
            <Dialog open={completionDialog.isOpen} onOpenChange={(open) => !open && !isProcessing && setCompletionDialog({ isOpen: false, group: null })}>
                <DialogContent className="sm:max-w-md border-2">
                    <DialogHeader>
                        <DialogTitle className="font-headline text-xl flex items-center gap-2">
                            <CheckCircle2 className="text-green-500" /> Confirm Batch Completion
                        </DialogTitle>
                        <DialogDescription>
                            Provide attendance details for this group of {completionDialog.group?.length || 0} doctors.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-6 space-y-6">
                        <div className="space-y-3">
                            <Label className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Attendance Result (Applies to all)</Label>
                            <RadioGroup value={attendance} onValueChange={(v: any) => setAttendance(v)} className="grid grid-cols-2 gap-4">
                                <div className={cn("flex items-center space-x-2 border-2 p-3 rounded-xl cursor-pointer transition-all", attendance === 'attended' ? "border-primary bg-primary/5" : "border-muted")}>
                                    <RadioGroupItem value="attended" id="att-yes" />
                                    <Label htmlFor="att-yes" className="font-bold cursor-pointer">Attended</Label>
                                </div>
                                <div className={cn("flex items-center space-x-2 border-2 p-3 rounded-xl cursor-pointer transition-all", attendance === 'not-attended' ? "border-primary bg-primary/5" : "border-muted")}>
                                    <RadioGroupItem value="not-attended" id="att-no" />
                                    <Label htmlFor="att-no" className="font-bold cursor-pointer">Not Attended</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {attendance === 'attended' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <Label className="font-headline text-xs uppercase text-primary">Required Proof Photo</Label>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                                
                                {proofPhoto ? (
                                    <div className="relative aspect-video w-full rounded-2xl border-2 overflow-hidden bg-muted">
                                        <Image src={proofPhoto} alt="Proof Preview" fill className="object-contain" />
                                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full" onClick={() => setProofPhoto(null)} disabled={isProcessing}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button variant="outline" className="w-full h-32 border-dashed border-2 flex-col gap-2 rounded-2xl" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                                        <Camera className="w-8 h-8 text-muted-foreground" />
                                        <span className="text-sm font-medium">Capture or Upload Photo</span>
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setCompletionDialog({ isOpen: false, group: null })} disabled={isProcessing}>Close</Button>
                        <Button 
                            className="font-headline px-8" 
                            onClick={handleSaveCompletion}
                            disabled={(attendance === 'attended' && !proofPhoto) || isProcessing}
                        >
                            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Finalize Report"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Proof Preview Dialog */}
            <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden border-none bg-black/95 z-[1000]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{previewImage?.title || "Proof Preview"}</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full h-[85vh] flex items-center justify-center p-4">
                        {previewImage?.src && (
                            <Image 
                                src={previewImage.src} 
                                alt="Full Proof" 
                                width={1600} 
                                height={1200} 
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" 
                            />
                        )}
                    </div>
                    <div className="absolute top-4 left-4">
                        <Badge className="bg-primary text-primary-foreground font-headline text-sm px-4 py-1.5 shadow-lg border-2 border-primary/20">
                            {previewImage?.title}
                        </Badge>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
