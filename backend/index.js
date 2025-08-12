console.log("🟢 index.js is running");

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import http from 'http';
import { Server } from 'socket.io';
import CONFIG from './config.js';
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

const TOURNAMENT_ID = CONFIG.TOURNAMENT_ID;


const app = express();
const port = CONFIG.PORT;


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://arena.auctionarena.live", "http://localhost:3000", "https://cricket-auction-live.pages.dev", "https://live.eaarena.in"],
    methods: ["GET", "POST"],
    credentials: true
  },
});


// Middleware
app.use(cors({
  origin: ["https://arena.auctionarena.live", "http://localhost:3000", "https://cricket-auction-live.pages.dev", "https://live.eaarena.in"],
  credentials: true
}));
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== KCPL RULES (no DB changes) =====
const KCPL_ENABLED = false;              // flip to false if not running KCPL
let KCPL_ACTIVE_POOL = "A";             // Admin can change: "A" | "B" | "C" | "D"

const KCPL_RULES = {
  totalPurse: 10000000,               // ₹1 Crore. :contentReference[oaicite:0]{index=0}
  preselectionSpend: 2400000,         // ₹24L (2 Icons ₹10L each + Owner ₹4L). :contentReference[oaicite:1]{index=1}
  squadSize: 17,                        // must form a 17-player squad. :contentReference[oaicite:2]{index=2}
  pools: {
    order: ["A", "B", "C", "D"],           // auction sequence. :contentReference[oaicite:3]{index=3}
    A: {
      base: 300000,                    // ₹3L. :contentReference[oaicite:4]{index=4}
      teamCap: 4000000,               // Pool A spend cap per team. :contentReference[oaicite:5]{index=5}
      maxPlayers: 3,                    // per-team cap in A. :contentReference[oaicite:6]{index=6}
      twoPlayerCap: 3700000           // “≤ ₹37L for 2 players” in A. :contentReference[oaicite:7]{index=7}
    },
    B: {
      base: 100000,                    // ₹1L. :contentReference[oaicite:8]{index=8}
      teamCap: 3000000,            // B budget + A carry-forward. :contentReference[oaicite:9]{index=9}
      maxPlayers: 5,                    // per-team cap in B. :contentReference[oaicite:10]{index=10}
      unsoldTo: { pool: "C", base: 40_000 } // B unsold → C at ₹40k. :contentReference[oaicite:11]{index=11}
    },
    C: {
      base: 50000,                     // ₹50k. :contentReference[oaicite:12]{index=12}
      teamCap: 500000,              // C budget + A&B carry-forward. :contentReference[oaicite:13]{index=13}
      minPlayers: 2                     // minimum C players. :contentReference[oaicite:14]{index=14}
    },
    D: {
      base: 20000,                     // ₹20k. :contentReference[oaicite:15]{index=15}
      teamCap: 100000,              // D budget + A,B,C carry-forward. :contentReference[oaicite:16]{index=16}
      minPlayers: 1                     // minimum D players. :contentReference[oaicite:17]{index=17}
    }
  },
  teamRules: {                          // global team composition requirements
    A: { max: 3 },                      // :contentReference[oaicite:18]{index=18}
    B: { max: 5 },                      // :contentReference[oaicite:19]{index=19}
    C: { min: 3 },                      // :contentReference[oaicite:20]{index=20}
    D: { min: 1 }                       // :contentReference[oaicite:21]{index=21}
  },
  increments: [                         // slab-wise increments. :contentReference[oaicite:22]{index=22}
    { upto: 50000, step: 5000 },
    { upto: 100000, step: 10000 },
    { upto: 300000, step: 20000 },
    { upto: Infinity, step: 25000 }
  ],
  carryForward: true,                   // carry forward unused to next pool. :contentReference[oaicite:23]{index=23}
  assignLastAAtBase: true               // if a team didn’t reach 3 in A. :contentReference[oaicite:24]{index=24}
};

// per-team in-memory state for pool budgets & counts
const kcplTeamState = new Map(); // teamId -> { spentByPool, boughtByPool, effectiveBudget }

function ensureTeamState(teamId) {
  if (!kcplTeamState.has(teamId)) {
    kcplTeamState.set(teamId, {
      spentByPool: { A: 0, B: 0, C: 0, D: 0 },
      boughtByPool: { A: 0, B: 0, C: 0, D: 0 },
      effectiveBudget: {
        A: KCPL_RULES.pools.A.teamCap,
        B: KCPL_RULES.pools.B.teamCap,
        C: KCPL_RULES.pools.C.teamCap,
        D: KCPL_RULES.pools.D.teamCap
      }
    });
  }
  return kcplTeamState.get(teamId);
}

function nextIncrementKCPL(amount) {
  for (const slab of KCPL_RULES.increments) {
    if (amount <= slab.upto) return slab.step;
  }
  return KCPL_RULES.increments.at(-1).step;
}

function recomputeCarryForward(state) {
  // Pool A is fixed
  state.effectiveBudget.A = KCPL_RULES.pools.A.teamCap;
  const Arem = state.effectiveBudget.A - state.spentByPool.A;

  // Pool B = base cap + carry from A
  state.effectiveBudget.B = KCPL_RULES.pools.B.teamCap + Math.max(0, Arem);
  const Brem = state.effectiveBudget.B - state.spentByPool.B;

  // Pool C = base cap + carry from B
  state.effectiveBudget.C = KCPL_RULES.pools.C.teamCap + Math.max(0, Brem);
  const Crem = state.effectiveBudget.C - state.spentByPool.C;

  // Pool D = base cap + carry from C
  state.effectiveBudget.D = KCPL_RULES.pools.D.teamCap + Math.max(0, Crem);
}


