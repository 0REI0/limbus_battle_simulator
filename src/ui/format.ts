// ============================================================
// ui/format.ts - 화면에 보여줄 문자열 도우미
// ============================================================

/** 증감 숫자 표기. 음수는 하이픈 대신 수학 마이너스(−)를 쓴다 */
export function formatDelta(amount: number): string {
  return amount >= 0 ? `+${amount}` : `\u2212${Math.abs(amount)}`;
}

/** 정신력 규칙 표기: 0은 부호 없이 "0", 나머지는 "+5" / "\u22123" */
export function formatRuleAmount(amount: number): string {
  return amount === 0 ? '0' : formatDelta(amount);
}
