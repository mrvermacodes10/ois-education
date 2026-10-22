import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">That page doesn’t exist.</h1>
      <p className="mt-3 text-moss">The game may have moved, or the link has a typo.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-forest px-5 text-[15px] font-medium text-paper hover:bg-forest-deep">Back to the library</Link>
    </main>
  );
}
