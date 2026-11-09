# span-duration-percentile-calculator

Maintains a bounded reservoir of span durations and computes p50, p90, and p99 on demand without storing every observation.

```js
import { DurationPercentileCalculator } from './src/index.js';

const calc = new DurationPercentileCalculator({ maxSamples: 1000 });

calc.add(12);
calc.add(25);
calc.add(8);

console.log(calc.p50()); // 12
console.log(calc.p99()); // 25

calc.addAll([100, 200, 300]);
console.log(calc.count); // 6
console.log(calc.size);  // 6
```

## Why this exists

Storing every span duration is fine for a demo and fatal for a service that emits millions of spans a day. This library keeps a fixed-size reservoir and estimates percentiles from it, so memory stays flat while `count` still reflects the true number of observations. The trade-off is explicit: with a finite `maxSamples` the percentiles are estimates, not exact values. If you know the total volume ahead of time, pass `maxSamples: Infinity` and you get exact nearest-rank percentiles at the cost of storing everything.

## The awkward edge

Percentiles use nearest-rank, not interpolation. With `[1, 2, 3, 4]`, `p50` is `2`, not `2.5`. This is deliberate: it keeps results deterministic and avoids inventing values that were never observed. Also, `percentile(0)` returns the minimum, and any percentile that rounds to rank 0 is clamped to the minimum rather than returning `undefined`.

## API

### `new DurationPercentileCalculator(options?)`

- `options.maxSamples` — positive integer or `Infinity`. Defaults to `1000`.
- `options.random` — function returning a number in `[0, 1)`. Defaults to `Math.random`. Inject a deterministic function in tests.

### Methods

- `add(durationMs)` — add one non-negative finite duration.
- `addAll(durations)` — add any iterable of durations.
- `percentile(p)` — return the p-th percentile (`0 <= p <= 100`) or `null` if empty.
- `p50()`, `p90()`, `p99()` — shortcuts.
- `clear()` — reset to empty.

### Properties

- `count` — total observations seen.
- `size` — observations currently retained.
