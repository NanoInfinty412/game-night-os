import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicPlayer } from './engine';
import type { Song } from './songs';

const STORAGE_KEY = 'gno:music';

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writePreference(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked (private mode): the choice just isn't remembered.
  }
}

/**
 * Background music for the TV. Music is on by default, but browsers only allow sound after the
 * first tap or key press, so it starts on that first interaction.
 */
export function useMusic() {
  const [wanted, setWanted] = useState(readPreference);
  const [playing, setPlaying] = useState(false);
  const [song, setSong] = useState<Song>();
  const player = useRef<MusicPlayer>(undefined);

  const getPlayer = useCallback(() => {
    player.current ??= new MusicPlayer(setSong);
    return player.current;
  }, []);

  const start = useCallback(() => {
    getPlayer().start();
    setPlaying(true);
  }, [getPlayer]);

  useEffect(() => {
    if (!wanted || playing) return;
    const onFirstInteraction = (event: Event) => {
      // The music button handles its own click; starting here too would make it toggle off.
      if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
      start();
    };
    window.addEventListener('pointerdown', onFirstInteraction);
    window.addEventListener('keydown', onFirstInteraction);
    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
    };
  }, [wanted, playing, start]);

  useEffect(() => () => player.current?.stop(), []);

  const toggle = useCallback(() => {
    if (playing) {
      getPlayer().stop();
      setPlaying(false);
      setWanted(false);
      writePreference(false);
    } else {
      start();
      setWanted(true);
      writePreference(true);
    }
  }, [playing, getPlayer, start]);

  const skip = useCallback(() => getPlayer().skip(), [getPlayer]);

  return { playing, wanted, song, toggle, skip };
}
