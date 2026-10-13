import { useMusic } from '../audio/useMusic';

export function MusicControl() {
  const { playing, wanted, song, toggle, skip } = useMusic();
  const label = playing ? 'Music on' : 'Music off';

  return (
    <div data-music-control className="flex items-center gap-2">
      {playing && song && (
        <span
          data-testid="now-playing"
          className="hidden text-base font-medium text-white/60 lg:inline"
        >
          ♪ {song.title}
        </span>
      )}
      {!playing && wanted && (
        <span className="hidden text-base font-medium text-white/50 lg:inline">
          Press any key for music
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={label}
        title={label}
        className="grid size-12 place-items-center rounded-full bg-white/10 text-2xl transition hover:bg-white/20"
      >
        {playing ? '🎵' : '🔇'}
      </button>
      {playing && (
        <button
          type="button"
          onClick={skip}
          aria-label="Next song"
          title="Next song"
          className="grid size-12 place-items-center rounded-full bg-white/10 text-xl transition hover:bg-white/20"
        >
          ⏭
        </button>
      )}
    </div>
  );
}
