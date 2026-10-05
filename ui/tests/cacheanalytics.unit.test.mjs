import { describe, it } from "node:test";
import assert from "node:assert/strict";

function parseCacheStats(dimensions) {
  let cacheHits = 0;
  let cacheMisses = 0;
  const userCacheStats = {};

  for (const dim of dimensions || []) {
    const rawUser = dim.individualNames?.[0] || dim.name?.split(",")[0] || "(not set)";
    const rawStatus = dim.individualNames?.[1] || dim.name?.split(",")[1] || "(not set)";

    const isAbsent = (v) => !v || v === "(not set)" || v === "null" || v === "undefined";
    const userEmail = isAbsent(rawUser) ? "anonymous.caller@external.client" : rawUser;
    const status = String(rawStatus || "").toUpperCase();

    const n = Number(dim.metrics?.find((m) => m.name === "sum(message_count)")?.values?.[0] || 0);
    if (n <= 0) continue;

    const emailKey = userEmail.toLowerCase();
    if (!userCacheStats[emailKey]) {
      userCacheStats[emailKey] = { hits: 0, misses: 0, disabled: 0, notSet: 0 };
    }

    if (status === "HIT") {
      cacheHits += n;
      userCacheStats[emailKey].hits += n;
    } else if (status === "MISS") {
      cacheMisses += n;
      userCacheStats[emailKey].misses += n;
    } else if (status === "DISABLED") {
      userCacheStats[emailKey].disabled += n;
    } else {
      userCacheStats[emailKey].notSet += n;
    }
  }

  const cacheMeasured = cacheHits + cacheMisses;
  const cacheHitRate = cacheMeasured > 0 ? Number(((cacheHits / cacheMeasured) * 100).toFixed(1)) : null;

  return { cacheHits, cacheMisses, cacheMeasured, cacheHitRate, userCacheStats };
}

function computeScopedCacheKPIs({
  viewMode,
  userFilter,
  currentUserEmail,
  calls,
  spend,
  fleetData,
}) {
  if (viewMode === "admin" && userFilter === "all" && fleetData?.kpis) {
    return {
      cacheSavings:
        fleetData.kpis.cacheCostSavingsUsd == null
          ? null
          : Number(fleetData.kpis.cacheCostSavingsUsd).toFixed(2),
      cacheHitRate:
        fleetData.kpis.cacheHitRate == null ? null : Math.round(fleetData.kpis.cacheHitRate),
    };
  }

  const targetEmails = new Set();
  if (viewMode === "user") {
    targetEmails.add(currentUserEmail.toLowerCase());
  } else if (userFilter !== "all") {
    targetEmails.add(userFilter.toLowerCase());
  }

  let userHits = 0;
  let userMisses = 0;
  let hasMeasuredCache = false;

  if (fleetData?.userCacheStats) {
    targetEmails.forEach((email) => {
      const stat = fleetData.userCacheStats?.[email];
      if (stat) {
        userHits += stat.hits || 0;
        userMisses += stat.misses || 0;
        if ((stat.hits || 0) + (stat.misses || 0) > 0) {
          hasMeasuredCache = true;
        }
      }
    });
  }

  const userMeasured = userHits + userMisses;
  const userCacheHitRate =
    hasMeasuredCache && userMeasured > 0
      ? Math.round((userHits / userMeasured) * 100)
      : null;

  let userCacheSavings = null;
  if (userCacheHitRate !== null && userHits > 0) {
    const modelCalls = Math.max(1, calls - userHits);
    let costPerModelCall = calls > 0 && spend > 0 ? spend / modelCalls : 0;
    if (costPerModelCall === 0 && fleetData?.kpis?.totalSpendUsd && fleetData?.kpis?.totalCalls) {
      const fleetHits = fleetData.kpis.cacheHitCount || 0;
      const fleetModelCalls = Math.max(1, fleetData.kpis.totalCalls - fleetHits);
      costPerModelCall = fleetData.kpis.totalSpendUsd / fleetModelCalls;
    }
    userCacheSavings = (costPerModelCall * userHits).toFixed(2);
  }

  return {
    cacheSavings: userCacheSavings,
    cacheHitRate: userCacheHitRate,
  };
}

