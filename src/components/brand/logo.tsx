import Link from "next/link";
import Image from 'next/image'

export function BrandLogo() {
  return (
    <Link
      href="/"
      aria-label="Mjdital Medical System"
      className="flex shrink-0 items-center gap-3"
    >
      <Image src={'/mjdital_logo_transparent.png'} width={200} height={50} alt="Mjdital Logo" />
    </Link>
  );
}
