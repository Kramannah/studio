
"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Doctor } from "@/lib/types"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
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
    if (!value) return doctors;
    const lowercasedValue = value.toLowerCase();
    return doctors.filter(doctor =>
      doctor.firstName.toLowerCase().includes(lowercasedValue) ||
      doctor.lastName.toLowerCase().includes(lowercasedValue) ||
      `${doctor.firstName.toLowerCase()} ${doctor.lastName.toLowerCase()}`.includes(lowercasedValue) ||
      (doctor.province && doctor.province.toLowerCase().includes(lowercasedValue)) ||
      (doctor.municipality && doctor.municipality.toLowerCase().includes(lowercasedValue))
    );
  }, [doctors, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command
        shouldFilter={false}
        className="w-full overflow-visible"
      >
        <PopoverTrigger asChild>
            <CommandInput
              value={value}
              onValueChange={onChange}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full"
              onFocus={() => setOpen(true)}
            />
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <CommandList>
            {filteredDoctors.length === 0 && value.length > 0 ? (
                <CommandEmpty>No doctor found. You can add them manually.</CommandEmpty>
            ) : (
                <CommandGroup>
                {filteredDoctors.map((doctor) => (
                    <CommandItem
                    key={doctor.id}
                    value={`${doctor.firstName} ${doctor.lastName}`}
                    onSelect={() => handleSelect(doctor)}
                    >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        `${doctor.firstName} ${doctor.lastName}` === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {doctor.firstName} {doctor.lastName}
                    </CommandItem>
                ))}
                </CommandGroup>
            )}
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  )
});

Autocomplete.displayName = "Autocomplete";
