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
import { KCPL_RULES } from './kcplRules.js';
import groupRoutes from "./routes/groupRoutes.js";


dotenv.config();

const TOURNAMENT_ID = CONFIG.TOURNAMENT_ID;


const app = express();
const port = CONFIG.PORT;


const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket"],    // 🚀 Only WebSocket transport
  allowUpgrades: false,         // 🚫 Don’t try long-poll upgrade
  pingInterval: 10000,
  pingTimeout: 5000,
  cors: {
    origin: [
      "https://arena.auctionarena.live",
      "http://localhost:3000",
      "https://cricket-auction-live.pages.dev",
      "https://live.eaarena.in"
    ],
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

// Idempotent schema updates to support per-tournament current_* rows
async function ensureSchema() {
  try {
    await pool.query(`
      ALTER TABLE IF EXISTS current_player
      ADD COLUMN IF NOT EXISTS tournament_id INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_current_player_tournament_all
        ON current_player (tournament_id);
    `);
    await pool.query(`
      ALTER TABLE IF EXISTS current_bid
      ADD COLUMN IF NOT EXISTS tournament_id INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_current_bid_tournament_all
        ON current_bid (tournament_id);
    `);
  } catch (e) {
    console.warn('ensureSchema skipped:', e?.message || e);
  }
}

ensureSchema();

// ===== KCPL helpers =====
function sumBy(arr, f) { return arr.reduce((a, x) => a + f(x), 0); }

async function getTeamPoolSnapshot(teamId, tournamentId) {
  const result = await pool.query(
    `
    SELECT sold_pool AS pool,
           COALESCE(SUM(sold_price), 0) AS spent,
           COUNT(*) FILTER (WHERE sold_status IN ('TRUE', true)) AS bought
    FROM players
    WHERE tournament_id = $1
      AND team_id = $2
      AND sold_status IN ('TRUE', true)
      AND sold_pool IN ('A','B','C','D','X')
    GROUP BY sold_pool
    `,
    [tournamentId, teamId]
  );

  const byPool = {};
  for (const key of Object.keys(KCPL_RULES.pools)) {
    byPool[key] = {
      spent: 0,
      bought: 0,
      limit: KCPL_RULES.pools[key].teamCap,
      minReq: KCPL_RULES.pools[key].minReq,
      maxCount: KCPL_RULES.pools[key].maxCount
    };
  }

  for (const row of result.rows) {
    const k = (row.pool || '').toUpperCase();
    if (byPool[k]) {
      byPool[k].spent = Number(row.spent) || 0;
      byPool[k].bought = Number(row.bought) || 0;
    }
  }

  return { byPool };
}


// Basic tournaments directory for admin tooling
app.get("/api/tournaments", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, COALESCE(title, slug) AS title FROM tournaments ORDER BY id DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Failed to list tournaments", error);
    res.status(500).json({ error: "Failed to load tournaments" });
  }
});

app.use("/api/tournaments", groupRoutes({ pool, io }));


function computeEffectiveCaps(snapshot, rules) {
  const eff = {};
  let carry = 0; // carry flows A -> B -> C -> D

  for (const p of rules.order) {
    const rule = rules.pools[p];
    const base = Number.isFinite(rule.teamCap) ? Number(rule.teamCap) : Number.POSITIVE_INFINITY;
    const spent = Number(snapshot.byPool[p]?.spent || 0);
    const bought = Number(snapshot.byPool[p]?.bought || 0);

    // Effective cap in THIS pool = its own cap + carry from previous pool
    const capHere = base + carry;
    eff[p] = capHere;

    // Reserve this pool's remaining minimums (do NOT reserve future pools here)
    const minLeft = Math.max((rule.minReq || 0) - bought, 0);
    const reserve = minLeft * (rule.base || 0);

    // Carry to the NEXT pool = leftover after spending here and protecting THIS pool's mins
    carry = Math.max(0, capHere - spent - reserve);
  }

  return eff;
}



