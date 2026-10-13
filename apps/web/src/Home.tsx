import { Link } from 'react-router-dom';
import { Logo } from './components/Logo';

export function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-12">
      <Logo className="text-5xl sm:text-7xl" />
      <div className="flex w-full max-w-md flex-col gap-4 sm:flex-row">
        <Link
          to="/tv"
          className="flex-1 rounded-2xl bg-pop-yellow px-6 py-4 text-center text-xl font-extrabold text-night-950 shadow-[0_6px_0_#b8901a] transition active:translate-y-1 active:shadow-none"
        >
          Host on this screen
        </Link>
        <Link
          to="/play"
          className="flex-1 rounded-2xl bg-pop-cyan px-6 py-4 text-center text-xl font-extrabold text-night-950 shadow-[0_6px_0_#1f9a8f] transition active:translate-y-1 active:shadow-none"
        >
          Join with my phone
        </Link>
      </div>
    </main>
  );
}
