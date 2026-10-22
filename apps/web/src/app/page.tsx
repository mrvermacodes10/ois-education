import Library from "@/components/Library";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
      <h1 className="max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
        Six games to play in your browser.
      </h1>
      <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-moss">
        Pick a game and start. Play alone against the computer, or create a room and send the code to a friend.
        No accounts, no downloads.
      </p>
      <p className="mt-3 max-w-xl text-[14px] text-moss">The games are being built one at a time. Each card shows whether it’s ready to play.</p>
      <Library />
    </main>
  );
}
