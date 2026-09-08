
'use client';

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
    CalendarDays, 
    Plus, 
    Search, 
    Loader2, 
    RefreshCw, 
    MoreHorizontal, 
    Edit, 
    Trash2,
    MapPin,
    DollarSign,
    Presentation
} from "lucide-react";
import { useMarketingEvents } from "@/hooks/use-marketing-events";
import { format, parseISO, isValid } from "date-fns";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { MarketingEventDialog } from "./marketing-event-dialog";
import { cn } from "@/lib/utils";

export function MarketingEventsView() {
    const { events, loading, fetchEvents, deleteEvent, addEvent, updateEvent } = useMarketingEvents();
    const [search, setSearch] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<any>(undefined);

    const filteredEvents = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return events;
        return events.filter(e => 
            e.eventName.toLowerCase().includes(q) || 
            (e.venue || "").toLowerCase().includes(q) || 
            e.eventType.toLowerCase().includes(q)
        );
    }, [events, search]);

    const handleAdd = () => {
        setEditingEvent(undefined);
        setIsDialogOpen(true);
    };

    const handleEdit = (event: any) => {
        setEditingEvent(event);
        setIsDialogOpen(true);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-primary/20 text-primary border-primary/30';
            case 'planned': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'cancelled': return 'bg-destructive/20 text-destructive border-destructive/30';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black font-headline text-primary">Marketing Events</h2>
                    <p className="text-muted-foreground text-lg">Log clinical meetings, conventions, and product presentations.</p>
                </div>
                <Button onClick={handleAdd} className="h-12 font-headline px-6 rounded-xl shadow-lg">
                    <Plus className="mr-2 h-5 w-5" /> Log New Event
                </Button>
            </div>

            <Card className="border-2 shadow-lg overflow-hidden">
                <CardHeader className="bg-muted/30 border-b pb-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="relative flex-1 w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input 
                                placeholder="Search events or venues..." 
                                className="pl-10 h-11 border-2 focus-visible:ring-primary rounded-xl"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button variant="outline" size="icon" onClick={() => fetchEvents(true)} disabled={loading} className="h-11 w-11 shrink-0 rounded-xl border-2">
                            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/20">
                                <TableRow className="h-12">
                                    <TableHead className="font-bold text-foreground pl-6">Event Details</TableHead>
                                    <TableHead className="font-bold text-foreground">Type</TableHead>
                                    <TableHead className="font-bold text-foreground">Venue</TableHead>
                                    <TableHead className="font-bold text-foreground text-center">Status</TableHead>
                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && events.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-64 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></TableCell></TableRow>
                                ) : filteredEvents.length > 0 ? (
                                    filteredEvents.map((event) => (
                                        <TableRow key={event.id} className="h-20 hover:bg-muted/30 border-b last:border-0 transition-colors">
                                            <TableCell className="pl-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-base text-foreground">{event.eventName}</span>
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <CalendarDays className="h-3 w-3" />
                                                        {format(parseISO(event.eventDate), "MMMM d, yyyy")}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-bold uppercase tracking-widest text-[10px] bg-muted/50">
                                                    {event.eventType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-sm font-medium">
                                                    <MapPin className="h-3 w-3 text-primary opacity-70" />
                                                    {event.venue || "No venue set"}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge className={cn("font-black uppercase tracking-tighter text-[10px] h-7 px-3 border-2", getStatusColor(event.status))}>
                                                    {event.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <DropdownMenu modal={false}>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                                                            <MoreHorizontal className="h-5 w-5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <DropdownMenuItem onClick={() => handleEdit(event)} className="gap-2">
                                                            <Edit size={14} /> Edit Details
                                                        </DropdownMenuItem>
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive gap-2">
                                                                    <Trash2 size={14} /> Remove Event
                                                                </DropdownMenuItem>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                                                                    <AlertDialogDescription>This record will be permanently removed from your event log.</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => deleteEvent(event.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-64 text-center">
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                <Presentation size={48} className="opacity-10" />
                                                <p className="italic">No marketing events recorded yet.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <MarketingEventDialog 
                isOpen={isDialogOpen} 
                onOpenChange={setIsDialogOpen} 
                onSave={editingEvent ? updateEvent : addEvent} 
                event={editingEvent} 
            />
        </div>
    );
}