function computeMaxBidFor(pool, snapshot, rules) {
  const byPool = snapshot.byPool || {};
  const poolRule = rules.pools[pool];

  // ---- totals / rooms ----
  const spentTotal = Object.values(byPool).reduce((s, v) => s + (v.spent || 0), 0);
  const roomOverall = (rules.overallUsable ?? Infinity) - spentTotal;

  const effCaps = computeEffectiveCaps(snapshot, rules);        // rolling carry (A→B→C→D)
  const spentHere = byPool[pool]?.spent || 0;
  const roomPool = (effCaps[pool] ?? Infinity) - spentHere;      // money left within THIS pool cap

  // ---- headcount (slots) ----
  const boughtTotal = Object.values(byPool).reduce((s, v) => s + (v.bought || 0), 0);
  const remainingSlots = rules.totalSquadSize - boughtTotal;      // BEFORE buying the next player here
  const alreadyInThis = byPool[pool]?.bought || 0;

  const idx = rules.order.indexOf(pool);
  const futurePools = rules.order.slice(idx + 1);

  // Reserve ONLY future pools' minimums (slot-level)
  const reserveFutureMinSlots = futurePools.reduce((sum, p) => {
    const r = rules.pools[p];
    const bought = byPool[p]?.bought || 0;
    return sum + Math.max(0, (r.minReq || 0) - bought);
  }, 0);

  let slotsMax = Math.max(0, remainingSlots - reserveFutureMinSlots);

  // Cap by THIS pool's maxCount if finite
  const hardCap = rules.pools[pool]?.maxCount;
  if (Number.isFinite(hardCap)) {
    slotsMax = Math.min(slotsMax, Math.max(0, hardCap - alreadyInThis));
  }

  // ---- money-limited max players in THIS pool (so "maxPlayers" is realistic) ----
  const baseHere = poolRule.base || 0;
  let moneyMax = slotsMax;

  if (baseHere > 0) {
    if (futurePools.length === 1) {
      // Second-last pool (e.g., C) → protect last pool's cap while buying k players here.
      const q = futurePools[0];                     // the last pool (e.g., 'D')
      const baseQ = rules.pools[q]?.base || 0;
      const capQ = Number(rules.pools[q]?.teamCap || 0);

      // Find the largest k (0..slotsMax) such that:
      // carryAfterK (room left in THIS pool's cap) covers the part of last pool
      // not afforded by its own cap: max(0, (remainingSlots - k)*baseQ - capQ)
      let kFeasible = 0;
      for (let k = 0; k <= slotsMax; k++) {
        const carryAfterK = roomPool - k * baseHere;
        const needLastPool = Math.max(0, (remainingSlots - k) * baseQ - capQ);
        if (carryAfterK >= needLastPool) kFeasible = k; else break;
      }
      moneyMax = Math.min(moneyMax, kFeasible);
    } else if (futurePools.length === 0) {
      // Last pool (e.g., D): limited by its own cap
      moneyMax = Math.min(moneyMax, Math.floor(roomPool / baseHere));
    } else {
      // Earlier pools
      moneyMax = Math.min(moneyMax, Math.floor(roomPool / baseHere));
    }
  }

  const maxPlayers = Math.max(0, Math.min(slotsMax, moneyMax));

  // unmet future pools (for messaging)
  const unmetPools = futurePools.filter(p => {
    const r = rules.pools[p];
    const bought = byPool[p]?.bought || 0;
    return bought < (r.minReq || 0);
  });

  // If we cannot buy any more in this pool or no money left, maxBid is 0
  if (maxPlayers <= 0 || roomPool <= 0 || roomOverall <= 0) {
    return { maxBid: 0, maxPlayers: 0, unmetPools };
  }

  // ---- Max Bid for the NEXT player here ----
  // Money we must keep AFTER buying one more here:
  // - this pool's remaining minimum (after this buy)
  // - future pools' minimum money
  // - **when this is the last pool**: reserve (remainingSlots - 1) * baseHere
  //   so we can finish the squad at base price within this pool's cap.

  const remAfterThis = Math.max(0, remainingSlots - 1);

  // This pool's remaining minimum after this buy
  const minLeftThisPoolAfter = Math.max((poolRule.minReq || 0) - (alreadyInThis + 1), 0);
  const poolNeedAfter = minLeftThisPoolAfter * baseHere;

  // Future pools' minimum money (only future)
  const futureNeedsMoney = futurePools.reduce((sum, p) => {
    const r = rules.pools[p];
    const bought = byPool[p]?.bought || 0;
    const minLeftQ = Math.max((r.minReq || 0) - bought, 0);
    return sum + minLeftQ * (r.base || 0);
  }, 0);

  // D-cap safeguard when we're in the second-last pool (e.g., C)
  let capGuardFuture = 0;
  if (futurePools.length === 1) {
    const q = futurePools[0];
    const baseQ = rules.pools[q]?.base || 0;
    const capQ = Number(rules.pools[q]?.teamCap || 0);
    // After buying ONE here, last pool must be able to fill remAfterThis slots at base under its cap.
    const needQTotal = remAfterThis * baseQ;
    capGuardFuture = Math.max(0, needQTotal - capQ);
  }

  // **Last-pool reserve**: if we're in the last pool (e.g., D), we must still
  // afford (remAfterThis) players at base within THIS pool's cap.
  const lastPoolReserve = (futurePools.length === 0 && baseHere > 0)
    ? remAfterThis * baseHere
    : 0;

  // Tight constraints
  const maxByPool = roomPool - poolNeedAfter - capGuardFuture - lastPoolReserve;
  const maxByOverall = roomOverall - (poolNeedAfter + futureNeedsMoney + lastPoolReserve);

  const maxBid = Math.max(0, Math.min(maxByPool, maxByOverall));
  return { maxBid, maxPlayers, unmetPools };
}






function computeMaxPlayersFor(poolKey, snap, rules) {
  const poolRule = rules.pools[poolKey];
  const bought = snap.byPool[poolKey]?.bought || 0;

  if (!poolRule || poolRule.maxCount === undefined) return 0;

  // Max players left = maxCount - already bought
  return Math.max(0, poolRule.maxCount - bought);
}





