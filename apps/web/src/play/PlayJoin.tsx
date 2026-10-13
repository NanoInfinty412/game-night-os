import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  joinRequestSchema,
  type JoinRequest,
} from '@gno/shared';
import { Logo } from '../components/Logo';
import { PreviewBadge } from '../components/PreviewBadge';
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
      return;
    }
    setErrors({});
    // Milestone 1: no server yet, so joining only switches to the waiting screen.
    setJoined(result.data);
  }

  if (joined) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <PreviewBadge />
        <div
          className="grid size-28 place-items-center rounded-full text-6xl font-extrabold text-night-950"
          style={{ backgroundColor: playerColor(0) }}
          aria-hidden
        >
          {joined.nickname.charAt(0).toUpperCase()}
        </div>
        <h1 data-testid="joined-heading" className="text-4xl font-extrabold">
          You're in, {joined.nickname}!
        </h1>
        <p className="text-xl text-white/70">
          Room <span className="font-bold text-pop-yellow">{joined.roomCode}</span>. Look at the TV,
          the game starts soon.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <Logo className="text-4xl" />
        <PreviewBadge />
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
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
            className="w-full rounded-2xl bg-night-800 px-4 py-4 text-center text-4xl font-extrabold uppercase tracking-[0.3em] text-pop-yellow placeholder:text-white/15 focus:outline-none focus:ring-4 focus:ring-pop-yellow/60"
          />
        </Field>
        <Field label="Nickname" error={errors.nickname} htmlFor="nickname">
          <input
            id="nickname"
            name="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            placeholder="Your name"
            className="w-full rounded-2xl bg-night-800 px-4 py-4 text-2xl font-bold placeholder:text-white/25 focus:outline-none focus:ring-4 focus:ring-pop-cyan/60"
          />
        </Field>
        <button
          type="submit"
          className="mt-2 rounded-2xl bg-pop-pink px-6 py-4 text-2xl font-extrabold text-night-950 shadow-[0_6px_0_#b02a66] transition active:translate-y-1 active:shadow-none"
        >
          Join game
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
        className="text-sm font-bold uppercase tracking-widest text-white/60"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-base font-medium text-pop-orange">
          {error}
        </p>
      )}
    </div>
  );
}