describe("Cache Analytics Unit Tests", () => {
  describe("Dimension parsing and per-user aggregation", () => {
    it("aggregates hits, misses, disabled, and notSet accurately by user", () => {
      const rawDimensions = [
        {
          individualNames: ["admin@example.com", "HIT"],
          metrics: [{ name: "sum(message_count)", values: ["90"] }],
        },
        {
          individualNames: ["admin@example.com", "MISS"],
          metrics: [{ name: "sum(message_count)", values: ["60"] }],
        },
        {
          individualNames: ["admin@example.com", "DISABLED"],
          metrics: [{ name: "sum(message_count)", values: ["250"] }],
        },
        {
          individualNames: ["alice@example.com", "HIT"],
          metrics: [{ name: "sum(message_count)", values: ["10"] }],
        },
        {
          individualNames: ["alice@example.com", "MISS"],
          metrics: [{ name: "sum(message_count)", values: ["10"] }],
        },
        {
          individualNames: ["bob@example.com", "DISABLED"],
          metrics: [{ name: "sum(message_count)", values: ["50"] }],
        },
      ];

      const result = parseCacheStats(rawDimensions);

      assert.equal(result.cacheHits, 100);
      assert.equal(result.cacheMisses, 70);
      assert.equal(result.cacheMeasured, 170);
      assert.equal(result.cacheHitRate, 58.8);

      assert.deepEqual(result.userCacheStats["admin@example.com"], {
        hits: 90,
        misses: 60,
        disabled: 250,
        notSet: 0,
      });
      assert.deepEqual(result.userCacheStats["alice@example.com"], {
        hits: 10,
        misses: 10,
        disabled: 0,
        notSet: 0,
      });
      assert.deepEqual(result.userCacheStats["bob@example.com"], {
        hits: 0,
        misses: 0,
        disabled: 50,
        notSet: 0,
      });
    });

    it("attributes unauthenticated traffic to anonymous.caller@external.client", () => {
      const rawDimensions = [
        {
          name: "(not set),HIT",
          metrics: [{ name: "sum(message_count)", values: ["5"] }],
        },
        {
          individualNames: ["null", "MISS"],
          metrics: [{ name: "sum(message_count)", values: ["3"] }],
        },
      ];

      const result = parseCacheStats(rawDimensions);
      assert.equal(result.cacheHits, 5);
      assert.equal(result.cacheMisses, 3);
      assert.deepEqual(result.userCacheStats["anonymous.caller@external.client"], {
        hits: 5,
        misses: 3,
        disabled: 0,
        notSet: 0,
      });
    });

    it("returns null hit rate when only DISABLED or (not set) traffic exists", () => {
      const rawDimensions = [
        {
          individualNames: ["user@example.com", "DISABLED"],
          metrics: [{ name: "sum(message_count)", values: ["20"] }],
        },
        {
          individualNames: ["user@example.com", "(not set)"],
          metrics: [{ name: "sum(message_count)", values: ["10"] }],
        },
      ];

      const result = parseCacheStats(rawDimensions);
      assert.equal(result.cacheHits, 0);
      assert.equal(result.cacheMisses, 0);
      assert.equal(result.cacheHitRate, null);
    });
  });

  describe("Scoped User View KPI calculation", () => {
    const fleetData = {
      kpis: {
        totalCalls: 1000,
        totalSpendUsd: 10.0,
        cacheCostSavingsUsd: 1.0,
        cacheHitRate: 50.0,
        cacheHitCount: 100,
        cacheMeasuredCalls: 200,
      },
      userCacheStats: {
        "admin@example.com": { hits: 90, misses: 60, disabled: 100 },
        "zero_cache@example.com": { hits: 0, misses: 0, disabled: 50 },
        "zero_hits@example.com": { hits: 0, misses: 20, disabled: 0 },
        "all_hits@example.com": { hits: 30, misses: 0, disabled: 0 },
      },
    };

    it("calculates real hit rate and savings for active user in user view", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "user",
        userFilter: "all",
        currentUserEmail: "admin@example.com",
        calls: 500,
        spend: 4.1,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, 60);
      assert.equal(kpis.cacheSavings, "0.90");
    });

    it("renders null hit rate and null savings for a user with only DISABLED traffic (No cache data)", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "user",
        userFilter: "all",
        currentUserEmail: "zero_cache@example.com",
        calls: 50,
        spend: 1.0,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, null);
      assert.equal(kpis.cacheSavings, null);
    });

    it("calculates 0% hit rate and null savings for a user with misses only", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "user",
        userFilter: "all",
        currentUserEmail: "zero_hits@example.com",
        calls: 20,
        spend: 0.5,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, 0);
      assert.equal(kpis.cacheSavings, null);
    });

    it("falls back to fleet cost-per-model-call when user made only cache hits (spend = 0)", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "user",
        userFilter: "all",
        currentUserEmail: "all_hits@example.com",
        calls: 30,
        spend: 0,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, 100);
      assert.equal(kpis.cacheSavings, "0.33");
    });

    it("returns fleet KPIs in admin view when userFilter is all", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "admin",
        userFilter: "all",
        currentUserEmail: "admin@example.com",
        calls: 1000,
        spend: 10.0,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, 50);
      assert.equal(kpis.cacheSavings, "1.00");
    });

    it("returns filtered user KPIs in admin view when a specific user is selected", () => {
      const kpis = computeScopedCacheKPIs({
        viewMode: "admin",
        userFilter: "admin@example.com",
        currentUserEmail: "admin@example.com",
        calls: 500,
        spend: 4.1,
        fleetData,
      });

      assert.equal(kpis.cacheHitRate, 60);
      assert.equal(kpis.cacheSavings, "0.90");
    });
  });
});
