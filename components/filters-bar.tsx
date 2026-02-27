"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}

export function FiltersBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "검색…",
  rightSlot,
  className,
}: FiltersBarProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between",
        className
      )}
    >
      <Input
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-sm"
      />
      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
