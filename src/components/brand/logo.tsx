'use client';

import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
}

export function BrandLogo({ className = '', width = 140, height = 40 }: LogoProps) {
  return (
    <Link href="/" className={`inline-block relative ${className}`}>
      <Image
        src="/mjdital_logo_transparent.png"
        alt="Mjdital Logo"
        width={width}
        height={height}
        priority
        className="block dark:hidden h-auto w-auto object-contain"
        suppressHydrationWarning
      />
      <Image
        src="/mjdital_logo_transparent_white.png"
        alt="Mjdital Logo"
        width={width}
        height={height}
        priority
        className="hidden dark:block h-auto w-auto object-contain"
        suppressHydrationWarning
      />
    </Link>
  );
}