
'use client';

import { useState } from "react";
import { useMarketingEvents } from "@/hooks/use-marketing-events";
import { useDoctors } from "@/hooks/use-doctors";
import { MarketingEventForm } from "./marketing-event-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Plus, 
    Calendar, 
    MapPin, 
    Pencil, 
    Trash2, 
    Presentation, 
    Loader2, 
    Users, 
    TrendingUp,
    MoreHorizontal,
    ChevronLeft
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MarketingEventsView() {
    const { events, loading, addEvent, updateEvent, deleteEvent } = useMarketingEvents();
    const { doctors } = useDoctors();
    
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingEvent, setEditingEvent] = useState<MarketingEvent | undefined>(undefined);

    const handleAdd = () => {
        setEditingEvent(undefined);
        setView('form');
    };

    const handleEdit = (event: MarketingEvent) => {
        setEditingEvent(event);
        setView('form');
    };

    const getStatusBadge = (status: MarketingEvent['status']) => {
        switch (status) {
            case 'completed': return <Badge className="bg-[#10b981] text-white">Completed</Badge>;
            case 'cancelled': return <Badge variant="destructive">Cancelled</Badge>;
            default: return <Badge variant="secondary">Planned</Badge>;
        }
    };

    if (view === 'form') {
        return (
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <Button variant="ghost" onClick={() => setView('list')} className="gap-2 mb-2 font-headline">
                    <ChevronLeft className="w-4 h-4" />
                    Back to Activities
                </Button>
                <MarketingEventForm 
                    doctors={doctors}
                    event={editingEvent}
                    onCancel={() => setView('list')}
                    onSave={async (data) => {
                        if (editingEvent) {
                            await updateEvent({ ...editingEvent, ...data });
                        } else {
                            await addEvent(data);
                        }
                        setView('list');
                    }}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 w-full max-w-[1400px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black font-headline text-primary tracking-tight">Marketing Activities</h2>
                    <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Clinical Meetings & Professional Events</p>
                </div>
                <Button onClick={handleAdd} size="lg" className="h-12 rounded-xl font-headline shadow-xl gap-2 transition-all active:scale-95">
                    <Plus className="w-5 h-5" />
                    Log New Activity
                </Button>
            </div>

            {loading && events.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed rounded-[2rem] bg-muted/5">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                    <p className="font-headline font-bold text-muted-foreground uppercase tracking-widest text-sm">Accessing events database...</p>
                </div>
            ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed rounded-[2rem] bg-muted/5 text-center space-y-6">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                        <Presentation className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black font-headline text-foreground">No Activities Recorded</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            Start tracking your clinical updates, RTDs, and conventions to improve territory oversight.
                        </p>
                    </div>
                    <Button onClick={handleAdd} variant="outline" className="border-2 rounded-xl h-11 px-8 font-headline">
                        Create Your First Event
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {events.map((event) => (
                        <Card key={event.id} className="group border-2 shadow-lg overflow-hidden hover:border-primary/50 transition-all duration-300">
                            <CardHeader className="bg-muted/30 border-b pb-4 relative">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tighter border-primary/30 text-primary">
                                            {event.eventType}
                                        </Badge>
                                        <CardTitle className="text-lg font-black font-headline line-clamp-1">{event.eventName}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-1">
                                         <DropdownMenu modal={false}>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleEdit(event)} className="gap-2">
                                                    <Pencil className="h-4 w-4" /> Edit
                                                </DropdownMenuItem>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <DropdownMenuItem className="text-destructive focus:text-destructive gap-2">
                                                            <Trash2 className="h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
                                                            <AlertDialogDescription>This action will permanently remove the event record.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => deleteEvent(event.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-center gap-3 text-sm font-medium">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                        <Users className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-foreground font-bold">Dr. {event.doctorFirstName} {event.doctorLastName}</span>
                                        <span className="text-[10px] uppercase text-muted-foreground font-black tracking-widest">{event.isListed ? 'Masterlist Provider' : 'Guest Provider'}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 border-t border-b py-4 border-dashed">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                                            <Calendar className="w-3 h-3" /> Date
                                        </p>
                                        <p className="text-sm font-bold">{format(parseISO(event.eventDate), 'MMM d, yyyy')}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                                            <MapPin className="w-3 h-3" /> Venue
                                        </p>
                                        <p className="text-sm font-bold truncate">{event.venue || 'N/A'}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-primary opacity-50" />
                                        <span className="font-mono font-bold text-lg">₱{Number(event.estimatedCost || 0).toLocaleString()}</span>
                                    </div>
                                    {getStatusBadge(event.status)}
                                </div>

                                {event.remarks && (
                                    <div className="pt-2">
                                        <p className="text-[10px] text-muted-foreground italic line-clamp-2">"{event.remarks}"</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
