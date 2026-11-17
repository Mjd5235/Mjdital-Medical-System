// ============================================================================
// FILE: components/AdminPortalSidebar/mobile-nav-store.ts
// Tiny external store for the mobile drawer (open/closed).
//
// Why a store instead of a React context provider:
//  - the Header button and the Sidebar drawer live in different parts of the tree
//  - a store lets both be independent leaf client components
//  - the shell, Header and Sidebar stay pure Server Components (no provider above them)
//
// bfcache: no window/unload/beforeunload/pagehide listeners anywhere. Subscribers are
// plain callbacks that live and die with React components.
// ============================================================================

"use client";

import { useSyncExternalStore } from "react";

let isOpen = false;
const listeners = new Set<() => void>();

function emit(): void {
    listeners.forEach((listener) => listener());
}

export function setMobileNavOpen(next: boolean): void {
    if (isOpen === next) return;
    isOpen = next;
    emit();
}

export function openMobileNav(): void {
    setMobileNavOpen(true);
}

export function closeMobileNav(): void {
    setMobileNavOpen(false);
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): boolean {
    return isOpen;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useMobileNavOpen(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}