const DEFAULT_MAX_SAMPLES = 1000;

/**
 * A calculator that keeps a bounded reservoir of span durations and computes
 * percentiles on demand. By default it uses reservoir sampling (Algorithm R)
 * so memory stays bounded even for millions of observations. If you know the
 * total number of spans ahead of time and want exact percentiles, pass
 * `maxSamples: Infinity` to store every observation.
 *
 * The trade-off: bounded memory versus exactness. With a finite reservoir the
 * percentiles are an estimate; the error shrinks as the reservoir grows.
 *
 * Percentiles use nearest-rank: the smallest value v such that the fraction of
 * observations <= v is at least p/100. This is deterministic and does not
 * interpolate, so p50 of [1,2,3,4] is 2, not 2.5.
 */
export class DurationPercentileCalculator {
  /**
   * @param {object} [options]
   * @param {number} [options.maxSamples=1000] Maximum number of observations to
   *   retain. Use Infinity to retain all observations (exact percentiles).
   * @param {() => number} [options.random=Math.random] Source of randomness for
   *   reservoir sampling. Inject a deterministic function in tests.
   */
  constructor(options = {}) {
    const { maxSamples = DEFAULT_MAX_SAMPLES, random = Math.random } = options;

    if (typeof maxSamples !== 'number' || Number.isNaN(maxSamples) || maxSamples <= 0) {
      throw new TypeError('maxSamples must be a positive number');
    }
    if (maxSamples !== Infinity && !Number.isInteger(maxSamples)) {
      throw new TypeError('maxSamples must be an integer or Infinity');
    }
    if (typeof random !== 'function') {
      throw new TypeError('random must be a function');
    }

    this._maxSamples = maxSamples;
    this._random = random;
    this._samples = [];
    this._seen = 0;
  }

  /**
   * Add one span duration in milliseconds. Must be a finite non-negative number.
   * @param {number} durationMs
   */
  add(durationMs) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new TypeError('durationMs must be a finite non-negative number');
    }

    this._seen += 1;

    if (this._samples.length < this._maxSamples) {
      this._samples.push(durationMs);
      return;
    }

    // Reservoir sampling (Algorithm R): replace a random existing sample with
    // probability maxSamples / seen. This keeps the reservoir an unbiased
    // sample of the stream without storing every observation.
    const j = Math.floor(this._random() * this._seen);
    if (j < this._maxSamples) {
      this._samples[j] = durationMs;
    }
  }

  /**
   * Add several durations at once.
   * @param {Iterable<number>} durations
   */
  addAll(durations) {
    for (const d of durations) {
      this.add(d);
    }
  }

  /** Number of observations actually seen, including those not retained. */
  get count() {
    return this._seen;
  }

  /** Number of observations currently retained. */
  get size() {
    return this._samples.length;
  }

  /**
   * Compute a percentile in [0, 100]. Returns null when no observations have
   * been added. The computation sorts a copy of the retained samples, so the
   * reservoir order is preserved for future sampling.
   * @param {number} p
   * @returns {number|null}
   */
  percentile(p) {
    if (typeof p !== 'number' || Number.isNaN(p) || p < 0 || p > 100) {
      throw new RangeError('p must be a number between 0 and 100');
    }
    if (this._samples.length === 0) {
      return null;
    }

    const sorted = this._samples.slice().sort((a, b) => a - b);
    const n = sorted.length;

    if (p === 0) {
      return sorted[0];
    }

    const rank = Math.ceil((p / 100) * n);
    const index = Math.min(rank, n) - 1;
    return sorted[index];
  }

  /** @returns {number|null} */
  p50() {
    return this.percentile(50);
  }

  /** @returns {number|null} */
  p90() {
    return this.percentile(90);
  }

  /** @returns {number|null} */
  p99() {
    return this.percentile(99);
  }

  /** Reset the calculator to its initial empty state. */
  clear() {
    this._samples = [];
    this._seen = 0;
  }
}
