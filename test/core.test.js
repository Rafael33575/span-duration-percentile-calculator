import test from 'node:test';
import assert from 'node:assert/strict';
import { DurationPercentileCalculator } from '../src/index.js';

// Deterministic pseudo-random generator for reservoir sampling tests.
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('empty calculator returns null percentiles', () => {
  const c = new DurationPercentileCalculator();
  assert.equal(c.count, 0);
  assert.equal(c.size, 0);
  assert.equal(c.p50(), null);
  assert.equal(c.p90(), null);
  assert.equal(c.p99(), null);
  assert.equal(c.percentile(0), null);
  assert.equal(c.percentile(100), null);
});

test('exact percentiles with Infinity maxSamples', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll([10, 20, 30, 40]);
  assert.equal(c.count, 4);
  assert.equal(c.size, 4);
  // nearest-rank: p50 -> rank 2 -> 20; p90 -> rank 4 -> 40; p99 -> rank 4 -> 40
  assert.equal(c.p50(), 20);
  assert.equal(c.p90(), 40);
  assert.equal(c.p99(), 40);
  assert.equal(c.percentile(0), 10);
  assert.equal(c.percentile(100), 40);
});

test('percentile 0 returns minimum even when p rounds to rank 0', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll([5, 1, 3]);
  assert.equal(c.percentile(0), 1);
  assert.equal(c.percentile(1), 1);
});

test('duplicate values are handled correctly', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll([7, 7, 7, 7]);
  assert.equal(c.p50(), 7);
  assert.equal(c.p90(), 7);
  assert.equal(c.p99(), 7);
  assert.equal(c.percentile(0), 7);
  assert.equal(c.percentile(100), 7);
});

test('single observation', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.add(42);
  assert.equal(c.p50(), 42);
  assert.equal(c.p90(), 42);
  assert.equal(c.p99(), 42);
});

test('reservoir sampling keeps size bounded and count exact', () => {
  const c = new DurationPercentileCalculator({
    maxSamples: 5,
    random: makeRandom(12345),
  });
  for (let i = 0; i < 100; i++) {
    c.add(i);
  }
  assert.equal(c.count, 100);
  assert.equal(c.size, 5);
  // Percentiles are estimates but must be within the observed range.
  const p50 = c.p50();
  assert.ok(p50 >= 0 && p50 < 100);
});

test('reservoir sampling is deterministic with a fixed random source', () => {
  const c1 = new DurationPercentileCalculator({
    maxSamples: 3,
    random: makeRandom(999),
  });
  const c2 = new DurationPercentileCalculator({
    maxSamples: 3,
    random: makeRandom(999),
  });
  for (let i = 0; i < 20; i++) {
    c1.add(i);
    c2.add(i);
  }
  assert.equal(c1.p50(), c2.p50());
  assert.equal(c1.p90(), c2.p90());
  assert.equal(c1.p99(), c2.p99());
});

test('clear resets state', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll([1, 2, 3]);
  c.clear();
  assert.equal(c.count, 0);
  assert.equal(c.size, 0);
  assert.equal(c.p50(), null);
});

test('rejects invalid duration values', () => {
  const c = new DurationPercentileCalculator();
  assert.throws(() => c.add(-1), TypeError);
  assert.throws(() => c.add(NaN), TypeError);
  assert.throws(() => c.add(Infinity), TypeError);
  assert.throws(() => c.add('10'), TypeError);
  assert.throws(() => c.add(null), TypeError);
});

test('rejects invalid percentile values', () => {
  const c = new DurationPercentileCalculator();
  c.add(1);
  assert.throws(() => c.percentile(-1), RangeError);
  assert.throws(() => c.percentile(101), RangeError);
  assert.throws(() => c.percentile(NaN), RangeError);
  assert.throws(() => c.percentile('50'), RangeError);
});

test('rejects invalid constructor options', () => {
  assert.throws(() => new DurationPercentileCalculator({ maxSamples: 0 }), TypeError);
  assert.throws(() => new DurationPercentileCalculator({ maxSamples: -5 }), TypeError);
  assert.throws(() => new DurationPercentileCalculator({ maxSamples: 1.5 }), TypeError);
  assert.throws(() => new DurationPercentileCalculator({ maxSamples: NaN }), TypeError);
  assert.throws(() => new DurationPercentileCalculator({ random: 42 }), TypeError);
});

test('addAll accepts any iterable', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll(new Set([10, 20, 30]));
  assert.equal(c.count, 3);
  assert.equal(c.p50(), 20);
});

test('percentile nearest-rank boundary: p50 of [1,2,3,4,5] is 3', () => {
  const c = new DurationPercentileCalculator({ maxSamples: Infinity });
  c.addAll([1, 2, 3, 4, 5]);
  assert.equal(c.p50(), 3);
  assert.equal(c.p90(), 5);
  assert.equal(c.p99(), 5);
});
