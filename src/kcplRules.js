// kcplRules.js
export const KCPL_RULES = {
  order: ["A","B","C","D"],
  pools: {
    A: { teamCap: 40_00_000, minReq: 3,  maxCount: 3,  minBase: 3_00_000 },
    B: { teamCap: 30_00_000, minReq: 0,  maxCount: 5,  minBase: 1_00_000 },
    C: { teamCap: Infinity,  minReq: 1,  maxCount: Infinity, minBase: 50_000 },
    D: { teamCap: Infinity,  minReq: 1,  maxCount: Infinity, minBase: 20_000 },
  },
  overallUsable: 76_00_000, // 1Cr total minus 24L for icons (Pool X)
};
