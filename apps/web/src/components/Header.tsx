import Link from "next/link";

export function Mark() {
  // Original wordmark glyph: a rounded square split into four quadrants, one filled in sage.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#1e3b2f" />
      <rect x="13.5" y="13.5" width="8" height="8" rx="2.5" fill="#b9c9ae" />
      <rect x="4.5" y="4.5" width="8" height="8" rx="2.5" fill="none" stroke="#f2f1e8" strokeWidth="1.6" />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="border-b border-line/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em]">
          <Mark />
          OIS Education
        </Link>
        <nav className="ml-auto text-[15px]">
          <Link href="/" className="rounded-full px-3 py-1.5 text-moss transition-colors hover:bg-sage-soft hover:text-forest">Library</Link>
        </nav>
      </div>
    </header>
  );
}
