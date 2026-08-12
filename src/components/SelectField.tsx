import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../utils";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string | number> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  placement?: "top" | "bottom";
  className?: string;
}

/** 统一的可键盘操作下拉框，避免 WebView 原生 select 弹层样式不一致。 */
export function SelectField<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  placement = "bottom",
  className,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => Object.is(option.value, value)));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnBlur = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  const focusOption = (index: number) => {
    if (!options.length) return;
    const next = (index + options.length) % options.length;
    setActiveIndex(next);
    window.requestAnimationFrame(() => optionRefs.current[next]?.focus());
  };

  const openAndFocus = (direction: 1 | -1) => {
    if (!options.length || disabled) return;
    setOpen(true);
    focusOption(selectedIndex + (open ? direction : 0));
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-edge bg-field px-3.5 text-left text-[11px] font-semibold text-foreground shadow-[0_1px_2px_rgba(30,55,37,.04)] outline-none transition",
          "hover:border-accent-soft-strong hover:bg-panel focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          open && "border-accent bg-panel ring-2 ring-accent/15",
          disabled && "cursor-not-allowed bg-neutral-soft text-subtle opacity-65",
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) setActiveIndex(selectedIndex);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAndFocus(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus(-1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="truncate">{selected?.label ?? "请选择"}</span>
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent transition", disabled && "bg-transparent text-subtle")}>
          <ChevronDown size={14} strokeWidth={2.4} className={cn("transition-transform duration-200", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute left-0 right-0 z-[260] max-h-60 overflow-y-auto rounded-xl border border-edge bg-panel p-1.5 shadow-[0_18px_46px_rgba(25,48,31,.16)]",
            placement === "top" ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              focusOption(activeIndex + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              focusOption(activeIndex - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              focusOption(0);
            } else if (event.key === "End") {
              event.preventDefault();
              focusOption(options.length - 1);
            }
          }}
        >
          {options.map((option, index) => {
            const isSelected = Object.is(option.value, value);
            return (
              <button
                key={String(option.value)}
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={index === activeIndex ? 0 : -1}
                className={cn(
                  "flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[11px] text-muted outline-none transition",
                  "hover:bg-panel-muted hover:text-foreground focus-visible:bg-accent-soft focus-visible:text-accent-strong",
                  isSelected && "bg-accent-soft font-bold text-accent-strong",
                )}
                onFocus={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  window.requestAnimationFrame(() => triggerRef.current?.focus());
                }}
              >
                <span className="truncate">{option.label}</span>
                <Check size={14} strokeWidth={2.6} className={cn("shrink-0 text-accent", isSelected ? "opacity-100" : "opacity-0")} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
