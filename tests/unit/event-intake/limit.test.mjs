import { describe, expect, it } from "vitest";

import { createBucketScheduler, createLimiter } from "../../../scripts/event-intake/limit.mjs";

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("event intake concurrency limiters", () => {
  it("limita concorrencia total com createLimiter", async () => {
    const run = createLimiter(2);
    let active = 0;
    let maxActive = 0;

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        run(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await wait(10 + index);
          active -= 1;
          return index;
        })
      )
    );

    expect(maxActive).toBe(2);
  });

  it("respeita limites por bucket e por host", async () => {
    const scheduler = createBucketScheduler({
      totalLimits: {
        "detail-http": 3
      },
      hostLimits: {
        "detail-http": 1
      }
    });
    let totalActive = 0;
    let maxTotalActive = 0;
    let sameHostActive = 0;
    let maxSameHostActive = 0;

    await Promise.all([
      scheduler.schedule({ bucket: "detail-http", host: "example.com" }, async () => {
        totalActive += 1;
        sameHostActive += 1;
        maxTotalActive = Math.max(maxTotalActive, totalActive);
        maxSameHostActive = Math.max(maxSameHostActive, sameHostActive);
        await wait(20);
        sameHostActive -= 1;
        totalActive -= 1;
      }),
      scheduler.schedule({ bucket: "detail-http", host: "example.com" }, async () => {
        totalActive += 1;
        sameHostActive += 1;
        maxTotalActive = Math.max(maxTotalActive, totalActive);
        maxSameHostActive = Math.max(maxSameHostActive, sameHostActive);
        await wait(20);
        sameHostActive -= 1;
        totalActive -= 1;
      }),
      scheduler.schedule({ bucket: "detail-http", host: "another.com" }, async () => {
        totalActive += 1;
        maxTotalActive = Math.max(maxTotalActive, totalActive);
        await wait(20);
        totalActive -= 1;
      })
    ]);

    expect(maxSameHostActive).toBe(1);
    expect(maxTotalActive).toBeLessThanOrEqual(3);
    expect(maxTotalActive).toBeGreaterThanOrEqual(2);
  });
});
