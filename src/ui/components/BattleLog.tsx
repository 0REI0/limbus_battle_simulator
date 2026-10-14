import { useEffect, useRef } from 'react';

/** 전투 기록. 새 줄이 생기면 목록 안에서만 맨 아래로 스크롤한다 */
export function BattleLog({ lines }: { lines: readonly string[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <ol className="log" ref={ref} aria-label="전투 기록">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ol>
  );
}
