"use client"

import * as React from "react"
import { Check, Search } from "lucide-react"
import { Doctor } from "@/lib/types"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type AutocompleteProps = {
    doctors: Doctor[];
    value: string;
    onChange: (value: string) => void;
    onSelect: (doctor: Doctor) => void;
    placeholder?: string;
    disabled?: boolean;
}

export const Autocomplete = React.memo(({ doctors, value, onChange, onSelect, placeholder, disabled = false }: AutocompleteProps) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = React.useCallback((doctor: Doctor) => {
    onSelect(doctor);
    setOpen(false);
  }, [onSelect]);

  const filteredDoctors = React.useMemo(() => {
    const lowercasedValue = (value || "").toLowerCase().trim();
    
    // Deduplicate doctors by ID before filtering
    const uniqueMap = new Map<string, Doctor>();
    (doctors || []).forEach(d => { if (d && d.id) uniqueMap.set(d.id, d); });
    const doctorList = Array.from(uniqueMap.values());

    if (!lowercasedValue) return doctorList.slice(0, 50); // Show top 50 if empty
    
    return doctorList.filter(doctor => {
      const firstName = String(doctor.firstName || "").toLowerCase();
      const lastName = String(doctor.lastName || "").toLowerCase();
      const fullName = `${firstName} ${lastName}`;
      const specialty = String(doctor.specialty || "").toLowerCase();
      const clinic = String(doctor.clinic || "").toLowerCase();
      
      return firstName.includes(lowercasedValue) ||
             lastName.includes(lowercasedValue) ||
             fullName.includes(lowercasedValue) ||
             specialty.includes(lowercasedValue) ||
             clinic.includes(lowercasedValue);
    }).slice(0, 50); // Limit results for performance
  }, [doctors, value]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
          <div className="relative w-full">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full pr-10 border-2 h-11 rounded-xl focus-visible:ring-primary"
              onFocus={() => !disabled && setOpen(true)}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-50">
              <Search className="h-4 w-4" />
            </div>
          </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] p-0 shadow-2xl border-2 rounded-xl z-[110]" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-[300px] overflow-y-auto">
            {filteredDoctors.length === 0 ? (
                <CommandEmpty className="p-4 text-sm text-center text-muted-foreground">No doctor found in masterlist.</CommandEmpty>
            ) : (
                <CommandGroup>
                {filteredDoctors.map((doctor) => (
                    <CommandItem
                      key={doctor.id}
                      value={doctor.id}
                      onSelect={() => handleSelect(doctor)}
                      onPointerDown={(e) => {
                        // Crucial for nested Dialog/Popover selection stability
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="p-3 cursor-pointer hover:bg-primary/10"
                    >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 text-primary shrink-0",
                        `${doctor.firstName} ${doctor.lastName}` === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-sm truncate">{doctor.firstName} {doctor.lastName}</span>
                      <span className="text-[10px] text-muted-foreground truncate uppercase font-black tracking-tight">{doctor.specialty} • {doctor.clinic}</span>
                    </div>
                    </CommandItem>
                ))}
                </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
});

Autocomplete.displayName = "Autocomplete";