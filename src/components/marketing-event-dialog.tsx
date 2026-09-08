
'use client';

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Autocomplete } from "./autocomplete"
import { format, parseISO, isValid } from "date-fns"
import type { MarketingEvent, Doctor } from "@/lib/types"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, Save, X, UserPlus, Trash2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card"
import { Badge } from "./ui/badge"

const MARKETING_PROGRAMS = [
  "DapaTalk (1 on 1)",
  "DapaTalk (group)",
  "RoxaTalk (1 on 1)",
  "MycoToc (1-on-1)",
  "MycoToc (group)",
  "DermOb In-Clinic Snack",
  "Think-Tank-Toc",
  "DapaRox PP",
  "DermToc",
  "TGP",
  "Gastro RTD",
  "General Lines PP"
];

const eventSchema = z.object({
  eventName: z.string().min(1, "Program is required"),
  eventDate: z.date(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
});

type ProviderEntry = {
    id?: string;
    firstName: string;
    lastName: string;
    isListed: boolean;
};

type MarketingEventFormProps = {
  onSave: (data: Omit<MarketingEvent, 'id' | 'userId'>[]) => Promise<void>;
  onCancel: () => void;
  doctors: Doctor[];
  event?: MarketingEvent;
}

export function MarketingEventForm({ onSave, onCancel, doctors, event }: MarketingEventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autocompleteValue, setAutocompleteValue] = useState("");
  const [isListedMode, setIsListedMode] = useState(true);
  const [selectedProviders, setSelectedProviders] = useState<ProviderEntry[]>([]);
  
  // Guest inputs
  const [guestFirst, setGuestFirst] = useState("");
  const [guestLast, setGuestLast] = useState("");

  const form = useForm<z.infer<typeof eventSchema>>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      eventName: "",
      eventDate: new Date(),
      quarter: "Q1",
    },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        eventName: event.eventName,
        eventDate: event.eventDate ? parseISO(event.eventDate) : new Date(),
        quarter: event.quarter || "Q1",
      });
      setSelectedProviders([{
          id: event.doctorId,
          firstName: event.doctorFirstName,
          lastName: event.doctorLastName,
          isListed: event.isListed
      }]);
    } else {
      const month = new Date().getMonth();
      let currentQ: "Q1" | "Q2" | "Q3" | "Q4" = "Q1";
      if (month >= 3 && month <= 5) currentQ = "Q2";
      else if (month >= 6 && month <= 8) currentQ = "Q3";
      else if (month >= 9 && month <= 11) currentQ = "Q4";

      form.reset({
        eventName: "",
        eventDate: new Date(),
        quarter: currentQ,
      });
      setSelectedProviders([]);
    }
  }, [event, form]);

  const handleAddDoctorFromMaster = useCallback((doctor: Doctor) => {
    if (!selectedProviders.find(p => p.id === doctor.id)) {
        setSelectedProviders(prev => [...prev, {
            id: doctor.id,
            firstName: doctor.firstName,
            lastName: doctor.lastName,
            isListed: true
        }]);
    }
    setAutocompleteValue("");
  }, [selectedProviders]);

  const handleAddGuest = () => {
      if (guestFirst.trim() && guestLast.trim()) {
          setSelectedProviders(prev => [...prev, {
              firstName: guestFirst.trim(),
              lastName: guestLast.trim(),
              isListed: false
          }]);
          setGuestFirst("");
          setGuestLast("");
      }
  };

  const handleRemoveProvider = (index: number) => {
      setSelectedProviders(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: z.infer<typeof eventSchema>) => {
    if (selectedProviders.length === 0) return;
    setIsSubmitting(true);
    try {
      // Generate a shared groupId for this batch
      const groupId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payloads = selectedProviders.map(p => ({
          groupId,
          isListed: p.isListed,
          doctorId: p.id,
          doctorFirstName: p.firstName,
          doctorLastName: p.lastName,
          eventName: values.eventName,
          eventDate: values.eventDate.toISOString(),
          quarter: values.quarter,
          eventType: 'RTD' as any,
          status: 'planned' as any,
      }));

      await onSave(payloads);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditMode = !!event;

  return (
    <Card className="border-2 shadow-xl animate-in slide-in-from-right-4 duration-300">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20">
        <div>
          <CardTitle className="font-headline text-xl text-primary">{isEditMode ? 'Modify Event' : 'Log Marketing Event'}</CardTitle>
          {!isEditMode && <CardDescription>You can add multiple doctors to this program.</CardDescription>}
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full">
            <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="space-y-6">
                
                {/* PROVIDER SELECTION SECTION */}
                <div className="space-y-4 bg-muted/30 p-5 rounded-2xl border-2 border-dashed">
                    {!isEditMode && (
                        <div className="space-y-3 mb-6">
                            <FormLabel className="font-headline text-xs uppercase tracking-widest text-muted-foreground">Provider Selection Type</FormLabel>
                            <RadioGroup
                                value={isListedMode ? "true" : "false"}
                                onValueChange={(v) => setIsListedMode(v === "true")}
                                className="flex gap-4"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="true" id="mode-listed" />
                                    <FormLabel htmlFor="mode-listed" className="font-bold cursor-pointer">In Masterlist</FormLabel>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="false" id="mode-guest" />
                                    <FormLabel htmlFor="mode-guest" className="font-bold cursor-pointer">Guest / Not Listed</FormLabel>
                                </div>
                            </RadioGroup>
                        </div>
                    )}

                    {!isEditMode && (
                        <div className="space-y-4">
                            {isListedMode ? (
                                <div className="space-y-2">
                                    <FormLabel className="font-headline text-xs uppercase text-primary">Search & Add Doctor</FormLabel>
                                    <Autocomplete 
                                        doctors={doctors} 
                                        value={autocompleteValue} 
                                        onChange={setAutocompleteValue} 
                                        onSelect={handleAddDoctorFromMaster}
                                        placeholder="Type name to find and add..."
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                    <div className="space-y-2">
                                        <FormLabel className="font-headline text-xs text-primary">First Name</FormLabel>
                                        <Input value={guestFirst} onChange={(e) => setGuestFirst(e.target.value)} placeholder="e.g. Maria" className="h-11 border-2 rounded-xl" />
                                    </div>
                                    <div className="space-y-2">
                                        <FormLabel className="font-headline text-xs text-primary">Last Name</FormLabel>
                                        <Input value={guestLast} onChange={(e) => setGuestLast(e.target.value)} placeholder="e.g. Cruz" className="h-11 border-2 rounded-xl" />
                                    </div>
                                    <Button type="button" onClick={handleAddGuest} disabled={!guestFirst || !guestLast} variant="secondary" className="h-11 rounded-xl font-headline font-bold">
                                        <UserPlus className="mr-2 h-4 w-4" /> Add Guest
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SELECTED PROVIDERS QUEUE */}
                    <div className="mt-6 pt-6 border-t">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-headline text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                Selected Providers ({selectedProviders.length})
                            </h4>
                        </div>
                        
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-hide">
                            {selectedProviders.length > 0 ? (
                                selectedProviders.map((p, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-xl border shadow-sm animate-in fade-in slide-in-from-left-2">
                                        <div className="flex items-center gap-3">
                                            <Badge variant={p.isListed ? "secondary" : "outline"} className="text-[10px]">
                                                {p.isListed ? "Listed" : "Guest"}
                                            </Badge>
                                            <span className="font-bold text-sm">Dr. {p.firstName} {p.lastName}</span>
                                        </div>
                                        {!isEditMode && (
                                            <Button variant="ghost" size="icon" onClick={() => handleRemoveProvider(idx)} className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center text-muted-foreground italic text-sm border-2 border-dashed rounded-xl">
                                    No providers added to this event yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* EVENT DETAILS SECTION */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <FormField
                        control={form.control}
                        name="quarter"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline text-primary">Select Quarter</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="h-11 border-2 rounded-xl">
                                            <SelectValue placeholder="Select Quarter..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Q1">Quarter 1</SelectItem>
                                        <SelectItem value="Q2">Quarter 2</SelectItem>
                                        <SelectItem value="Q3">Quarter 3</SelectItem>
                                        <SelectItem value="Q4">Quarter 4</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="eventName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="font-headline text-primary">Marketing Program</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="h-11 border-2 rounded-xl">
                                            <SelectValue placeholder="Select Event..." />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {MARKETING_PROGRAMS.map(program => (
                                            <SelectItem key={program} value={program}>{program}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="eventDate"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel className="font-headline mb-2 text-primary">Event Date</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                    variant={"outline"}
                                    className={cn("w-full h-11 pl-3 text-left font-normal border-2 rounded-xl", !field.value && "text-muted-foreground")}
                                    >
                                    {field.value && isValid(field.value) ? format(field.value, "PPP") : <span>Pick a date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                <Button 
                    type="submit" 
                    disabled={isSubmitting || selectedProviders.length === 0} 
                    className="flex-1 h-14 font-headline text-lg rounded-2xl shadow-xl transition-all active:scale-[0.98] font-black"
                >
                    {isSubmitting ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Save className="mr-2 h-6 w-6" />}
                    {isEditMode ? 'Confirm Changes' : `Save Event for ${selectedProviders.length} Providers`}
                </Button>
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onCancel} 
                    disabled={isSubmitting}
                    className="h-14 font-headline rounded-2xl border-2 px-8"
                >
                    Cancel
                </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
