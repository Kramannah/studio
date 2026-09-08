
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
    Pencil, 
    Trash2, 
    Presentation, 
    Loader2, 
    Users, 
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
                    <h2 className="text-3xl font-black font-headline text-primary tracking-tight">Marketing Programs</h2>
                    <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">Clinical Updates & Professional Events</p>
                </div>
                <Button onClick={handleAdd} size="lg" className="h-12 rounded-xl font-headline shadow-xl gap-2 transition-all active:scale-95">
                    <Plus className="w-5 h-5" />
                    Log New Program
                </Button>
            </div>

            {loading && events.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed rounded-[2rem] bg-muted/5">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                    <p className="font-headline font-bold text-muted-foreground uppercase tracking-widest text-sm">Accessing programs database...</p>
                </div>
            ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed rounded-[2rem] bg-muted/5 text-center space-y-6">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                        <Presentation className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black font-headline text-foreground">No Programs Recorded</h3>
                    </div>
                    <Button onClick={handleAdd} variant="outline" className="border-2 rounded-xl h-11 px-8 font-headline">
                        Record Your First Program
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {events.map((event) => (
                        <Card key={event.id} className="group border-2 shadow-lg overflow-hidden hover:border-primary/50 transition-all duration-300">
                            <CardHeader className="bg-muted/30 border-b pb-4 relative">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg font-black font-headline line-clamp-1">{event.eventName}</CardTitle>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold uppercase tracking-widest">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {format(parseISO(event.eventDate), 'MMM d, yyyy')}
                                        </div>
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
                                                            <AlertDialogTitle>Delete this program record?</AlertDialogTitle>
                                                            <AlertDialogDescription>This action will permanently remove the record.</AlertDialogDescription>
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
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
