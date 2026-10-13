export function Logo({ className = '' }: { className?: string }) {
  return (
    <h1 className={`font-extrabold leading-none tracking-tight ${className}`}>
      <span className="text-pop-yellow">Game</span> <span className="text-pop-pink">Night</span>{' '}
      <span className="rounded-xl bg-pop-cyan px-2 text-night-950">OS</span>
    </h1>
  );
}
