export const KCPL_RULES = {
  order: ["X","A","B","C","D"],
  overallUsable: 10000000,
  totalSquadSize: 17,
  pools: {
    A: { teamCap: 4000000, minReq: 3, maxCount: 3,        base: 0 },
    B: { teamCap: 3000000, minReq: 3, maxCount: 5,        base: 0 },
    C: { teamCap: 500000,  minReq: 2, maxCount: Infinity, base:  0 },
    D: { teamCap: 100000,  minReq: 1, maxCount: Infinity, base:  0 },
    X: { teamCap: 2400000, minReq: 3, maxCount: 3, base:      0 } // headcount only
  }
};
