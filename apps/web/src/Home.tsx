import { Link } from 'react-router-dom';
import { FloatingShapes } from './components/FloatingShapes';
import { Logo } from './components/Logo';

export function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden px-4 py-12">
      <FloatingShapes />
      <Logo className="relative text-5xl sm:text-7xl" />
      <p className="relative text-xl font-medium text-white/70">
        Party games for the whole family 🎈
      </p>
      <div className="relative flex w-full max-w-md flex-col gap-4 sm:flex-row">
        <Link
          to="/tv"
          className="flex-1 rounded-2xl bg-pop-yellow px-6 py-4 text-center text-xl font-bold text-night-950 shadow-[0_6px_0_#b8901a] transition active:translate-y-1 active:shadow-none"
        >
          📺 Host on this screen
        </Link>
        <Link
          to="/play"
          className="flex-1 rounded-2xl bg-pop-cyan px-6 py-4 text-center text-xl font-bold text-night-950 shadow-[0_6px_0_#1f9a8f] transition active:translate-y-1 active:shadow-none"
        >
          📱 Join with my phone
        </Link>
      </div>
    </main>
  );
}
