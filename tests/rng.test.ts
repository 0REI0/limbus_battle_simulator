import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../src/core/rng';

describe('createRng', () => {
  it('같은 시드는 같은 난수열을 만든다', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('다른 시드는 다른 난수열을 만든다', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('next는 [0, 1) 범위다', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int는 양끝을 포함한 범위 안의 정수다', () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('shuffle은 원본을 바꾸지 않고 같은 원소를 유지한다', () => {
    const rng = createRng(5);
    const original = [1, 2, 3, 4, 5, 6];
    const shuffled = rng.shuffle(original);
    expect(original).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('deriveSeed', () => {
  it('같은 입력이면 같은 시드를 만든다', () => {
    expect(deriveSeed(123, 7)).toBe(deriveSeed(123, 7));
  });

  it('seed나 salt가 다르면 다른 시드를 만든다', () => {
    const seeds = new Set<number>();
    for (let salt = 0; salt < 200; salt++) seeds.add(deriveSeed(123, salt));
    expect(seeds.size).toBe(200);
    expect(deriveSeed(1, 5)).not.toBe(deriveSeed(2, 5));
  });

  it('부호 없는 32비트 정수다', () => {
    for (let salt = 0; salt < 100; salt++) {
      const v = deriveSeed(999, salt);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });
});
