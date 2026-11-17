// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/Dropdown.tsx
// ============================================================================

"use client";

import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import type { DropdownOption } from "../../types";
import { baseInput } from "./ui";

export default function Dropdown({
    id,
    name,
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    invalid = false,
    ariaLabel,
    icon: Icon,
    isRtl,
    variant = "form",
    className = "",
}: {
    id?: string;
    name?: string;
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    placeholder: string;
    disabled?: boolean;
    invalid?: boolean;
    ariaLabel?: string;
    icon: LucideIcon;
    isRtl: boolean;
    variant?: "form" | "filter";
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const selectedIndex = options.findIndex((option) => option.value === value);
    const selected = selectedIndex >= 0 ? (options[selectedIndex] ?? null) : null;
    const isFilter = variant === "filter";

    const reposition = useCallback(() => {
        const button = buttonRef.current;
        const menu = menuRef.current;

        if (!button || !menu) return;

        const rect = button.getBoundingClientRect();
        const height = menu.offsetHeight;
        const margin = 8;
        const gap = 6;
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const placeAbove = height + gap > spaceBelow && spaceAbove > spaceBelow;

        let top = placeAbove ? rect.top - height - gap : rect.bottom + gap;
        top = Math.min(
            Math.max(margin, top),
            Math.max(margin, window.innerHeight - height - margin),
        );

        setPosition({ top, left: rect.left, width: rect.width });
    }, []);

    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
                return;
            }

            setOpen(false);
        };

        const onScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            reposition();
        };

        const onResize = () => reposition();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onScroll, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        menuRef.current
            ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    function openMenu() {
        if (disabled) return;
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1);
        setOpen(true);
    }

    function closeMenu() {
        setOpen(false);
    }

    function choose(index: number) {
        const option = options[index];

        if (!option) return;

        onChange(option.value);
        setOpen(false);
        buttonRef.current?.focus();
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (disabled) return;

        const lastIndex = options.length - 1;

        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();

                if (!open) {
                    openMenu();
                    return;
                }

                const goDown = event.key === "ArrowDown";

                setActiveIndex((current) => {
                    if (lastIndex < 0) return -1;
                    const next = goDown ? current + 1 : current - 1;
                    return Math.min(Math.max(next, 0), lastIndex);
                });
                return;
            }
            case "Home":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(lastIndex < 0 ? -1 : 0);
                }
                return;
            case "End":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(lastIndex);
                }
                return;
            case "Enter":
            case " ":
                event.preventDefault();

                if (!open) {
                    openMenu();
                } else if (activeIndex >= 0) {
                    choose(activeIndex);
                } else {
                    closeMenu();
                }
                return;
            case "Escape":
                if (open) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeMenu();
                }
                return;
            case "Tab":
                if (open) closeMenu();
                return;
            default:
                return;
        }
    }

    return (
        <span className="relative block">
            <Icon
                className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 ${isFilter
                    ? "start-4 text-slate-600 dark:text-slate-300"
                    : "start-3 text-slate-500 dark:text-slate-400"
                    }`}
            />

            <button
                ref={buttonRef}
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                onClick={() => (open ? closeMenu() : openMenu())}
                onKeyDown={handleKeyDown}
                onKeyUp={(event) => {
                    if (event.key === " ") event.preventDefault();
                }}
                className={`${baseInput} flex cursor-pointer items-center text-start ${isFilter ? "ps-12 pe-10" : "ps-11 pe-10"
                    } ${open ? "border-teal-500 ring-2 ring-teal-500/20" : ""} ${className}`}
            >
                <span
                    className={`block min-w-0 flex-1 truncate ${selected ? "" : "text-slate-500 dark:text-slate-400"
                        }`}
                >
                    {selected ? selected.label : placeholder}
                </span>
            </button>

            <ChevronDown
                className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 transition-transform ${open ? "rotate-180" : ""
                    } ${isFilter
                        ? "end-4 text-slate-600 dark:text-slate-300"
                        : "end-3 text-slate-500 dark:text-slate-400"
                    }`}
            />

            {name && <input type="hidden" name={name} value={value} />}

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel ?? placeholder}
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            width: position?.width ?? buttonRef.current?.offsetWidth,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[160] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-900 shadow-2xl shadow-black/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            const isActive = index === activeIndex;

                            return (
                                <div
                                    key={option.value}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    data-index={index}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => choose(index)}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-start font-medium transition-colors ${isActive
                                        ? "bg-teal-600 text-white"
                                        : isSelected
                                            ? "text-teal-600 dark:text-teal-400"
                                            : "text-slate-900 dark:text-slate-100"
                                        }`}
                                >
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </span>
    );
}