async function canBuyAnotherInPool(teamId, tournamentId, poolName) {
  const snap = await getTeamPoolSnapshot(teamId, tournamentId);
  const poolRule = KCPL_RULES.pools[poolName];
  const alreadyBought = snap.byPool[poolName]?.bought || 0;
  const alreadySpent = snap.byPool[poolName]?.spent || 0;

  // 1️⃣ Max players per pool cap
  if (poolRule?.maxReq && alreadyBought >= poolRule.maxReq) {
    return { allowed: false, reason: "Max players cap reached", unmetPools: [] };
  }

  // 2️⃣ TeamCap per pool (budget cap)
  const effCaps = computeEffectiveCaps(snap, KCPL_RULES);
  const poolCap = effCaps[poolName] ?? Infinity;
  if (alreadySpent >= poolCap) {
    return { allowed: false, reason: "Team budget cap for this pool exhausted", unmetPools: [] };
  }

  // 3️⃣ Normal max bid check
  const { maxBid, unmetPools } = computeMaxBidFor(poolName, snap, KCPL_RULES);
  if (maxBid <= 0) {
    return { allowed: false, reason: "No max bid room (slots or money constraint)", unmetPools };
  }

  return { allowed: true, reason: "Allowed", unmetPools };
}


// Track active KCPL pool (server-side optional, you already send it from client)
let ACTIVE_KCPL_POOL = null;

app.post("/api/kcpl/initialize", async (req, res) => {
  // no-op placeholder (you may pre-warm anything or verify schema here)
  return res.json({ ok: true });
});

app.post("/api/kcpl/validate-bid", async (req, res) => {
  try {
    const { team_id, bid_amount, player_id, active_pool } = req.body;

    // fetch player
    const player = await pool.query(
      "SELECT id, tournament_id FROM players WHERE id=$1",
      [player_id]
    );
    if (player.rows.length === 0) {
      return res.status(404).json({ ok: false, reason: "player not found" });
    }
    const tournamentId = player.rows[0].tournament_id;

    const poolName = active_pool || ACTIVE_KCPL_POOL || null;
    if (!KCPL_ENABLED || !poolName) {
      return res.status(400).json({ ok: false, reason: "KCPL mode disabled or no active pool" });
    }
    const rules = KCPL_RULES;

    // snapshot of current team
    const snap = await getTeamPoolSnapshot(team_id, tournamentId);

    // 🔹 enforce squad size
    const totalBought = Object.values(snap.byPool)
      .reduce((sum, v) => sum + v.bought, 0);
    if (totalBought >= rules.totalSquadSize) {
      return res.json({
        ok: false,
        reason: `Max squad size ${rules.totalSquadSize} already reached`
      });
    }

    // 🔹 enforce per-pool maxCount
    const maxCount = rules.pools[poolName].maxCount ?? Infinity;
    if (snap.byPool[poolName].bought + 1 > maxCount) {
      return res.json({
        ok: false,
        reason: `Pool ${poolName} max ${maxCount} players reached`
      });
    }

    // 🔹 compute max bid using updated function
    const { maxBid, unmetPools } = computeMaxBidFor(poolName, snap, rules);

    if (maxBid === 0) {
      return res.json({
        ok: false,
        reason: `Cannot buy more from Pool ${poolName} — must leave slots for: ${unmetPools.join(", ")}`,
        unmetPools
      });
    }

    if (bid_amount > maxBid) {
      return res.json({
        ok: false,
        reason: `Exceeds max allowed ₹${maxBid}`,
        maxBid,
        unmetPools
      });
    }

    return res.json({ ok: true, maxBid, unmetPools });

  } catch (e) {
    console.error("Error validating bid:", e);
    return res.status(500).json({ ok: false, reason: "server error" });
  }
});



