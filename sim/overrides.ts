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
//   --enemy MODE       적의 보상 획득 방식: random | rank
//   --enemy-ranks A,B,C  rank 모드에서 순위별로 고를 가중치 (예: 60,30,10 = 1순위 60%, 2순위 30%, 3순위 10%)
//   --enemy-rank N     위의 간단 버전: N순위만 항상 고른다 (예: 2 = 항상 두 번째로 좋은 선택지)
// ============================================================

import { COIN, ENEMY, REWARD_TIERS, REWARD_TIER_WEIGHTS, REWARDS } from '../src/data/balance';

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

  const enemy = arg('enemy');
  if (enemy !== undefined) {
    if (enemy !== 'random' && enemy !== 'rank') throw new Error('--enemy는 random | rank');
    ENEMY.pickMode = enemy;
    applied.push(`enemy=${enemy}`);
  }
  const enemyRanks = arg('enemy-ranks');
  if (enemyRanks !== undefined) {
    const weights = enemyRanks.split(',').map(Number);
    if (weights.length === 0 || weights.some((w) => !Number.isFinite(w) || w < 0) || weights.every((w) => w === 0)) {
      throw new Error('--enemy-ranks는 "60,30,10"처럼 0 이상의 숫자를 쉼표로 구분 (전부 0은 불가)');
    }
    ENEMY.rankWeights = weights;
    applied.push(`enemy-ranks=${weights.join(',')}`);
  }
  const enemyRank = numArg('enemy-rank');
  if (enemyRank !== undefined) {
    if (!Number.isInteger(enemyRank) || enemyRank < 1) throw new Error('--enemy-rank는 1 이상의 정수');
    ENEMY.rankWeights = Array.from({ length: enemyRank }, (_, i) => (i === enemyRank - 1 ? 1 : 0));
    applied.push(`enemy-rank=${enemyRank}`);
  }
  return applied;
}

/** 순위별 가중치를 확률로 환산해 읽기 쉽게 (예: "선택지 순위 1위 60%, 2위 30%, 3위 10%") */
function describeRankWeights(weights: readonly number[]): string {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const parts = weights
    .map((w, i) => ({ rank: i + 1, percent: total > 0 ? (w / total) * 100 : 0 }))
    .filter((x) => x.percent > 0)
    .map((x) => `${x.rank}위 ${Number(x.percent.toFixed(1))}%`);
  return `선택지 순위 ${parts.join(', ')}`;
}

/** 현재 설정을 한 줄로 요약 (출력 머리말용) */
export function describeSettings(): string {
  return (
    `층당 보상 ${REWARDS.picksPerFloor}회, 선택지 ${REWARDS.choicesPerPick}개, ` +
    `티어 가중치 ${REWARD_TIERS.map((t) => REWARD_TIER_WEIGHTS[t]).join('/')}, ` +
    `정신력 ${COIN.sanityMode}(+${COIN.sanityOnClashWin}), ` +
    `적 보상 ${ENEMY.pickMode === 'random' ? '무작위' : describeRankWeights(ENEMY.rankWeights)}`
  );
}
