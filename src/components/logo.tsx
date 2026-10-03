import Image from "next/image";
import Link from "next/link";
import mark from "../../public/brand/panpen-mark.png";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2" aria-label="PanPen home">
      <Image src={mark} alt="" priority className="h-9 w-auto shrink-0" sizes="40px" />
      {!compact && <span className="font-serif text-[1.4rem] font-semibold leading-none tracking-tight text-navy">PanPen</span>}
    </Link>
  );
}
