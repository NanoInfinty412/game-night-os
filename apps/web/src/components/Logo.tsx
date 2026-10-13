const WORDS: { text: string; color: string }[] = [
  { text: 'Game', color: 'text-pop-yellow' },
  { text: 'Night', color: 'text-pop-pink' },
];

export function Logo({ className = '' }: { className?: string }) {
  let letterIndex = 0;
  return (
    <h1
      className={`flex flex-wrap items-center gap-x-[0.3em] font-bold leading-none ${className}`}
      aria-label="Game Night OS"
    >
      {WORDS.map((word) => (
        <span key={word.text} className={`inline-flex ${word.color}`} aria-hidden>
          {word.text.split('').map((letter) => {
            const i = letterIndex++;
            return (
              <span
                key={i}
                className="inline-block animate-[wiggle_2.4s_ease-in-out_infinite] drop-shadow-[0_0.08em_0_rgba(0,0,0,0.35)]"
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                {letter}
              </span>
            );
          })}
        </span>
      ))}
      <span
        className="inline-block -rotate-6 rounded-[0.3em] bg-pop-cyan px-[0.25em] py-[0.05em] text-night-950 shadow-[0_0.1em_0_#1f9a8f]"
        aria-hidden
      >
        OS
      </span>
    </h1>
  );
}
