class ConcurrencyLimiter {
  constructor(limit = 1) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }

    await new Promise((resolve) => {
      this.queue.push(resolve);
    });

    this.active += 1;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();

    if (next) {
      next();
    }
  }

  async run(task) {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export function createLimiter(limit = 1) {
  const limiter = new ConcurrencyLimiter(limit);
  return (task) => limiter.run(task);
}

export function createBucketScheduler({
  totalLimits = {},
  hostLimits = {},
  defaultTotalLimit = 1,
  defaultHostLimit = 1
} = {}) {
  const totalLimiters = new Map();
  const hostLimiters = new Map();

  function getLimiter(map, key, limit) {
    if (!map.has(key)) {
      map.set(key, createLimiter(limit));
    }

    return map.get(key);
  }

  function schedule({ bucket = "default", host = "" } = {}, task) {
    const totalLimit = totalLimits[bucket] || defaultTotalLimit;
    const totalRunner = getLimiter(totalLimiters, bucket, totalLimit);

    if (!host) {
      return totalRunner(task);
    }

    const hostLimit = hostLimits[bucket] || defaultHostLimit;
    const hostRunner = getLimiter(hostLimiters, `${bucket}:${host}`, hostLimit);

    return totalRunner(() => hostRunner(task));
  }

  return {
    schedule
  };
}