// Per-team pooled snapshot
app.get("/api/kcpl/team-state/:teamId", async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);

    // 1️⃣ Get tournament_id and team name
    const t = await pool.query(
      "SELECT tournament_id, name FROM teams WHERE id=$1",
      [teamId]
    );
    if (!t.rows.length) return res.status(404).json({ error: "team not found" });
    const tournamentId = t.rows[0].tournament_id;

    // 2️⃣ Snapshot of team pools
    const snap = await getTeamPoolSnapshot(teamId, tournamentId);

    // 3️⃣ Effective caps (carryover logic A→B→C→D)
    const effCaps = computeEffectiveCaps(snap, KCPL_RULES);

    // 4️⃣ Pool stats (maxBid, maxPlayers, unmetPools for each pool)
    const poolStats = {};
    for (const p of KCPL_RULES.order) {
      const bought = snap.byPool[p]?.bought || 0;
      const cap = KCPL_RULES.pools[p].maxCount ?? Infinity;
      if (Number.isFinite(cap) && bought >= cap) {
        poolStats[p] = { maxBid: 0, maxPlayers: 0, unmetPools: [p] };
      } else {
        poolStats[p] = computeMaxBidFor(p, snap, KCPL_RULES);
      }
    }

    // 5️⃣ Respond with compact snapshot
    res.json({
      teamId,
      teamName: t.rows[0].name,
      spentByPool: Object.fromEntries(
        Object.entries(snap.byPool).map(([k, v]) => [k, v.spent])
      ),
      boughtByPool: Object.fromEntries(
        Object.entries(snap.byPool).map(([k, v]) => [k, v.bought])
      ),
      limitByPool: effCaps,
      poolStats,
    });
  } catch (err) {
    console.error("❌ Error in /api/kcpl/team-state:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// All teams snapshot
app.get("/api/kcpl/team-states/:tournamentId", async (req, res) => {
  const tournamentId = Number(req.params.tournamentId);
  const activePool = KCPL_ENABLED ? (req.query.activePool || ACTIVE_KCPL_POOL) : null;

  const teams = await pool.query(
    "select id, name from teams where tournament_id=$1 order by id",
    [tournamentId]
  );

  const out = [];
  for (const team of teams.rows) {
    const snap = await getTeamPoolSnapshot(team.id, tournamentId);
    const effCaps = computeEffectiveCaps(snap, KCPL_RULES);

    const poolStats = {};

    for (const p of KCPL_RULES.order) {
      const bought = snap.byPool[p]?.bought || 0;
      const cap = KCPL_RULES.pools[p].maxCount ?? Infinity; // <-- correct field
      if (Number.isFinite(cap) && bought >= cap) {
        poolStats[p] = { maxBid: 0, maxPlayers: 0, unmetPools: [p] };
      } else {
        poolStats[p] = computeMaxBidFor(p, snap, KCPL_RULES);
      }
    }



    out.push({
      teamId: team.id,
      teamName: team.name,
      spentByPool: Object.fromEntries(Object.entries(snap.byPool).map(([k, v]) => [k, v.spent])),
      boughtByPool: Object.fromEntries(Object.entries(snap.byPool).map(([k, v]) => [k, v.bought])),
      limitByPool: effCaps,
      poolStats
    });

  }

  res.json(out);
});

// --- Active pool get/set + broadcast ---
app.get("/api/kcpl/active-pool", (req, res) => {
  res.json({ pool: KCPL_ENABLED ? ACTIVE_KCPL_POOL : null });
});


app.post("/api/kcpl/active-pool", (req, res) => {
  const { pool } = req.body || {};
  if (!["A", "B", "C", "D"].includes((pool || "").toUpperCase())) {
    return res.status(400).json({ ok: false, error: "Invalid pool" });
  }
  if (KCPL_ENABLED) {
    ACTIVE_KCPL_POOL = pool.toUpperCase();
    io.emit("kcplPoolChanged", ACTIVE_KCPL_POOL);
  }
  return res.json({ ok: true, pool: ACTIVE_KCPL_POOL });
});








// Log connections
io.on("connection", (socket) => {
  console.log("✅ Spectator connected via Socket.IO");

  socket.on("bidUpdated", (data) => {
    console.log("📢 Broadcasting bidUpdated:", data);
    io.emit("bidUpdated", data); // <--- THIS is what was missing
  });

  // NEW: rebroadcast sale status instantly
  socket.on("playerSold", (payload) => {
    console.log("📢 Broadcasting playerSold:", payload);
    io.emit("playerSold", payload); // spectators will fetch/update immediately
  });

  socket.on("playerUnsold", (payload) => {
    console.log("📢 Broadcasting playerUnsold:", payload);
    io.emit("playerUnsold", payload);
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
const themeBySlug = new Map();
let globalTheme = '';

const normalizeSlug = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const getThemeForSlug = (slug) => {
  const normalized = normalizeSlug(slug);
  if (!normalized) return globalTheme;
  return themeBySlug.get(normalized) ?? globalTheme;
};

app.get('/api/theme', (req, res) => {
  const theme = getThemeForSlug(req.query?.slug);
  res.json({ theme });
});

app.post('/api/theme', (req, res) => {
  const { theme } = req.body || {};
  if (typeof theme !== 'string' || !theme.trim()) {
    return res.status(400).json({ error: "Theme is required" });
  }

  const cleanedTheme = theme.trim();
  const slug = normalizeSlug(req.body?.slug ?? req.query?.slug);

  if (slug) {
    themeBySlug.set(slug, cleanedTheme);
  } else {
    globalTheme = cleanedTheme;
  }

  const payload = slug ? { theme: cleanedTheme, slug } : cleanedTheme;
  io.emit("themeUpdate", payload);

  res.json({ message: "Theme updated", theme: cleanedTheme, slug });
});

// ===== KCPL global flag (default OFF) =====
let KCPL_ENABLED = false;

// Small helper to compute base_price respecting KCPL toggle

async function getEffectiveBasePrice(player, activePool) {
  const cat = String(player.base_category || '').toUpperCase();

  // KCPL base if KCPL is ON or caller provided an active pool
  if ((KCPL_ENABLED || activePool) && cat) {
    const pool = (activePool && activePool !== cat) ? activePool : cat;
    const kcplBase = KCPL_RULES.pools?.[pool]?.base;
    if (kcplBase != null) return kcplBase;
  }

  // Tournament first
  const tRes = await pool.query(
    'SELECT base_price, min_base_price FROM tournaments WHERE id = $1',
    [player.tournament_id]
  );
  const t = tRes.rows[0];

  // 1) If tournament.base_price is defined → use it
  if (t?.base_price != null) return Number(t.base_price) || 0;

  // 2) If tournament.min_base_price is defined → map by **CATEGORY** A/B/C
  if (t?.min_base_price != null) {
    const catMap = { A: 1700, B: 3000, C: 5000 };
    return catMap[cat] ?? 0;  // (X/D/etc → 0 by design)
  }

  // Final fallback (legacy – still prefer category if present)
  const catMap = { A: 1700, B: 3000, C: 5000 };
  return catMap[cat] ?? 0;
}





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

const teamLoopIntervals = new Map();

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

    const existingInterval = teamLoopIntervals.get(slug);
    if (existingInterval) {
      clearInterval(existingInterval);
      teamLoopIntervals.delete(slug);
    }

    let i = 0;
    const intervalHandle = setInterval(async () => {
      const currentTeamId = teamIds[i];

      const playersRes = await pool.query(
        "SELECT * FROM players WHERE team_id = $1 AND tournament_id = $2 AND (sold_status = true OR sold_status = 'TRUE')",
        [currentTeamId, tournamentId]
      );
      const empty = playersRes.rowCount === 0;

      io.emit("showTeam", {
        team_id: currentTeamId,
        empty,
        tournament_id: tournamentId,
        tournament_slug: slug,
      });

      i = (i + 1) % teamIds.length;
    }, 7000);

    teamLoopIntervals.set(slug, intervalHandle);

    res.json({ message: "✅ Team loop started" });
  } catch (error) {
    console.error("❌ Error in start-team-loop:", error);
    res.status(500).json({ error: "Internal error" });
  }
});





// Stop team loop

app.post("/api/stop-team-loop", (req, res) => {
  console.log("🛑 Stopping team loop...");
  const { slug } = req.body || {};

  const stopLoopForSlug = (key) => {
    const handle = teamLoopIntervals.get(key);
    if (handle) {
      clearInterval(handle);
      teamLoopIntervals.delete(key);
      console.log(`🛑 Cleared team loop for ${key}`);
    }
  };

  if (slug) {
    stopLoopForSlug(slug);
  } else {
    Array.from(teamLoopIntervals.keys()).forEach(stopLoopForSlug);
  }

  io.emit("customMessageUpdate", "__CLEAR_CUSTOM_VIEW__");
  res.json({ message: slug ? `✅ Team loop stopped for ${slug}` : "✅ Team loop stopped" });
});



// Store Current Team ID
//  Show team

let currentTeamId = null;

app.post("/api/show-team", (req, res) => {
  console.log("✅ /api/show-team HIT");
  const { team_id, empty = false, tournament_id, tournament_slug } = req.body || {};
  currentTeamId = team_id ?? null;

  const payload = {
    team_id: currentTeamId,
    empty: Boolean(empty),
  };

  if (tournament_id != null) payload.tournament_id = tournament_id;
  if (tournament_slug != null) payload.tournament_slug = tournament_slug;

  io.emit("showTeam", payload);
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
    const params = [tournament_id];
    let where = `tournament_id = $1`;

    if (poolParam) {
      params.push(String(poolParam).toUpperCase());
      where += ` AND UPPER(base_category) = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM players WHERE ${where} ORDER BY auction_serial NULLS LAST, id`,
      params
    );

    res.json(result.rows);   // ✅ this is the only response
  } catch (err) {
    console.error("🔥 Error fetching players:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ GET player by ID with full details (KCPL-aware via toggle)
app.get('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  const activePool = req.query.active_pool || null;

  const formatProfileImage = (filename) => {
    if (!filename) {
      return "https://ik.imagekit.io/auctionarena2/uploads/players/profiles/default.jpg";
    }
    if (filename.startsWith("http")) return filename;
    return `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${filename}?tr=w-600,fo-face,z-0.4,q-95,e-sharpen,f-webp`;
  };

  try {
    const result = await pool.query(`
      SELECT p.*, t.name AS team_name
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE p.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = result.rows[0];

    // ⭐ NEW: single source of truth for base price
    player.base_price = await getEffectiveBasePrice(player, activePool);

    // Normalize profile image
    player.profile_image = formatProfileImage(player.profile_image);

    res.json(player);
  } catch (err) {
    console.error("Error fetching player:", err);
    res.status(500).json({ error: "Internal server error" });
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
    const playerCategory = player.base_category;
    const currentSoldStatus = player.sold_status;
    const oldTeamId = player.old_team_id;

    // 🔒 Block updates if already SOLD (unless explicitly UNSOLD)
    if (["TRUE", true].includes(currentSoldStatus) && sold_status !== false && sold_status !== "FALSE") {
      return res.status(400).json({ error: "Cannot update a SOLD player. Use /reopen first." });
    }

    // 2️⃣ Determine effective category
    const effectiveCategory =
      active_pool &&
        (currentSoldStatus === null || currentSoldStatus === false || currentSoldStatus === "FALSE")
        ? active_pool
        : playerCategory;

    // 3️⃣ Base price enforcement
    let minAllowed = 0;
    if (effectiveCategory) {
      minAllowed = KCPL_RULES.pools[effectiveCategory]?.base ?? 0;
    } else {
      const tRes = await pool.query("SELECT base_price FROM tournaments WHERE id = $1", [tournamentId]);
      if (tRes.rows[0]?.base_price != null) {
        minAllowed = Number(tRes.rows[0].base_price) || 0;
      } else {
        const componentMap = { A: 1700, B: 3000, C: 5000 };
        minAllowed = componentMap[playerCategory] ?? 0;
      }
    }

    if (sold_price && sold_price < minAllowed) {
      return res.status(400).json({ error: `Sold price must be at least ₹${minAllowed}` });
    }

    // 4️⃣ KCPL slot + budget guard (only when we have a valid KCPL pool)
    if (["TRUE", true, "true"].includes(sold_status)) {
      if (!team_id) {
        return res.status(400).json({ error: "team_id required to mark SOLD" });
      }

      const hasValidPool =
        effectiveCategory &&
        KCPL_RULES.pools?.[String(effectiveCategory).toUpperCase()];

      // Only run KCPL math if a valid pool is present
      if (hasValidPool) {
        const snapshot = await getTeamPoolSnapshot(team_id, tournamentId);

        // --- SLOT GUARD ---
        const boughtTotal = Object.values(snapshot.byPool).reduce((sum, v) => sum + v.bought, 0);
        const remainingSlots = KCPL_RULES.totalSquadSize - boughtTotal;

        const futurePools = KCPL_RULES.order.slice(
          KCPL_RULES.order.indexOf(effectiveCategory) + 1
        );
        const reserveSlots = futurePools.reduce((sum, p) => {
          const min = KCPL_RULES.pools[p].minReq || 0;
          const already = snapshot.byPool[p]?.bought || 0;
          return sum + Math.max(min - already, 0);
        }, 0);

        if (remainingSlots - 1 < reserveSlots) {
          return res.status(400).json({
            error: `Buying from Pool ${effectiveCategory} would block minimum slots in later pools`,
          });
        }

        // --- MAX BID (money guard) ---
        const { maxBid } = computeMaxBidFor(effectiveCategory, snapshot, KCPL_RULES);
        if (Number(sold_price) > maxBid) {
          return res.status(400).json({
            error: `Sold price exceeds max bid ₹${maxBid}`,
          });
        }
      }
    }

    // 5️⃣ Persist the player (choose a sane sold_pool)
    const poolToSave =
      sold_pool ||
      (KCPL_RULES.pools?.[String(effectiveCategory).toUpperCase()] ? effectiveCategory : null);

    await pool.query(
      `UPDATE players
     SET sold_status = $1,
         team_id     = $2,
         sold_price  = $3,
         sold_pool   = $4,
         updated_at  = NOW()
   WHERE id = $5`,
      [sold_status, team_id, Number(sold_price) || 0, poolToSave, playerId]
    );

    // 6️⃣ Update team summary numbers (non-KCPL, safe for all)
    await updateTeamStats(team_id, tournamentId);


    io.emit("saleCommitted", {
      player_id: Number(playerId),
      team_id,
      sold_price: Number(sold_price) || 0,
      sold_pool: sold_pool || effectiveCategory || null,
      tournament_id: tournamentId,
    });
    res.json({ message: "Player updated and all relevant team stats refreshed" });
  } catch (err) {
    console.error("❌ PUT error:", err);
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

    // 🔒 Block updates if already SOLD
    if (["TRUE", true].includes(currentSoldStatus) && sold_status !== false && sold_status !== "FALSE") {
      return res.status(400).json({ error: "Cannot update a SOLD player. Use /reopen first." });
    }

    // 2️⃣ Determine effective category
    const effectiveCategory =
      active_pool &&
        (currentSoldStatus === null || currentSoldStatus === false || currentSoldStatus === "FALSE")
        ? active_pool
        : playerCategory;

    // 3️⃣ Enforce base price
    let minAllowed = 0;
    if (effectiveCategory) {
      minAllowed = KCPL_RULES.pools[effectiveCategory]?.base ?? 0;
    } else {
      const tRes = await pool.query("SELECT base_price FROM tournaments WHERE id = $1", [tournamentId]);
      if (tRes.rows[0]?.base_price != null) {
        minAllowed = Number(tRes.rows[0].base_price) || 0;
      } else {
        const componentMap = { A: 1700, B: 3000, C: 5000 };
        minAllowed = componentMap[playerCategory] ?? 0;
      }
    }

    if (sold_price && sold_price < minAllowed) {
      return res.status(400).json({ error: `Sold price must be at least ₹${minAllowed}` });
    }

    // 4️⃣ KCPL slot + budget guard
    if (["TRUE", true, "true"].includes(sold_status)) {
      if (!team_id) {
        return res.status(400).json({ error: "team_id required to mark SOLD" });
      }

      const snapshot = await getTeamPoolSnapshot(team_id, tournamentId);

      // --- SLOT GUARD ---
      const boughtTotal = Object.values(snapshot.byPool).reduce((sum, v) => sum + v.bought, 0);
      const remainingSlots = KCPL_RULES.totalSquadSize - boughtTotal;

      const futurePools = KCPL_RULES.order.slice(KCPL_RULES.order.indexOf(effectiveCategory) + 1);
      const reserveSlots = futurePools.reduce((sum, p) => {
        const min = KCPL_RULES.pools[p].minReq || 0;
        const already = snapshot.byPool[p]?.bought || 0;
        return sum + Math.max(min - already, 0);
      }, 0);

      if (remainingSlots - 1 < reserveSlots) {
        return res.status(400).json({
          error: `Cannot buy from Pool ${effectiveCategory}. Must leave ${reserveSlots} slots for later pools: ${futurePools.join(", ")}`
        });
      }

      // --- BUDGET GUARD ---
      const { maxBid, unmetPools } = computeMaxBidFor(effectiveCategory || sold_pool, snapshot, KCPL_RULES);
      if (maxBid <= 0) {
        return res.status(400).json({
          error: `Cannot buy more from Pool ${effectiveCategory} — must leave slots for: ${unmetPools.join(", ") || "later pools"}`
        });
      }
    }

    // 5️⃣ Update players
    await pool.query(
      `UPDATE players
       SET sold_status = $1,
           sold_price = $2,
           team_id = $3,
           sold_pool = $4,
           updated_at  = NOW()
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

    // 7️⃣ Update team stats
    if (team_id && tournamentId) {
      await updateTeamStats(team_id, tournamentId);
    }

    io.emit("saleCommitted", {
      player_id: Number(playerId),
      team_id,
      sold_price: Number(sold_price) || 0,
      sold_pool: sold_pool || effectiveCategory || null,
      tournament_id: tournamentId,
    });
    res.json({ message: "Player updated and team stats refreshed" });
  } catch (err) {
    console.error("❌ PATCH error:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ GET player by auction_serial (KCPL-aware via toggle)
app.get('/api/players/by-serial/:serial', async (req, res) => {
  const { serial } = req.params;
  const { slug, tournament_id } = req.query;
  const activePool = req.query.active_pool || null;

  const formatProfileImage = (filename) => {
    if (!filename) {
      return "https://ik.imagekit.io/auctionarena2/uploads/players/profiles/default.jpg";
    }
    if (filename.startsWith("http")) return filename;
    return `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${filename}?tr=w-600,fo-face,z-0.4,q-95,e-sharpen,f-webp`;
  };

  try {
    let result;
    if (slug) {
      result = await pool.query(`
        SELECT p.*, t.name AS team_name
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE p.auction_serial = $1
          AND p.tournament_id = (SELECT id FROM tournaments WHERE slug = $2)
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

    // ⭐ NEW: single source of truth for base price
    player.base_price = await getEffectiveBasePrice(player, activePool);

    // Normalize profile image
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

// ✅ GET current player — always return a NON-ZERO base_price (KCPL-aware helper)
// ✅ GET current player — never return base_price = 0 (KCPL-off context here)
app.get('/api/current-player', async (req, res) => {
  try {
    const { tournament_id, slug } = req.query || {};
    let cpResult;
    if (slug) {
      const t = await pool.query(`SELECT id FROM tournaments WHERE slug = $1`, [slug]);
      if (t.rowCount === 0) return res.status(200).json(null);
      const tid = t.rows[0].id;
      cpResult = await pool.query(`SELECT * FROM current_player WHERE tournament_id = $1 ORDER BY updated_at DESC LIMIT 1`, [tid]);
    } else if (tournament_id) {
      cpResult = await pool.query(`SELECT * FROM current_player WHERE tournament_id = $1 ORDER BY updated_at DESC LIMIT 1`, [tournament_id]);
    } else {
      cpResult = await pool.query(`SELECT * FROM current_player LIMIT 1`);
    }
    if (cpResult.rowCount === 0) {
      return res.status(200).json(null);
    }

    const currentPlayer = cpResult.rows[0];

    // Parse id defensively
    const rawId = currentPlayer.id;
    const playerId = typeof rawId === "string" ? parseInt(rawId, 10) : rawId;
    if (!playerId || Number.isNaN(playerId)) {
      console.warn("⚠️ Invalid current player ID:", rawId);
      return res.status(200).json(null);
    }

    // ⬇️ Only pull fields that actually exist
    const pResult = await pool.query(
      `SELECT tournament_id, base_category, auction_serial
       FROM players
       WHERE id = $1`,
      [playerId]
    );
    const row = pResult.rows[0] || {};

    // ⭐ Compute effective base without using 'component'
    //    Prefer your existing helper if you have it wired to category/tournament.
    let effectiveBase = 0;
    if (typeof getEffectiveBasePrice === "function") {
      effectiveBase = await getEffectiveBasePrice(
        {
          tournament_id: row.tournament_id,
          base_category: row.base_category
        },
        null // no active pool context for this route
      );
    }

    // Final fallback by CATEGORY (A/B/C) if helper yields 0/undefined
    if (!effectiveBase || Number(effectiveBase) <= 0) {
      const catMap = { A: 1700, B: 3000, C: 5000 };
      const cat = String(row.base_category || "").toUpperCase();
      effectiveBase = catMap[cat] ?? 0;
    }

    return res.status(200).json({
      ...currentPlayer,
      auction_serial: row.auction_serial || null,
      base_price: Number(effectiveBase) || 0
    });
  } catch (err) {
    console.error("🔥 Error fetching current player:", err);
    return res.status(500).json({ error: "Server error" });
  }
});





// ✅ SET current player
app.put('/api/current-player', async (req, res) => {
  const { id, name, role, base_price, profile_image, sold_status, team_id, sold_price, tournament_id } = req.body;

  if (!id || !name || !role) {
    console.error("❌ Missing required player fields:", req.body);
    return res.status(400).json({ error: "Missing required player fields" });
  }

  try {
    if (tournament_id) {
      await pool.query(
        `INSERT INTO current_player (tournament_id, id, name, role, base_price, profile_image, sold_status, team_id, sold_price, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
         ON CONFLICT (tournament_id) DO UPDATE SET
           id = EXCLUDED.id,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           base_price = EXCLUDED.base_price,
           profile_image = EXCLUDED.profile_image,
           sold_status = EXCLUDED.sold_status,
           team_id = EXCLUDED.team_id,
           sold_price = EXCLUDED.sold_price,
           updated_at = NOW()`,
        [tournament_id, id, name, role, base_price, profile_image, sold_status, team_id, sold_price]
      );
    } else {
      await pool.query('DELETE FROM current_player');
      await pool.query(
        `INSERT INTO current_player (id, name, role, base_price, profile_image, sold_status, team_id, sold_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, name, role, base_price, profile_image, sold_status, team_id, sold_price]
      );
    }
    res.json({ message: 'Current player updated' });
  } catch (err) {
    console.error("❌ DB Insert failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ✅ GET current bid
app.get('/api/current-bid', async (req, res) => {
  try {
    const { tournament_id } = req.query;
    let result;
    if (tournament_id) {
      result = await pool.query('SELECT * FROM current_bid WHERE tournament_id = $1 ORDER BY updated_at DESC LIMIT 1', [tournament_id]);
    } else {
      result = await pool.query('SELECT * FROM current_bid LIMIT 1');
    }
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ SET current bid
app.put('/api/current-bid', async (req, res) => {
  const { bid_amount, team_name, tournament_id } = req.body;
  try {
    if (tournament_id) {
      await pool.query(
        `INSERT INTO current_bid (tournament_id, bid_amount, team_name, updated_at)
         VALUES ($1,$2,$3, NOW())
         ON CONFLICT (tournament_id) DO UPDATE SET
           bid_amount = EXCLUDED.bid_amount,
           team_name = EXCLUDED.team_name,
           updated_at = NOW()`,
        [tournament_id, bid_amount, team_name]
      );
    } else {
      await pool.query('DELETE FROM current_bid');
      await pool.query(
        `INSERT INTO current_bid (bid_amount, team_name) VALUES ($1, $2)`,
        [bid_amount, team_name]
      );
    }
    res.json({ message: 'Current bid updated' });
  } catch (err) {
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

// Current player/bid reset (optionally per-tournament)
app.post("/api/current-player/reset", async (req, res) => {
  try {
    const { tournament_id } = req.body || {};
    if (tournament_id) {
      await pool.query("DELETE FROM current_player WHERE tournament_id = $1", [tournament_id]);
      await pool.query("DELETE FROM current_bid WHERE tournament_id = $1", [tournament_id]);
    } else {
      await pool.query("DELETE FROM current_player");
      await pool.query("DELETE FROM current_bid");
    }
    res.json({ message: "Current player and bid reset" });
  } catch (err) {
    console.error("Error resetting current player/bid:", err);
    res.status(500).json({ error: "Server error" });
  }
});

let customMessage = null;

// Get custom message
// Tournament-scoped custom messages (in-memory map)
const customMessagesByTournament = new Map();
app.get('/api/custom-message', async (req, res) => {
  try {
    const { tournament_id, slug } = req.query || {};
    let tid = tournament_id ? Number(tournament_id) : null;
    if (!tid && slug) {
      const t = await pool.query('SELECT id FROM tournaments WHERE slug = $1', [slug]);
      tid = t?.rows?.[0]?.id ?? null;
    }
    if (!tid) return res.json({ message: null });
    return res.json({ message: customMessagesByTournament.get(Number(tid)) ?? null });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch custom message' });
  }
});

// Set custom message
app.post('/api/custom-message', async (req, res) => {
  try {
    let { message, tournament_id, slug } = req.body || {};
    let tid = tournament_id ? Number(tournament_id) : null;
    if (!tid && slug) {
      const t = await pool.query('SELECT id FROM tournaments WHERE slug = $1', [slug]);
      tid = t?.rows?.[0]?.id ?? null;
    }
    if (!tid) return res.status(400).json({ error: 'tournament_id or slug required' });
    customMessagesByTournament.set(Number(tid), message || null);
    io.emit('customMessageUpdate', { message: message || null, tournament_id: Number(tid) });
    res.json({ message: 'Custom message updated' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update custom message' });
  }
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

// Reset only unsold players for a tournament (bulk)
app.post("/api/reset-unsold", async (req, res) => {
  try {
    let { tournament_id, slug } = req.body || {};
    let tournamentId = Number(tournament_id) || null;

    // Allow lookup by slug if ID is not provided
    if (!tournamentId && slug) {
      const tRes = await pool.query("SELECT id FROM tournaments WHERE slug = $1", [slug]);
      if (tRes.rowCount === 0) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      tournamentId = tRes.rows[0].id;
    }

    if (!tournamentId) {
      return res.status(400).json({ error: "tournament_id or slug is required." });
    }

    const resetRes = await pool.query(
      `
      UPDATE players
         SET sold_status = NULL,
             team_id = NULL,
             sold_price = NULL,
             sold_pool = NULL
       WHERE tournament_id = $1
         AND (sold_status = FALSE OR sold_status = 'FALSE')
         AND deleted_at IS NULL
      RETURNING id
      `,
      [tournamentId]
    );

    res.json({
      message: "Unsold players have been reset.",
      resetCount: resetRes.rowCount,
    });
  } catch (err) {
    console.error("Error resetting unsold players:", err);
    res.status(500).json({ error: "Reset unsold failed." });
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
      }
    });

    const $ = cheerio.load(html);

    const getStatValue = (label) => {
      const el = $("span")
        .filter((i, e) => $(e).text().trim().toUpperCase() === label.toUpperCase())
        .first();

      if (!el.length) return 0;

      const val = el.closest("li").find(".stat").text().trim();
      return val && !isNaN(val) ? parseInt(val) : 0;
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
