// ============================================================
// sim/overrides.ts - 시뮬레이션 도구 공용 명령줄 옵션
// balance.ts 파일을 고치지 않고, 실행 중에만 수치를 바꿔서 비교해볼 수 있다.
// (sim/balance.ts, sim/matchup.ts, sim/rewardValues.ts 모두 같은 옵션을 받는다)
//
//   --picks N          층당 보상 선택 횟수
//   --choices N        선택지 개수
//   --weights A,B,...  보상 티어 가중치, 티어 개수만큼 (예: 40,28,18,10,4)
//   --sanity MODE      dynamic | fixed
//   --sanity-win N     합 승리 시 정신력 증가량
// ============================================================

import { COIN, REWARD_TIERS, REWARD_TIER_WEIGHTS, REWARDS } from '../src/data/balance';

const argv = process.argv.slice(2);

export const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

export const numArg = (name: string): number | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} 값이 숫자가 아님: ${v}`);
  return n;
};

const listArg = (name: string, length: number, example: string): number[] | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const list = v.split(',').map(Number);
  if (list.length !== length || list.some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error(`--${name}은 "${example}" 형식(${length}개)이어야 함`);
  }
  return list;
};

/** 명령줄 옵션을 balance.ts의 설정 객체에 적용하고, 적용한 항목 설명을 반환한다 */
export function applyOverrides(): string[] {
  const applied: string[] = [];

  const picks = numArg('picks');
  if (picks !== undefined) {
    REWARDS.picksPerFloor = picks;
    applied.push(`picks=${picks}`);
  }
  const choices = numArg('choices');
  if (choices !== undefined) {
    REWARDS.choicesPerPick = choices;
    applied.push(`choices=${choices}`);
  }
  const weights = listArg('weights', REWARD_TIERS.length, '40,28,18,10,4');
  if (weights !== undefined) {
    REWARD_TIERS.forEach((tier, i) => {
      REWARD_TIER_WEIGHTS[tier] = weights[i];
    });
    applied.push(`weights=${weights.join(',')}`);
  }

  const sanity = arg('sanity');
  if (sanity !== undefined) {
    if (sanity !== 'dynamic' && sanity !== 'fixed') throw new Error('--sanity는 dynamic | fixed');
    COIN.sanityMode = sanity;
    applied.push(`sanity=${sanity}`);
  }
  const sanityWin = numArg('sanity-win');
  if (sanityWin !== undefined) {
    COIN.sanityOnClashWin = sanityWin;
    applied.push(`sanity-win=${sanityWin}`);
  }
  return applied;
}

/** 현재 설정을 한 줄로 요약 (출력 머리말용) */
export function describeSettings(): string {
  return (
    `층당 보상 ${REWARDS.picksPerFloor}회, 선택지 ${REWARDS.choicesPerPick}개, ` +
    `티어 가중치 ${REWARD_TIERS.map((t) => REWARD_TIER_WEIGHTS[t]).join('/')}, ` +
    `정신력 ${COIN.sanityMode}(+${COIN.sanityOnClashWin})`
  );
}
