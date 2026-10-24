import { Suspense } from "react";

export const instant = false;

export default async function AdminDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            {children}
        </Suspense>
    );
}