async function canBidKCPL({ teamId, bidAmount, playerCategory, tournamentId, activePool }) {
  const state = ensureTeamState(teamId);

  // 🔹 If playerCategory ≠ activePool and this is a migrated unsold player,
  // use the activePool for cap & limit checks
  const effectiveCategory = (KCPL_ENABLED && activePool && activePool !== playerCategory)
    ? activePool
    : playerCategory;

  const rules = KCPL_RULES.pools[effectiveCategory];
  const capLimit = state.effectiveBudget[effectiveCategory];

  // 1) Player count cap check
  if (state.boughtByPool[effectiveCategory] >= rules.maxPlayers) {
    return { ok: false, reason: `Player cap reached for Pool ${effectiveCategory}` };
  }

  // 2) Budget cap check
  if (state.spentByPool[effectiveCategory] + bidAmount > capLimit) {
    return { ok: false, reason: `Budget cap exceeded for Pool ${effectiveCategory}` };
  }

  // 3) Special rule: first 2 players cap for Pool A
  if (
    effectiveCategory === "A" &&
    state.boughtByPool.A < 2 &&
    state.spentByPool.A + bidAmount > KCPL_RULES.pools.A.twoPlayerCap
  ) {
    return { ok: false, reason: `Cap for first two Pool A players exceeded` };
  }

  // 4) Must leave budget for remaining players in the pool — applies only to Pool A
  if (effectiveCategory === "A") {
    const playersLeft = rules.maxPlayers - state.boughtByPool[effectiveCategory];
    if (playersLeft > 1) {
      const spendIfBuy = state.spentByPool[effectiveCategory] + bidAmount;
      const minNeededForRest = (playersLeft - 1) * rules.base;
      if (spendIfBuy > rules.teamCap - minNeededForRest) {
        return {
          ok: false,
          reason: `Must retain at least ₹${minNeededForRest.toLocaleString()} for remaining ${playersLeft - 1} player(s) in Pool ${effectiveCategory}`
        };
      }
    }
  }
  // 5) Step validation (fetch from DB for this tournament)
  try {
    const incRes = await pool.query(
      `SELECT increment FROM bid_increments 
       WHERE tournament_id = $1 
         AND $2 BETWEEN min_value AND max_value
       LIMIT 1`,
      [tournamentId, bidAmount]
    );

    if (incRes.rowCount > 0) {
      const step = incRes.rows[0].increment;
      if (bidAmount % step !== 0) {
        return { ok: false, reason: `Invalid bid increment. Step should be ₹${step}` };
      }
    }
  } catch (err) {
    console.error("❌ Error fetching bid increment:", err);
    return { ok: false, reason: "Error validating bid increment" };
  }

  // ✅ Passed all checks
  return { ok: true };
}



// ✅ Always update KCPL state with the effective category from PATCH/PUT
async function recordWinKCPL({ teamId, price, playerId }) {
  const state = ensureTeamState(teamId);

  // ✅ Always use current KCPL active pool from server-side state
  const poolName = KCPL_ACTIVE_POOL;

  // 1️⃣ Update in-memory state
  state.boughtByPool[poolName] = (state.boughtByPool[poolName] || 0) + 1;
  state.spentByPool[poolName] = (state.spentByPool[poolName] || 0) + Number(price || 0);

  recomputeCarryForward(state);

  // 2️⃣ Persist sold_pool in DB
  try {
    await db.query(
      `UPDATE players
       SET sold_pool = $1
       WHERE id = $2`,
      [poolName, playerId]
    );
  } catch (err) {
    console.error(`❌ Failed to update sold_pool for player ${playerId}`, err);
  }
}


// ✅ KCPL Initialize — Load pool caps & budget usage from DB
app.post('/api/kcpl/initialize', async (req, res) => {
  try {
    const { tournament_id } = req.body;
    if (!tournament_id) {
      return res.status(400).json({ error: "tournament_id is required" });
    }

    // 1. Get all teams in this tournament
    const teamsRes = await pool.query(
      `SELECT id FROM teams WHERE tournament_id = $1`,
      [tournament_id]
    );

    // 2. Reset in-memory state
    kcplTeamState.clear();

    // 3. Loop through each team and load stats
    for (const team of teamsRes.rows) {
      const state = ensureTeamState(team.id);

      const poolStats = await pool.query(
        `SELECT base_category, COUNT(*) AS count, COALESCE(SUM(sold_price),0) AS spent
         FROM players
         WHERE team_id = $1 
           AND tournament_id = $2
           AND (sold_status = TRUE OR sold_status = 'TRUE')
         GROUP BY base_category`,
        [team.id, tournament_id]
      );

      for (const ps of poolStats.rows) {
        const pool = ps.base_category;
        state.boughtByPool[pool] = Number(ps.count);
        state.spentByPool[pool] = Number(ps.spent);
      }

      recomputeCarryForward(state);
    }

    res.json({ message: "KCPL state initialized from DB" });
  } catch (err) {
    console.error("❌ KCPL initialize error:", err);
    res.status(500).json({ error: err.message });
  }
});


// KCPL: get/set active pool
app.get("/api/kcpl/active-pool", (req, res) => res.json({ pool: KCPL_ACTIVE_POOL }));
app.post("/api/kcpl/active-pool", (req, res) => {
  const { pool } = req.body || {};
  if (!["A", "B", "C", "D"].includes(pool)) return res.status(400).json({ error: "Invalid pool" });
  KCPL_ACTIVE_POOL = pool;
  res.json({ pool });
});

