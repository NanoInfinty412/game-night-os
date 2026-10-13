import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  joinRequestSchema,
  type JoinRequest,
} from '@gno/shared';
import { sfx } from '../audio/engine';
import { Confetti } from '../components/Confetti';
import { FloatingShapes } from '../components/FloatingShapes';
import { Logo } from '../components/Logo';
import { PreviewBadge } from '../components/PreviewBadge';
import { seatAvatar } from '../components/avatars';
import { playerColor } from '../components/playerColor';

type FieldErrors = Partial<Record<keyof JoinRequest, string>>;

export function PlayJoin() {
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState(() => (searchParams.get('code') ?? '').toUpperCase());
  const [nickname, setNickname] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [joined, setJoined] = useState<JoinRequest>();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = joinRequestSchema.safeParse({ roomCode, nickname });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof JoinRequest;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      sfx.oops();
      return;
    }
    setErrors({});
    sfx.join();
    // Milestone 1: no server yet, so joining only switches to the waiting screen.
    setJoined(result.data);
  }

  if (joined) {
    return (
      <main className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10 text-center">
        <FloatingShapes />
        <Confetti />
        <PreviewBadge />
        <div
          className="grid size-32 animate-[bob_2s_ease-in-out_infinite] place-items-center rounded-full text-7xl shadow-[inset_0_-8px_0_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: playerColor(0) }}
          aria-hidden
        >
          {seatAvatar(0)}
        </div>
        <h1 data-testid="joined-heading" className="text-4xl font-bold">
          You're in, {joined.nickname}!
        </h1>
        <p className="max-w-xs text-xl text-white/80">
          Room <span className="font-bold text-pop-yellow">{joined.roomCode}</span>. Hang tight and
          watch the TV 📺
        </p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 overflow-hidden px-4 py-10">
      <FloatingShapes />
      <div className="relative flex flex-col items-center gap-3">
        <Logo className="text-[2.6rem]" />
        <p className="text-lg font-medium text-white/70">Let's play together! 🎈</p>
        <PreviewBadge />
      </div>
      <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-5">
        <Field label="Room code" error={errors.roomCode} htmlFor="room-code">
          <input
            id="room-code"
            name="roomCode"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            placeholder="ABCD"
            className="w-full rounded-3xl border-4 border-pop-yellow/40 bg-night-800 px-4 py-3 text-center text-4xl font-bold uppercase tracking-[0.35em] text-pop-yellow placeholder:text-white/15 focus:border-pop-yellow focus:outline-none"
          />
        </Field>
        <Field label="Your name" error={errors.nickname} htmlFor="nickname">
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            placeholder="What should we call you?"
            className="w-full rounded-3xl border-4 border-pop-cyan/40 bg-night-800 px-4 py-3 text-2xl font-semibold placeholder:text-lg placeholder:text-white/30 focus:border-pop-cyan focus:outline-none"
          />
        </Field>
        <button
          type="submit"
          className="mt-2 rounded-3xl bg-pop-pink px-6 py-4 text-3xl font-bold text-night-950 shadow-[0_7px_0_#b02a66] transition hover:-translate-y-0.5 active:translate-y-1.5 active:shadow-none"
        >
          Let's play! 🎉
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-base font-semibold uppercase tracking-widest text-white/70"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-lg font-medium text-pop-orange">
          🙈 {error}
        </p>
      )}
    </div>
  );
}
