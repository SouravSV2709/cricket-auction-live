import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import http from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Middleware
app.use(cors());
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

// Log connections
io.on("connection", (socket) => {
  console.log("✅ Spectator connected via Socket.IO");
});

// 🔔 Notify spectators when a player is sold
app.post("/api/notify-sold", (req, res) => {
  io.emit("playerSold", req.body);
  res.json({ message: "Spectators notified" });
});

// ✅ GET all players for a tournament
app.get('/api/players', async (req, res) => {
  const { tournament_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM players WHERE tournament_id = $1 ORDER BY id',
      [tournament_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET player by ID with base price logic
app.get('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Player not found" });
    }

    const player = result.rows[0];
    player.sold_status =
      player.sold_status === true || player.sold_status === 'TRUE' ? true
      : player.sold_status === false || player.sold_status === 'FALSE' ? false
      : null;

    const tournamentRes = await pool.query(
      'SELECT base_price FROM tournaments WHERE id = $1',
      [player.tournament_id]
    );
    const tournamentBase = tournamentRes.rows[0]?.base_price;

    const componentMap = { A: 1700, B: 3000, C: 5000 };
    player.base_price = tournamentBase ?? componentMap[player.component] ?? 0;

    player.profile_image = `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=h-300,w-300,fo-face,z-0.4`;

    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const { tournament_id, slug } = req.query;
    let result;
    if (slug) {
      const t = await pool.query('SELECT id FROM tournaments WHERE slug = $1', [slug]);
      if (t.rowCount === 0) return res.json(null);
      const tid = t.rows[0].id;
      result = await pool.query('SELECT * FROM current_player WHERE tournament_id = $1 ORDER BY updated_at DESC LIMIT 1', [tid]);
    } else if (tournament_id) {
      result = await pool.query('SELECT * FROM current_player WHERE tournament_id = $1 ORDER BY updated_at DESC LIMIT 1', [tournament_id]);
    } else {
      result = await pool.query('SELECT * FROM current_player LIMIT 1');
    }
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ✅ PATCH player sold info
app.patch('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price } = req.body;
  try {
    await pool.query(
      `UPDATE players SET sold_status = $1, team_id = $2, sold_price = $3 WHERE id = $4`,
      [sold_status, team_id, sold_price, playerId]
    );
    res.json({ message: 'Player updated' });
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


// ✅ PUT player sold info
app.put('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price } = req.body;
  try {
    await pool.query(
      `UPDATE players SET sold_status = $1, team_id = $2, sold_price = $3 WHERE id = $4`,
      [sold_status, team_id, sold_price, playerId]
    );
    res.json({ message: 'Player updated via PUT' });
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
      `UPDATE teams SET budget = $1, players = $2 WHERE id = $3`,
      [budget, players, teamId]
    );
    res.json({ message: 'Team updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notify-player-change", (req, res) => {
  io.emit("playerChanged", req.body); // optional: send updated player
  res.json({ message: "Spectators notified of player change" });
});

// Update teams
app.put('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  const { name, logo, tournament_id, budget } = req.body;

  try {
    await pool.query(
      'UPDATE teams SET name=$1, logo=$2, tournament_id=$3, budget=$4, updated_at=NOW() WHERE id=$5',
      [name, logo, tournament_id, budget, id]
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

// Tournament-scoped custom message store
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





// ✅ Start server
server.listen(port, () => {
  console.log(`✅ Server & Socket.IO running on http://localhost:${port}`);
});
