
"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Doctor } from "@/lib/types"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "./ui/input"


type AutocompleteProps = {
    doctors: Doctor[];
    value: string;
    onChange: (value: string) => void;
    onSelect: (doctor: Doctor) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function Autocomplete({ doctors, value, onChange, onSelect, placeholder, disabled = false }: AutocompleteProps) {
  const [open, setOpen] = React.useState(false)
  
  const filteredDoctors = React.useMemo(() => {
    if (!value) return [];
    const lowercasedValue = value.toLowerCase();
    return doctors.filter(doctor =>
      doctor.firstName.toLowerCase().includes(lowercasedValue) ||
      doctor.lastName.toLowerCase().includes(lowercasedValue) ||
      `${doctor.firstName.toLowerCase()} ${doctor.lastName.toLowerCase()}`.includes(lowercasedValue)
    );
  }, [doctors, value]);

  const handleSelect = (doctor: Doctor) => {
    onSelect(doctor);
    setOpen(false);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (e.target.value) {
      if (!open) setOpen(true);
    } else {
      if (open) setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
            <Input 
                value={value}
                onChange={handleInputChange}
                placeholder={placeholder}
                className="w-full"
                autoComplete="off"
                disabled={disabled}
                onClick={() => {
                  if (value && filteredDoctors.length > 0) setOpen(true)
                }}
            />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
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
                        value === `${doctor.firstName} ${doctor.lastName}` ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {doctor.firstName} {doctor.lastName}
                    </CommandItem>
                ))}
                </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
