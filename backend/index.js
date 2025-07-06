console.log("🟢 index.js is running");

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import http from 'http';
import { Server } from 'socket.io';
import CONFIG from './config.js';

dotenv.config();

const TOURNAMENT_ID = CONFIG.TOURNAMENT_ID;



const app = express();
const port = CONFIG.PORT;

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

// Log connections
io.on("connection", (socket) => {
  console.log("✅ Spectator connected via Socket.IO");

  socket.on("bidUpdated", (data) => {
    console.log("📢 Broadcasting bidUpdated:", data);
    io.emit("bidUpdated", data); // <--- THIS is what was missing
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

// Get bid increment for a tournament

app.get('/api/bid-increments/:tournament_id', async (req, res) => {
  const { tournament_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM bid_increments WHERE tournament_id = $1 ORDER BY min_value ASC`,
      [tournament_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch bid increments:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
      `SELECT min_base_price, players_per_team FROM tournaments WHERE id = $1`,
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
    const minBasePrice = tournament.min_base_price || 100;

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


// Start team loop

let teamLoopInterval = null;
let loopTeamIndex = 0;

app.post("/api/start-team-loop", async (req, res) => {
  try {
    const tournamentId = Number(process.env.TOURNAMENT_ID);
    const teamsRes = await pool.query(
      "SELECT id FROM teams WHERE tournament_id = $1 ORDER BY id ASC",
      [tournamentId]
    );
    const teamIds = teamsRes.rows.map(row => row.id);

    if (teamIds.length === 0) {
      return res.status(404).json({ error: "No teams found." });
    }

    console.log("🔁 Starting loop for team IDs:", teamIds);
    let i = 0;

    teamLoopInterval = setInterval(async () => {
      const currentTeamId = teamIds[i];
      const playersRes = await pool.query(
        "SELECT * FROM players WHERE team_id = $1 AND tournament_id = $2 AND (sold_status = true OR sold_status = 'TRUE')",
        [currentTeamId, tournamentId]
      );
      const players = playersRes.rows;

      const empty = players.length === 0;

      io.emit("showTeam", {
        team_id: currentTeamId,
        empty
      });

      i = (i + 1) % teamIds.length;
    }, 7000);

    res.json({ message: "Team loop started" });
  } catch (error) {
    console.error("Error starting team loop:", error);
    res.status(500).json({ error: "Failed to start team loop" });
  }
});




// Stop team loop

app.post("/api/stop-team-loop", (req, res) => {
  console.log("🔴 /api/stop-team-loop HIT");

  if (teamLoopInterval) {
    clearInterval(teamLoopInterval);
    teamLoopInterval = null;
    io.emit("showTeam", { team_id: null }); // Properly reset team view
    res.json({ message: "Team loop stopped" });
  } else {
    res.status(400).json({ message: "Loop was not running" });
  }
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
  const { tournament_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM players WHERE tournament_id = $1 ORDER BY id',
      [tournament_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("🔥 Error fetching current player:", err);
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
    const result = await pool.query(`SELECT cp.*, p.auction_serial
      FROM current_player cp
      JOIN players p ON cp.id = p.id
      LIMIT 1`);
    res.json(result.rows[0]);
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

// ✅ PATCH player sold info
app.patch('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price } = req.body;

  try {
    // Update the player
    await pool.query(
      `UPDATE players SET sold_status = $1, team_id = $2, sold_price = $3 WHERE id = $4`,
      [sold_status, team_id, sold_price, playerId]
    );

    // Fetch tournament_id from player
    const result = await pool.query(
      `SELECT tournament_id FROM players WHERE id = $1`,
      [playerId]
    );
    const tournamentId = result.rows[0]?.tournament_id;

    if (team_id && tournamentId) {
      await updateTeamStats(team_id, tournamentId);
    }

    res.json({ message: 'Player updated and team stats refreshed' });
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


// ✅ PUT player sold info
app.put('/api/players/:id', async (req, res) => {
  const playerId = req.params.id;
  const { sold_status, team_id, sold_price } = req.body;

  try {
    // Step 1: Get existing player info
    const oldPlayerRes = await pool.query(
      `SELECT team_id, tournament_id FROM players WHERE id = $1`,
      [playerId]
    );
    const oldPlayer = oldPlayerRes.rows[0];
    if (!oldPlayer) return res.status(404).json({ error: 'Player not found' });

    const oldTeamId = oldPlayer.team_id;
    const tournamentId = oldPlayer.tournament_id;

    // Step 2: Update the player
    await pool.query(
      `UPDATE players SET sold_status = $1, team_id = $2, sold_price = $3 WHERE id = $4`,
      [sold_status, team_id, sold_price, playerId]
    );

    // Step 3: Update both old and new teams (if changed)
    if (tournamentId) {
      if (oldTeamId && oldTeamId !== team_id) {
        await updateTeamStats(oldTeamId, tournamentId); // reset old team
      }
      if (team_id) {
        await updateTeamStats(team_id, tournamentId); // update new team
      }
    }

    res.json({ message: 'Player updated and all relevant team stats refreshed' });
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
    const tournamentId = TOURNAMENT_ID;

    // 1. Reset all players
    const resetPlayersRes = await pool.query(`
      UPDATE players
      SET sold_status = NULL, team_id = NULL, sold_price = NULL
      WHERE tournament_id = $1
      RETURNING id
    `, [tournamentId]);

    console.log(`🎯 Players reset: ${resetPlayersRes.rowCount}`);

    // 2. Reset team budgets (optional: reset to initial value)
    const tournamentRes = await pool.query(
      `SELECT auction_money FROM tournaments WHERE id = $1`,
      [tournamentId]
    );

    const budget = tournamentRes.rows[0]?.auction_money || 0;

    await pool.query(
      `UPDATE teams SET budget = $1 WHERE tournament_id = $2`,
      [budget, tournamentId]
    );


    // 3. Recalculate team stats for each team
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
    await pool.query("INSERT INTO current_bid (bid_amount, team_name) VALUES (0, '')");


    res.json({ message: "✅ Auction has been reset and team stats updated." });
  } catch (err) {
    console.error("❌ Error resetting auction:", err);
    res.status(500).json({ error: "Reset failed" });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// ✅ Start server
server.listen(port, () => {
  console.log(`✅ Server & Socket.IO running on http://localhost:${port}`);
});
