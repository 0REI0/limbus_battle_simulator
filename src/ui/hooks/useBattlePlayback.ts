// ============================================================
// ui/hooks/useBattlePlayback.ts - 프레임을 시간에 맞춰 하나씩 재생
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import type { Frame } from '../playback';

export function useBattlePlayback(frames: readonly Frame[], speed: number) {
  const [index, setIndex] = useState(0);
  const last = frames.length - 1;

  useEffect(() => {
    if (index >= last) return;
    const timer = window.setTimeout(
      () => setIndex((i) => Math.min(i + 1, last)),
      frames[index].delay / speed,
    );
    return () => window.clearTimeout(timer);
  }, [index, last, frames, speed]);

  const skip = useCallback(() => setIndex(last), [last]);
  const replay = useCallback(() => setIndex(0), []);

  return { index, frame: frames[Math.min(index, last)], finished: index >= last, skip, replay };
}
