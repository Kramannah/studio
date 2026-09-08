
'use client';

import { useState, useMemo, useRef } from "react";
import { useMarketingEvents } from "@/hooks/use-marketing-events";
import { useDoctors } from "@/hooks/use-doctors";
import { MarketingEventForm } from "./marketing-event-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    Image as ImageIcon
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

export function MarketingEventsView() {
    const { events, loading, addEvent, updateEvent, deleteEvent } = useMarketingEvents();
    const { doctors } = useDoctors();
    const { toast } = useToast();
    
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingEvent, setEditingEvent] = useState<MarketingEvent | undefined>(undefined);
    const [activeTab, setActiveTab] = useState('pending');
    
    // Completion Dialog State
    const [completionDialog, setCompletionDialog] = useState<{ isOpen: boolean; event: MarketingEvent | null }>({
        isOpen: false,
        event: null
    });
    const [attendance, setAttendance] = useState<'attended' | 'not-attended'>('attended');
    const [proofPhoto, setProofPhoto] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const pendingEvents = useMemo(() => events.filter(e => e.status === 'planned'), [events]);
    const completedEvents = useMemo(() => events.filter(e => e.status === 'completed'), [events]);
    const canceledEvents = useMemo(() => events.filter(e => e.status === 'cancelled'), [events]);

    const handleAdd = () => {
        setEditingEvent(undefined);
        setView('form');
    };

    const handleOpenComplete = (event: MarketingEvent) => {
        setAttendance('attended');
        setProofPhoto(null);
        setCompletionDialog({ isOpen: true, event });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result as string;
                // Immediate compression to save browser memory
                const compressed = await compressImage(base64, 800, 0.5);
                setProofPhoto(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveCompletion = async () => {
        if (!completionDialog.event || isProcessing) return;
        
        setIsProcessing(true);
        try {
            await updateEvent({
                ...completionDialog.event,
                status: 'completed',
                attendanceStatus: attendance,
                proofPhoto: attendance === 'attended' ? proofPhoto || undefined : undefined
            });
            
            setCompletionDialog({ isOpen: false, event: null });
            setActiveTab('completed');
        } catch (error) {
            console.error("Failed to complete program:", error);
            toast({ variant: 'destructive', title: "Process Failed", description: "Could not finalize the program record." });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancelEvent = async (event: MarketingEvent) => {
        await updateEvent({ ...event, status: 'cancelled' });
        setActiveTab('canceled');
    };

    if (view === 'form') {
        return (
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <Button variant="ghost" onClick={() => setView('list')} className="gap-2 mb-2 font-headline">
                    <ChevronLeft className="w-4 h-4" />
                    Back to Programs
                </Button>
                <MarketingEventForm 
                    doctors={doctors}
                    event={editingEvent}
                    onCancel={() => setView('list')}
                    onSave={async (data) => {
                        if (editingEvent) {
                            await updateEvent({ ...editingEvent, ...data });
                        } else {
                            await addEvent({ ...data, status: 'planned' } as any);
                        }
                        setView('list');
                        setActiveTab('pending');
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 w-full max-w-[1400px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black font-headline text-primary tracking-tight">Marketing Programs</h2>
                    <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Master Workflow</p>
                </div>
                <Button onClick={handleAdd} size="lg" className="h-12 rounded-xl font-headline shadow-xl gap-2 transition-all active:scale-95">
                    <Plus className="w-5 h-5" />
                    Log New Program
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 rounded-xl border-2 mb-6 w-full sm:w-fit overflow-x-auto justify-start scrollbar-hide flex-nowrap">
                    <TabsTrigger value="pending" className="px-8 rounded-lg font-headline whitespace-nowrap">Pending ({pendingEvents.length})</TabsTrigger>
                    <TabsTrigger value="completed" className="px-8 rounded-lg font-headline whitespace-nowrap">Completed ({completedEvents.length})</TabsTrigger>
                    <TabsTrigger value="canceled" className="px-8 rounded-lg font-headline whitespace-nowrap">Canceled ({canceledEvents.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Doctor's Name</TableHead>
                                    <TableHead className="font-bold">Marketing Program</TableHead>
                                    <TableHead className="font-bold text-center">Scheduled Date</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingEvents.length > 0 ? pendingEvents.map((event) => (
                                    <TableRow key={event.id} className="h-20 hover:bg-muted/20 border-b">
                                        <TableCell className="pl-6 font-bold text-base">Dr. {event.doctorFirstName} {event.doctorLastName}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{event.eventName}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center text-sm font-medium text-muted-foreground">
                                            {event.eventDate ? format(parseISO(event.eventDate), 'MMM d, yyyy') : 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" onClick={() => handleOpenComplete(event)} className="bg-[#10b981] hover:bg-[#059669] font-headline h-9">
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
                                                            <AlertDialogTitle>Cancel this program?</AlertDialogTitle>
                                                            <AlertDialogDescription>This will move the program to the Canceled section.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Go Back</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleCancelEvent(event)} className="bg-destructive text-white">Confirm Cancellation</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">No pending programs.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="completed">
                    <Card className="border-2 shadow-lg overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Doctor's Name</TableHead>
                                    <TableHead className="font-bold">Marketing Program</TableHead>
                                    <TableHead className="font-bold text-center">Status</TableHead>
                                    <TableHead className="font-bold text-center">Proof</TableHead>
                                    <TableHead className="text-right pr-6">Date Finished</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {completedEvents.length > 0 ? completedEvents.map((event) => (
                                    <TableRow key={event.id} className="h-20 hover:bg-muted/20 border-b">
                                        <TableCell className="pl-6 font-bold">Dr. {event.doctorFirstName} {event.doctorLastName}</TableCell>
                                        <TableCell>{event.eventName}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={event.attendanceStatus === 'attended' ? 'default' : 'secondary'} className={cn(event.attendanceStatus === 'attended' ? "bg-green-600" : "opacity-50")}>
                                                {event.attendanceStatus === 'attended' ? 'Attended' : 'Not Attended'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {event.proofPhoto ? (
                                                <div className="flex justify-center">
                                                    <div className="w-10 h-10 rounded border-2 border-primary/20 overflow-hidden relative group cursor-pointer">
                                                        <Image src={event.proofPhoto} alt="Proof" fill className="object-cover" />
                                                    </div>
                                                </div>
                                            ) : <span className="text-xs text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell className="text-right pr-6 text-sm text-muted-foreground">
                                            {event.eventDate ? format(parseISO(event.eventDate), 'MMM d, yyyy') : 'N/A'}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground italic">No completed programs yet.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>

                <TabsContent value="canceled">
                    <Card className="border-2 shadow-lg overflow-hidden opacity-80">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-14">
                                    <TableHead className="font-bold pl-6">Doctor's Name</TableHead>
                                    <TableHead className="font-bold">Marketing Program</TableHead>
                                    <TableHead className="font-bold text-center">Type</TableHead>
                                    <TableHead className="text-right pr-6">Original Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {canceledEvents.length > 0 ? canceledEvents.map((event) => (
                                    <TableRow key={event.id} className="h-20 hover:bg-muted/20 border-b">
                                        <TableCell className="pl-6 font-bold text-destructive">Dr. {event.doctorFirstName} {event.doctorLastName}</TableCell>
                                        <TableCell className="line-through opacity-50">{event.eventName}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="border-destructive/30 text-destructive/50">Canceled</Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6 text-sm text-muted-foreground">
                                            {event.eventDate ? format(parseISO(event.eventDate), 'MMM d, yyyy') : 'N/A'}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={4} className="h-40 text-center text-muted-foreground italic">No canceled programs.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Completion Dialog */}
            <Dialog open={completionDialog.isOpen} onOpenChange={(open) => !open && !isProcessing && setCompletionDialog({ isOpen: false, event: null })}>
                <DialogContent className="sm:max-w-md border-2">
                    <DialogHeader>
                        <DialogTitle className="font-headline text-xl flex items-center gap-2">
                            <CheckCircle2 className="text-green-500" /> Confirm Completion
                        </DialogTitle>
                        <DialogDescription>
                            Provide attendance details for Dr. {completionDialog.event?.doctorFirstName} {completionDialog.event?.doctorLastName}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-6 space-y-6">
                        <div className="space-y-3">
                            <Label className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Attendance Result</Label>
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
                        <Button variant="ghost" onClick={() => setCompletionDialog({ isOpen: false, event: null })} disabled={isProcessing}>Close</Button>
                        <Button 
                            className="font-headline px-8" 
                            onClick={handleSaveCompletion}
                            disabled={(attendance === 'attended' && !proofPhoto) || isProcessing}
                        >
                            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : "Finalize Program"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