// KCPL: validate a proposed live bid
app.post("/api/kcpl/validate-bid", async (req, res) => {
  try {
    const { team_id, bid_amount, player_id } = req.body || {};
    if (!team_id || !Number.isFinite(bid_amount)) {
      return res.status(400).json({ error: "Missing team_id/bid_amount" });
    }

    let playerCategory;
    let tournamentId;

    if (player_id) {
      // ✅ Get base_category and tournament_id for provided player ID
      const playerRes = await pool.query(
        "SELECT base_category, tournament_id FROM players WHERE id = $1",
        [player_id]
      );
      if (playerRes.rowCount) {
        playerCategory = playerRes.rows[0].base_category;
        tournamentId = playerRes.rows[0].tournament_id;
      }
    }

    // fallback to current player if player_id not given
    if (!playerCategory || !tournamentId) {
      const currentRes = await pool.query(
        "SELECT base_category, tournament_id FROM players WHERE id = (SELECT id FROM current_player LIMIT 1)"
      );
      if (currentRes.rowCount) {
        playerCategory = currentRes.rows[0].base_category;
        tournamentId = currentRes.rows[0].tournament_id;
      }
    }

    // ✅ Now tournamentId is always defined
    const verdict = await canBidKCPL({
      teamId: team_id,
      bidAmount: Number(bid_amount),
      playerCategory,
      tournamentId,
      activePool: KCPL_ACTIVE_POOL // 👈 added
    });

    // ✅ Enforce minimum base price for KCPL or normal
    if (player_id) {
      const playerData = await pool.query(
        'SELECT base_category FROM players WHERE id = $1',
        [player_id]
      );
      if (playerData.rowCount) {
        let minAllowed;
        if (KCPL_ENABLED && KCPL_ACTIVE_POOL) {
          // ✅ Use active pool’s base for migrated unsold scenarios
          minAllowed = KCPL_RULES.pools[KCPL_ACTIVE_POOL]?.base ??
            KCPL_RULES.pools[playerData.rows[0].base_category]?.base ?? 0;
        } else {
          const tRes = await pool.query('SELECT base_price FROM tournaments WHERE id = $1', [tournamentId]);
          minAllowed = tRes.rows[0]?.base_price ?? { A: 1700, B: 3000, C: 5000 }[playerData.rows[0].component] ?? 0;
        }
        if (bid_amount < minAllowed) {
          return res.status(400).json({ ok: false, reason: `Bid must be at least ₹${minAllowed}` });
        }
      }
    }


    res.json(verdict);
  } catch (err) {
    console.error("🔥 KCPL validate-bid error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kcpl/team-states/:tournamentId', async (req, res) => {
  const { tournamentId } = req.params;

  try {
    const teamsRes = await pool.query(
      'SELECT * FROM teams WHERE tournament_id = $1 ORDER BY id',
      [tournamentId]
    );
    const teams = teamsRes.rows;

    const stateList = [];

    for (const team of teams) {
      const boughtByPool = {};
      const spentByPool = {};
      const limitByPool = {};
      const remainingByPool = {};

      // Initialize
      for (const poolKey of Object.keys(KCPL_RULES.pools)) {
        boughtByPool[poolKey] = 0;
        spentByPool[poolKey] = 0;
        limitByPool[poolKey] = KCPL_RULES.pools[poolKey].teamCap; // will adjust below
        remainingByPool[poolKey] = KCPL_RULES.pools[poolKey].teamCap;
      }

      // DB query
      const poolStatsRes = await pool.query(
        `SELECT COALESCE(sold_pool, base_category) AS pool,
                COUNT(*) AS players_bought,
                COALESCE(SUM(sold_price),0) AS total_spent
         FROM players
         WHERE team_id = $1
           AND tournament_id = $2
           AND (sold_status = TRUE OR sold_status = 'TRUE')
         GROUP BY COALESCE(sold_pool, base_category)`,
        [team.id, tournamentId]
      );

      // Update stats
      for (const row of poolStatsRes.rows) {
        const poolName = row.pool;
        boughtByPool[poolName] = Number(row.players_bought);
        spentByPool[poolName] = Number(row.total_spent);
      }

      // Carry-forward limit calculation
      let prevRemaining = 0;
      for (const poolKey of Object.keys(KCPL_RULES.pools)) {
        limitByPool[poolKey] = KCPL_RULES.pools[poolKey].teamCap + prevRemaining;
        remainingByPool[poolKey] = limitByPool[poolKey] - spentByPool[poolKey];
        prevRemaining = remainingByPool[poolKey]; // carry forward
      }

      stateList.push({
        teamId: team.id,
        teamName: team.name,
        boughtByPool,
        spentByPool,
        limitByPool,
        remainingByPool,
      });
    }

    res.json(stateList);
  } catch (err) {
    console.error('❌ Error fetching KCPL team states:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// KCPL: inspect a team’s pool budgets/counters

app.get("/api/kcpl/team-state/:teamId", (req, res) => {
  const state = ensureTeamState(Number(req.params.teamId));
  res.json(state);
});



// Log connections
io.on("connection", (socket) => {
  console.log("✅ Spectator connected via Socket.IO");

  socket.on("bidUpdated", (data) => {
    console.log("📢 Broadcasting bidUpdated:", data);
    io.emit("bidUpdated", data); // <--- THIS is what was missing
  });

  // Start secret bid process

  socket.on("secretBiddingToggled", () => {
    console.log("📡 Broadcasting 'secretBiddingToggled'");
    io.emit("secretBiddingToggled");
  });

  // ⬇️ Reveal Secrets bid
  socket.on("revealSecretBids", (data) => {
    console.log("📢 Broadcasting revealSecretBids:", data);
    io.emit("revealSecretBids", data); // Broadcast to spectators
  });

});

// Adding themes to the layout

let currentTheme = 'default';

app.get('/api/theme', (req, res) => {
  res.json({ theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
  const { theme } = req.body;
  currentTheme = theme;
  io.emit("themeUpdate", theme); // notify spectators
  res.json({ message: "Theme updated", theme });
});

app.get('/api/theme', (req, res) => {
  res.json({ theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
  const { theme } = req.body;
  currentTheme = theme;
  io.emit("themeUpdate", theme); // ⬅️ Broadcast to spectators
  res.json({ success: true });
});


// Get bid increment for a tournament
// app.get('/api/bid-increments', async (req, res) => {
//   let { tournament_id } = req.query;
//   tournament_id = parseInt(tournament_id);
//   if (!tournament_id || isNaN(tournament_id)) {
//     return res.status(400).json({ error: "Invalid tournament_id" });
//   }

//   try {
//     const result = await pool.query(
//       'SELECT * FROM bid_increments WHERE tournament_id = $1',
//       [tournament_id]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Failed to fetch bid increments:", err);
//     res.status(500).json({ error: err.message });
//   }
// });


// POST bid increments (replace existing for that tournament)

app.post('/api/bid-increments/:tournament_id', async (req, res) => {
  const { tournament_id } = req.params;
  const increments = req.body; // [{ min_value, max_value, increment }, ...]

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM bid_increments WHERE tournament_id = $1`, [tournament_id]);

    for (const { min_value, max_value, increment } of increments) {
      await client.query(`
        INSERT INTO bid_increments (tournament_id, min_value, max_value, increment)
        VALUES ($1, $2, $3, $4)
      `, [tournament_id, min_value, max_value || null, increment]);
    }

    await client.query('COMMIT');
    res.json({ message: "Bid increments updated." });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Failed to update bid increments:", err);
    res.status(500).json({ error: "Update failed" });
  } finally {
    client.release();
  }
});

// ✅ Get bid increments based on tournament slug
app.get('/api/tournaments/:slug/bid-increments', async (req, res) => {
  try {
    const { slug } = req.params;

    // 1. Find the tournament ID from slug
    const tRes = await pool.query(
      `SELECT id FROM tournaments WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (tRes.rowCount === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    const tournamentId = tRes.rows[0].id;

    // 2. Get increments for that tournament
    const incRes = await pool.query(
      `SELECT min_value, max_value, increment
   FROM bid_increments
   WHERE tournament_id = $1
ORDER BY min_value ASC`,
      [tournamentId]
    );

    res.json(incRes.rows);
  } catch (err) {
    console.error("❌ Error fetching bid increments:", err);
    res.status(500).json({ error: err.message });
  }
});


// Updating Max bid for team

async function updateTeamStats(teamId, tournamentId) {
  try {
    const teamRes = await pool.query(
      `SELECT budget FROM teams WHERE id = $1`,
      [teamId]
    );
    if (teamRes.rowCount === 0) return;
    const team = teamRes.rows[0];
    const totalBudget = team.budget;

    const tournamentRes = await pool.query(
      `SELECT base_price, min_base_price, players_per_team FROM tournaments WHERE id = $1`,
      [tournamentId]
    );
    if (tournamentRes.rowCount === 0) return;
    const tournament = tournamentRes.rows[0];

    // Get bought players and sum their sold_price
    const playersRes = await pool.query(
      `SELECT sold_price FROM players WHERE team_id = $1 AND tournament_id = $2 AND (sold_status = true OR sold_status = 'TRUE') AND deleted_at IS NULL`,
      [teamId, tournamentId]
    );

    const boughtCount = playersRes.rowCount;
    const totalSpent = playersRes.rows.reduce((sum, p) => sum + Number(p.sold_price || 0), 0);
    const remaining = Math.max(tournament.players_per_team - boughtCount, 0);
    const remainingPurse = totalBudget - totalSpent;
    const minBasePrice = tournament.base_price ?? tournament.min_base_price ?? 0;

    const maxBidAllowed = remaining > 0
      ? remainingPurse - (remaining - 1) * minBasePrice
      : 0;


    console.log(`🔁 Team ${teamId} Stats:
        Total Budget: ${totalBudget}
        Total Spent: ${totalSpent}
        Players Bought: ${boughtCount}
        Remaining Slots: ${remaining}
        Min Base Price: ${minBasePrice}
        Max Bid Allowed: ${Math.max(maxBidAllowed, 0)}
      `);

    await pool.query(
      `UPDATE teams SET bought_count = $1, max_bid_allowed = $2 WHERE id = $3`,
      [boughtCount, Math.max(maxBidAllowed, 0), teamId]
    );
    console.log(`✅ Team ${teamId} updated with bought_count = ${boughtCount}, max_bid_allowed = ${Math.max(maxBidAllowed, 0)}`);

  } catch (err) {
    console.error("❌ Error in updateTeamStats:", err);
  }
}

async function getAllTeamStats(tournamentId) {
  const res = await pool.query(`SELECT id FROM teams WHERE tournament_id = $1`, [tournamentId]);
  const allStats = [];

  for (const row of res.rows) {
    const teamId = row.id;
    await updateTeamStats(teamId, tournamentId); // updates DB
    const teamData = await pool.query(
      `SELECT id, name, bought_count, max_bid_allowed, budget 
       FROM teams WHERE id = $1`,
      [teamId]
    );
    allStats.push(teamData.rows[0]);
  }

  return allStats;
}


// Start team loop

let teamLoopInterval = null;
let loopTeamIndex = 0;

app.post("/api/start-team-loop/:slug", async (req, res) => {
  const { slug } = req.params;

  try {
    const tournamentRes = await pool.query(
      "SELECT id FROM tournaments WHERE slug = $1",
      [slug]
    );
    const tournamentId = tournamentRes.rows[0]?.id;

    if (!tournamentId) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const teamsRes = await pool.query(
      "SELECT id FROM teams WHERE tournament_id = $1 ORDER BY id ASC",
      [tournamentId]
    );
    const teamIds = teamsRes.rows.map(row => row.id);

    if (teamIds.length === 0) {
      return res.status(404).json({ error: "No teams found." });
    }

    console.log("🔁 Starting team loop for tournament:", slug, teamIds);

    let i = 0;
    teamLoopInterval = setInterval(async () => {
      const currentTeamId = teamIds[i];

      const playersRes = await pool.query(
        "SELECT * FROM players WHERE team_id = $1 AND tournament_id = $2 AND (sold_status = true OR sold_status = 'TRUE')",
        [currentTeamId, tournamentId]
      );
      const empty = playersRes.rowCount === 0;

      io.emit("showTeam", {
        team_id: currentTeamId,
        empty
      });

      i = (i + 1) % teamIds.length;
    }, 7000);

    res.json({ message: "✅ Team loop started" });
  } catch (error) {
    console.error("❌ Error in start-team-loop:", error);
    res.status(500).json({ error: "Internal error" });
  }
});





// Stop team loop

app.post("/api/stop-team-loop", (req, res) => {
  console.log("🛑 Stopping team loop...");

  if (teamLoopInterval) {
    clearInterval(teamLoopInterval);
    teamLoopInterval = null;
  }

  io.emit("customMessageUpdate", "__CLEAR_CUSTOM_VIEW__");
  res.json({ message: "✅ Team loop stopped" });
});



// Store Current Team ID
//  Show team

let currentTeamId = null;

app.post("/api/show-team", (req, res) => {
  console.log("✅ /api/show-team HIT");
  currentTeamId = req.body.team_id;
  io.emit("showTeam", { team_id: currentTeamId, empty: false }); // ✅ Fixed
  res.json({ success: true });
});

app.get("/api/show-team", (req, res) => {
  res.json({ team_id: currentTeamId });
});


// 🔔 Notify spectators when a player is sold
app.post("/api/notify-sold", (req, res) => {
  io.emit("playerSold", req.body);
  res.json({ message: "Spectators notified" });
});

// ✅ GET all players for a tournament

app.get('/api/players', async (req, res) => {
  let { tournament_id, pool: poolParam } = req.query;
  tournament_id = parseInt(tournament_id);

  if (!tournament_id || isNaN(tournament_id)) {
    return res.status(400).json({ error: "Invalid tournament_id" });
  }

  try {
    let players = [];

    if (KCPL_ENABLED && poolParam) {
      if (poolParam === "C") {
        // Pool C + unsold from Pool B with C base price
        const result = await pool.query(
          `SELECT * FROM players 
           WHERE tournament_id = $1 
             AND base_category = 'C'
           ORDER BY id`,
          [tournament_id]
        );
        const unsoldB = await pool.query(
          `SELECT * FROM players 
           WHERE tournament_id = $1 
             AND base_category = 'B'
             AND (sold_status IS NULL OR sold_status = 'FALSE' OR sold_status = false)
           ORDER BY id`,
          [tournament_id]
        );
        players = [...result.rows, ...unsoldB.rows.map(p => ({
          ...p,
          base_price: KCPL_RULES.pools.C.base
        }))];
      } else if (poolParam === "D") {
        // Pool D + unsold from Pool B & C with D base price
        const result = await pool.query(
          `SELECT * FROM players 
           WHERE tournament_id = $1 
             AND base_category = 'D'
           ORDER BY id`,
          [tournament_id]
        );
        const unsoldBC = await pool.query(
          `SELECT * FROM players 
           WHERE tournament_id = $1 
             AND base_category IN ('B','C')
             AND (sold_status IS NULL OR sold_status = 'FALSE' OR sold_status = false)
           ORDER BY id`,
          [tournament_id]
        );
        players = [...result.rows, ...unsoldBC.rows.map(p => ({
          ...p,
          base_price: KCPL_RULES.pools.D.base
        }))];
      } else {
        // Default pool query
        const result = await pool.query(
          `SELECT * FROM players 
           WHERE tournament_id = $1 AND base_category = $2
           ORDER BY id`,
          [tournament_id, poolParam]
        );
        players = result.rows;
      }
    } else {
      const result = await pool.query(
        'SELECT * FROM players WHERE tournament_id = $1 ORDER BY id',
        [tournament_id]
      );
      players = result.rows;
    }

    res.json(players);
  } catch (err) {
    console.error("🔥 Error fetching players:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ Unified GET player by ID with correct base price rules

// ✅ GET player by ID with full details + KCPL base price handling
app.get('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  const activePool = req.query.active_pool || null; // passed from frontend

  const formatProfileImage = (filename) => {
    if (!filename) {
      return "https://ik.imagekit.io/auctionarena/uploads/players/profiles/default.jpg";
    }
    if (filename.startsWith("http")) {
      return filename;
    }
    return `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${filename}?tr=w-300,h-300,fo-face,z-0.4`;
  };

  try {
    const result = await pool.query(`
      SELECT p.*, 
             t.name AS team_name
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = result.rows[0];

    // --- Base price calculation ---
    if (KCPL_ENABLED && player.base_category) {
      if (activePool && activePool !== player.base_category) {
        // Migrated player from earlier pool
        player.base_price = KCPL_RULES.pools[activePool]?.base ?? KCPL_RULES.pools[player.base_category]?.base;
      } else {
        // Normal KCPL pool player
        player.base_price = KCPL_RULES.pools[player.base_category]?.base ?? player.base_price;
      }
    } else {
  // Non-KCPL logic
  const tRes = await pool.query(
    'SELECT base_price FROM tournaments WHERE id = $1',
    [player.tournament_id]
  );
  if (tRes.rows[0]?.base_price) {
    player.base_price = tRes.rows[0].base_price;
  } else {
    // ✅ Use base_category since component column doesn't exist
    const componentMap = { A: 1700, B: 3000, C: 5000 };
    player.base_price = componentMap[player.base_category] ?? 0;
  }
}

    // ✅ Ensure profile image is always ImageKit format
    player.profile_image = formatProfileImage(player.profile_image);

    res.json(player);
  } catch (err) {
    console.error("Error fetching player:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ✅ GET player by auction_serial with full details + KCPL base price handling
app.get('/api/players/by-serial/:serial', async (req, res) => {
  const { serial } = req.params;
  const { slug, tournament_id } = req.query;
  const activePool = req.query.active_pool || null; // passed from frontend

  const formatProfileImage = (filename) => {
    if (!filename) {
      return "https://ik.imagekit.io/auctionarena/uploads/players/profiles/default.jpg";
    }
    if (filename.startsWith("http")) {
      return filename;
    }
    return `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${filename}?tr=w-300,h-300,fo-face,z-0.4`;
  };

      try {
        let result;
        if (slug) {
            result = await pool.query(`
                SELECT p.*, t.name AS team_name
                FROM players p
                LEFT JOIN teams t ON p.team_id = t.id
                WHERE p.auction_serial = $1
                  AND p.tournament_id = (
                      SELECT id FROM tournaments WHERE slug = $2
                  )
            `, [serial, slug]);
        } else if (tournament_id) {
            result = await pool.query(`
                SELECT p.*, t.name AS team_name
                FROM players p
                LEFT JOIN teams t ON p.team_id = t.id
                WHERE p.auction_serial = $1
                  AND p.tournament_id = $2
            `, [serial, tournament_id]);
        } else {
            return res.status(400).json({ error: "Tournament identifier missing" });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Player not found" });
        }
    const player = result.rows[0];

    // --- Base price calculation ---
    if (KCPL_ENABLED && player.base_category) {
      if (activePool && activePool !== player.base_category) {
        // Migrated player from earlier pool
        player.base_price = KCPL_RULES.pools[activePool]?.base ?? KCPL_RULES.pools[player.base_category]?.base;
      } else {
        // Normal KCPL pool player
        player.base_price = KCPL_RULES.pools[player.base_category]?.base ?? player.base_price;
      }
    } else {
      // Non-KCPL logic
      const tRes = await pool.query(
        'SELECT base_price FROM tournaments WHERE id = $1',
        [player.tournament_id]
      );
      if (tRes.rows[0]?.base_price) {
        player.base_price = tRes.rows[0].base_price;
      } else {
        // ✅ Use base_category since component column doesn't exist
        const componentMap = { A: 1700, B: 3000, C: 5000 };
        player.base_price = componentMap[player.base_category] ?? 0;
      }
    }

    // ✅ Ensure profile image is always ImageKit format
    player.profile_image = formatProfileImage(player.profile_image);

    res.json(player);
  } catch (err) {
    console.error("Error fetching player by serial:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ✅ GET all teams
app.get('/api/teams', async (req, res) => {
  const { tournament_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM teams WHERE tournament_id = $1 ORDER BY id',
      [tournament_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET current player
app.get('/api/current-player', async (req, res) => {
  try {
    const cpResult = await pool.query(`SELECT * FROM current_player LIMIT 1`);
    if (cpResult.rowCount === 0) {
      // ✅ Always return valid JSON
      return res.status(200).json(null);
    }

    const currentPlayer = cpResult.rows[0];

    // ✅ Parse id defensively
    const rawId = currentPlayer.id;
    const playerId = typeof rawId === "string" ? parseInt(rawId) : rawId;

    if (!playerId || isNaN(playerId)) {
      console.warn("⚠️ Invalid current player ID:", rawId);
      return res.status(200).json(null);
    }

    // ✅ Query only if playerId is valid
    const pResult = await pool.query(
      `SELECT auction_serial, cricheroes_id FROM players WHERE id = $1`,
      [playerId]
    );

    const auction_serial = pResult.rows[0]?.auction_serial || null;

    res.status(200).json({ ...currentPlayer, auction_serial });
  } catch (err) {
    console.error("🔥 Error fetching current player:", err);
    res.status(500).json({ error: 'Server error' });
  }
});



// ✅ SET current player
app.put('/api/current-player', async (req, res) => {
  const { id, name, role, base_price, profile_image, sold_status, team_id, sold_price } = req.body;

  if (!id || !name || !role) {
    console.error("❌ Missing required player fields:", req.body);
    return res.status(400).json({ error: "Missing required player fields" });
  }

  try {
    await pool.query('DELETE FROM current_player');
    await pool.query(
      `INSERT INTO current_player (id, name, role, base_price, profile_image, sold_status, team_id, sold_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, role, base_price, profile_image, sold_status, team_id, sold_price]
    );
    res.json({ message: 'Current player updated' });
  } catch (err) {
    console.error("❌ DB Insert failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ✅ GET current bid
app.get('/api/current-bid', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM current_bid LIMIT 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ SET current bid
app.put('/api/current-bid', async (req, res) => {
  const { bid_amount, team_name } = req.body;
  try {
    await pool.query('DELETE FROM current_bid');
    await pool.query(
      `INSERT INTO current_bid (bid_amount, team_name) VALUES ($1, $2)`,
      [bid_amount, team_name]
    );
    res.json({ message: 'Current bid updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price, active_pool, sold_pool } = req.body;

  try {
    // 1️⃣ Fetch player info
    const playerRes = await pool.query(
      `SELECT id, tournament_id, base_category, sold_status
       FROM players
       WHERE id = $1`,
      [playerId]
    );

    if (playerRes.rowCount === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = playerRes.rows[0];
    const tournamentId = player.tournament_id;
    const playerCategory = player.base_category;
    const currentSoldStatus = player.sold_status;

    // 2️⃣ Determine effective category
    const effectiveCategory =
      KCPL_ENABLED &&
      active_pool &&
      (currentSoldStatus === null ||
        currentSoldStatus === false ||
        currentSoldStatus === "FALSE")
        ? active_pool
        : playerCategory;

    // 3️⃣ KCPL validation
    if (KCPL_ENABLED && team_id && sold_price) {
      const verdict = await canBidKCPL({
        teamId: team_id,
        bidAmount: Number(sold_price),
        playerCategory: effectiveCategory,
        tournamentId,
        activePool: active_pool || KCPL_ACTIVE_POOL
      });
      if (!verdict.ok) {
        return res.status(400).json({ error: verdict.reason });
      }
    }

    // 4️⃣ Enforce base price
    let minAllowed = 0;
    if (KCPL_ENABLED && effectiveCategory) {
      minAllowed = KCPL_RULES.pools[effectiveCategory]?.base ?? 0;
    } else {
      const tRes = await pool.query(
        'SELECT base_price FROM tournaments WHERE id = $1',
        [tournamentId]
      );

      if (tRes.rows[0]?.base_price != null) {
        minAllowed = Number(tRes.rows[0].base_price) || 0;
      } else {
        // ✅ Use base_category directly for static mapping
        minAllowed = { A: 1700, B: 3000, C: 5000 }[playerCategory] ?? 0;
      }
    }

    if (sold_price && sold_price < minAllowed) {
      return res
        .status(400)
        .json({ error: `Sold price must be at least ₹${minAllowed}` });
    }

    // 5️⃣ Update players
    await pool.query(
      `UPDATE players
       SET sold_status = $1,
           sold_price = $2,
           team_id = $3,
           sold_pool = $4
       WHERE id = $5`,
      [sold_status, sold_price, team_id, sold_pool || effectiveCategory, playerId]
    );

    // 6️⃣ Update current_player
    await pool.query(
      `UPDATE current_player
       SET sold_status = $1,
           sold_price = $2,
           team_id = $3
       WHERE id = $4`,
      [sold_status, sold_price, team_id, playerId]
    );

    // 7️⃣ KCPL state update
    if (KCPL_ENABLED && team_id && sold_price) {
      recordWinKCPL({
        teamId: team_id,
        price: Number(sold_price),
        playerCategory: KCPL_ACTIVE_POOL,
        playerId
      });
    }

    // 8️⃣ Update team stats
    if (team_id && tournamentId) {
      await updateTeamStats(team_id, tournamentId);
    }

    res.json({ message: "Player updated and team stats refreshed" });

  } catch (err) {
    console.error("❌ PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});





// ✅ GET tournament by ID
app.get('/api/tournaments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.put('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price, active_pool, sold_pool } = req.body;

  try {
    // 1️⃣ Get existing player details
    const playerRes = await pool.query(
      `SELECT id, tournament_id, base_category, sold_status, team_id AS old_team_id
       FROM players
       WHERE id = $1`,
      [playerId]
    );

    if (playerRes.rowCount === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = playerRes.rows[0];
    const tournamentId = player.tournament_id;
    const playerCategory = player.base_category; // e.g. 'A', 'B', 'C'
    const currentSoldStatus = player.sold_status;
    const oldTeamId = player.old_team_id;

    // 2️⃣ Determine effective category
    const effectiveCategory =
      KCPL_ENABLED &&
      active_pool &&
      (currentSoldStatus === null ||
        currentSoldStatus === false ||
        currentSoldStatus === "FALSE")
        ? active_pool
        : playerCategory;

    // 3️⃣ KCPL-specific bidding validation
    if (KCPL_ENABLED && team_id && sold_price) {
      const verdict = await canBidKCPL({
        teamId: team_id,
        bidAmount: Number(sold_price),
        playerCategory: effectiveCategory,
        tournamentId,
        activePool: active_pool || KCPL_ACTIVE_POOL
      });
      if (!verdict.ok) {
        return res.status(400).json({ error: verdict.reason });
      }
    }

    // 4️⃣ Base price enforcement
    let minAllowed = 0;
    if (KCPL_ENABLED && effectiveCategory) {
      // KCPL pool base price
      minAllowed = KCPL_RULES.pools[effectiveCategory]?.base ?? 0;
    } else {
      // Non-KCPL tournament
      const tRes = await pool.query(
        'SELECT base_price FROM tournaments WHERE id = $1',
        [tournamentId]
      );
      if (tRes.rows[0]?.base_price != null) {
        minAllowed = Number(tRes.rows[0].base_price) || 0;
      } else {
        // Fallback to static mapping using base_category
        minAllowed = { A: 1700, B: 3000, C: 5000 }[playerCategory] ?? 0;
      }
    }

    if (sold_price && sold_price < minAllowed) {
      return res
        .status(400)
        .json({ error: `Sold price must be at least ₹${minAllowed}` });
    }

    // 5️⃣ Update player record
    await pool.query(
      `UPDATE players
       SET sold_status = $1,
           sold_price = $2,
           team_id = $3,
           sold_pool = $4
       WHERE id = $5`,
      [sold_status, sold_price, team_id, sold_pool || effectiveCategory, playerId]
    );

    // 6️⃣ Update current_player table
    await pool.query(
      `UPDATE current_player
       SET sold_status = $1,
           sold_price = $2,
           team_id = $3
       WHERE id = $4`,
      [sold_status, sold_price, team_id, playerId]
    );

    // 7️⃣ KCPL state update (only for KCPL mode)
    if (KCPL_ENABLED && team_id && sold_price) {
      recordWinKCPL({
        teamId: team_id,
        price: Number(sold_price),
        playerCategory: KCPL_ACTIVE_POOL,
        playerId
      });
    }

    // 8️⃣ Update stats for both old and new teams
    if (tournamentId) {
      if (oldTeamId && oldTeamId !== team_id) {
        await updateTeamStats(oldTeamId, tournamentId);
      }
      if (team_id) {
        await updateTeamStats(team_id, tournamentId);
      }
    }

    res.json({ message: "Player updated and all relevant team stats refreshed" });

  } catch (err) {
    console.error("❌ PUT error:", err);
    res.status(500).json({ error: err.message });
  }
});





// ✅ PATCH team
app.patch('/api/teams/:id', async (req, res) => {
  const teamId = req.params.id;
  const { budget, players } = req.body;
  try {
    await pool.query(
      `UPDATE teams SET players = $1 WHERE id = $2`,
      [players, teamId]
    );
    res.json({ message: 'Team updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update teams
app.put('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  const { name, logo, tournament_id, budget } = req.body;

  try {
    await pool.query(
      'UPDATE teams SET name=$1, logo=$2, tournament_id=$3, updated_at=NOW() WHERE id=$4',
      [name, logo, tournament_id, id]
    );
    res.json({ message: "Team updated successfully" });
  } catch (err) {
    console.error("Error updating team:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// Get team details
app.get('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Team not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching team:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// cURRENT PLAYER RESET
app.post("/api/current-player/reset", async (req, res) => {
  try {
    await pool.query("DELETE FROM current_player");
    res.json({ message: "Current player reset" });
  } catch (err) {
    console.error("Error resetting current player:", err);
    res.status(500).json({ error: "Server error" });
  }
});

let customMessage = null;

// Get custom message
app.get('/api/custom-message', (req, res) => {
  res.json({ message: customMessage });
});

// Set custom message
app.post('/api/custom-message', (req, res) => {
  customMessage = req.body.message || null;
  io.emit("customMessageUpdate", customMessage);
  res.json({ message: "Custom message updated" });
});

app.post("/api/notify-player-change", (req, res) => {
  io.emit("playerChanged", req.body); // optional: send updated player
  res.json({ message: "Spectators notified of player change" });
});

// Update team when Player is reopened

app.post('/api/players/:id/reopen', async (req, res) => {
  const playerId = req.params.id;
  console.log(`🟡 /api/players/${playerId}/reopen route hit`);

  try {
    const playerRes = await pool.query(
      `SELECT team_id, tournament_id FROM players WHERE id = $1`,
      [playerId]
    );
    const player = playerRes.rows[0];

    if (!player) {
      console.log(`❌ Player ${playerId} not found`);
      return res.status(404).json({ error: 'Player not found' });
    }

    console.log(`🧼 Reopening player ${playerId} from team ${player.team_id}`);

    await pool.query(
      `UPDATE players SET sold_status = NULL, team_id = NULL, sold_price = NULL WHERE id = $1`,
      [playerId]
    );

    if (player.team_id && player.tournament_id) {
      await updateTeamStats(player.team_id, player.tournament_id);
    }

    res.json({ message: 'Player reopened and team stats updated' });
  } catch (err) {
    console.error("❌ Error reopening player:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all players by slug

app.get('/api/tournaments/slug/:slug', async (req, res) => {
  const { slug } = req.params;
  const result = await pool.query('SELECT * FROM tournaments WHERE slug = $1', [slug]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Tournament not found' });
  res.json(result.rows[0]);
});



// Auction reset logic

app.post("/api/reset-auction", async (req, res) => {
  try {
    const tournamentId = req.body.tournament_id;

    if (!tournamentId) {
      return res.status(400).json({ error: "Tournament ID is required." });
    }

    // 1. Reset all players
    const resetPlayersRes = await pool.query(`
      UPDATE players
      SET sold_status = NULL, team_id = NULL, sold_price = NULL
      WHERE tournament_id = $1
      RETURNING id
    `, [tournamentId]);

    console.log(`🎯 Players reset: ${resetPlayersRes.rowCount}`);

    // 2. Reset team budgets
    const tournamentRes = await pool.query(
      `SELECT auction_money FROM tournaments WHERE id = $1`,
      [tournamentId]
    );

    const budget = tournamentRes.rows[0]?.auction_money || 0;

    await pool.query(
      `UPDATE teams SET budget = $1 WHERE tournament_id = $2`,
      [budget, tournamentId]
    );

    // 3. Recalculate team stats
    const teamRes = await pool.query(
      `SELECT id FROM teams WHERE tournament_id = $1`,
      [tournamentId]
    );

    await Promise.all(
      teamRes.rows.map(row => updateTeamStats(row.id, tournamentId))
    );

    // 4. Reset current player
    await pool.query("DELETE FROM current_player");

    // 5. Reset current bid
    await pool.query("DELETE FROM current_bid");
    await pool.query("INSERT INTO current_bid (bid_amount, team_name) VALUES ($1, $2)", [0, 'UNASSIGNED']);

    res.json({ message: "✅ Auction has been reset and team stats updated." });
  } catch (err) {
    console.error("❌ Error resetting auction:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

// Accepts and validates a secret bid based on team code and max bid limit

app.post("/api/secret-bid", async (req, res) => {
  const { tournament_id, player_serial, team_code, bid_amount } = req.body;

  if (!tournament_id || !player_serial || !team_code || !bid_amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const teamRes = await pool.query(
      `SELECT id, max_bid_allowed FROM teams WHERE tournament_id = $1 AND secret_code = $2`,
      [tournament_id, team_code]
    );

    if (teamRes.rowCount === 0) {
      return res.status(404).json({ error: "Invalid team code" });
    }

    const team = teamRes.rows[0];
    if (bid_amount > team.max_bid_allowed) {
      return res.status(400).json({ error: "Bid exceeds max allowed" });
    }

    await pool.query(
      `INSERT INTO secret_bids (tournament_id, player_serial, team_id, bid_amount, created_at)
   VALUES ($1, $2, $3, $4, NOW())
   ON CONFLICT (tournament_id, player_serial, team_id)
   DO UPDATE SET bid_amount = EXCLUDED.bid_amount, created_at = NOW()`,
      [tournament_id, player_serial, team.id, bid_amount]
    );


    res.json({ message: "✅ Secret bid submitted." });
  } catch (err) {
    console.error("❌ Error submitting secret bid:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Retrieve all bids for a player (for Admin to reveal).

app.get("/api/secret-bids", async (req, res) => {
  const { tournament_id, player_serial } = req.query;

  try {
    const result = await pool.query(`
      SELECT sb.*, t.name as team_name, t.logo
      FROM secret_bids sb
      JOIN teams t ON sb.team_id = t.id
      WHERE sb.tournament_id = $1 AND sb.player_serial = $2
      ORDER BY sb.bid_amount DESC
    `, [tournament_id, player_serial]);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching secret bids:", err);
    res.status(500).json({ error: "Failed to retrieve bids" });
  }
});

// Finalize winner: mark player as SOLD and update team stats.

app.post("/api/secret-bid/winner", async (req, res) => {
  const { player_id, team_id, bid_amount } = req.body;

  if (!player_id || !team_id || !bid_amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await pool.query(`
      UPDATE players
      SET sold_status = 'TRUE', team_id = $1, sold_price = $2
      WHERE id = $3
    `, [team_id, bid_amount, player_id]);

    await pool.query(`
      UPDATE current_player
      SET sold_status = 'TRUE',
          team_id = $1,
          sold_price = $2
      WHERE id = $3
    `, [team_id, bid_amount, player_id]);

    const playerRes = await pool.query(
      `SELECT tournament_id FROM players WHERE id = $1`,
      [player_id]
    );
    const tournament_id = playerRes.rows[0]?.tournament_id;
    if (tournament_id) {
      await updateTeamStats(team_id, tournament_id);
    }

    // 🔔 Emit playerSold to trigger SOLD UI in spectator
    const updatedPlayerRes = await pool.query(
      `SELECT * FROM players WHERE id = $1`,
      [player_id]
    );
    const updatedPlayer = updatedPlayerRes.rows[0];
    io.emit("playerSold", updatedPlayer);

    // ✅ KCPL tracking
    if (KCPL_ENABLED && team_id && sold_price) {
      recordWinKCPL({
        teamId: team_id,
        price: Number(sold_price),
        activePool: KCPL_ACTIVE_POOL,
        playerCategory // ✅ pass correct pool
      });
    }

    res.json({ message: "✅ Player marked as SOLD via secret bid." });
  } catch (err) {
    console.error("❌ Error finalizing winner:", err);
    res.status(500).json({ error: "Could not finalize winner" });
  }
});


// PATCH request for secret bidding

app.patch("/api/current-player", async (req, res) => {
  const { secret_bidding_enabled } = req.body;

  try {
    const result = await pool.query("SELECT id FROM current_player LIMIT 1");
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No current player set" });
    }

    const currentPlayerId = result.rows[0].id;

    await pool.query(
      `UPDATE current_player SET secret_bidding_enabled = $1 WHERE id = $2`,
      [secret_bidding_enabled, currentPlayerId]
    );

    // 🧼 If disabling, clear related secret bids
    if (!secret_bidding_enabled) {
      // Fetch tournament_id and player_serial
      const playerData = await pool.query(`
        SELECT p.tournament_id, p.auction_serial
        FROM players p
        WHERE p.id = $1
      `, [currentPlayerId]);

      const { tournament_id, auction_serial } = playerData.rows[0] || {};

      if (tournament_id && auction_serial) {
        const deleteRes = await pool.query(`
          DELETE FROM secret_bids
          WHERE tournament_id = $1 AND player_serial = $2
        `, [tournament_id, auction_serial]);

        console.log(`🧼 Cleared ${deleteRes.rowCount} secret bids for tournament ${tournament_id} player #${auction_serial}`);
      }
    }

    res.json({ message: "Current player updated" });
  } catch (err) {
    console.error("❌ Failed to update current player:", err);
    res.status(500).json({ error: "Failed to update current player" });
  }
});

// Generate secret-code for teams

app.post('/api/teams/generate-secret-codes', async (req, res) => {
  const { slug } = req.body;

  if (!slug) return res.status(400).json({ error: 'Slug is required' });

  try {
    const tournament = await pool.query(`SELECT id FROM tournaments WHERE slug = $1`, [slug]);
    if (tournament.rowCount === 0) return res.status(404).json({ error: 'Tournament not found' });

    const tournamentId = tournament.rows[0].id;
    const teams = await pool.query(`SELECT id FROM teams WHERE tournament_id = $1`, [tournamentId]);

    const generatedCodes = new Set();
    const updates = [];

    for (const team of teams.rows) {
      let code;
      do {
        code = Math.floor(10000 + Math.random() * 90000); // 5-digit
      } while (generatedCodes.has(code));

      generatedCodes.add(code);
      updates.push(
        pool.query(`UPDATE teams SET secret_code = $1 WHERE id = $2`, [code, team.id])
      );
    }

    await Promise.all(updates);

    res.json({ message: '✅ Secret codes generated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '❌ Failed to generate secret codes.' });
  }
});



app.get("/api/cricheroes-stats/:playerId", async (req, res) => {
    const { playerId } = req.params;

    try {
        const url = `https://cricheroes.com/player-profile/${playerId}/stats`;

        const { data: html } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                // Add your logged-in cookie if needed for pro stats:
                // Cookie: "your_pro_account_cookie_here"
            }
        });

        const $ = cheerio.load(html);

        const getStatValue = (label) => {
            label = label.toUpperCase();

            // Find the first element containing the exact label (case-insensitive)
            const el = $("*")
                .filter((i, e) => $(e).text().trim().toUpperCase() === label)
                .first();

            if (!el.length) return null;

            const tryParse = (txt) => {
                const clean = txt.replace(/[^\d]/g, "").trim();
                return clean || null;
            };

            // 1️⃣ Try previous sibling
            let val = tryParse(el.prev().text());
            if (val) return val;

            // 2️⃣ Try next sibling
            val = tryParse(el.next().text());
            if (val) return val;

            // 3️⃣ Look within parent for a number (excluding the label itself)
            val = tryParse(
                el.parent().children().not(el).text()
            );
            if (val) return val;

            // 4️⃣ Look in nearby siblings up the DOM
            val = tryParse(el.parent().next().text());
            if (val) return val;

            return null;
        };

        const stats = {
            matches: getStatValue("MATCHES"),
            runs: getStatValue("RUNS"),
            wickets: getStatValue("WICKETS")
        };

        res.json(stats);
    } catch (err) {
        console.error("Error scraping Cricheroes:", err.message);
        res.status(500).json({ error: "Failed to fetch Cricheroes stats" });
    }
});





app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// ✅ Start server
server.listen(port, () => {
  console.log(`✅ Server & Socket.IO running on http://localhost:${port}`);
});
