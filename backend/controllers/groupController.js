import { seedFromString, shuffleDeterministic } from "../utils/groupUtils.js";

export const makeGroupController = ({ pool, io }) => {
  const getGroups = async (req, res) => {
    try {
      const { slug } = req.params;
      const t = await pool.query(
        `SELECT id FROM tournaments WHERE slug=$1 LIMIT 1`,
        [slug]
      );
      if (t.rowCount === 0)
        return res.status(404).json({ error: "Tournament not found" });
      const tid = t.rows[0].id;

      const q = await pool.query(
        `SELECT id, name, logo, group_letter
         FROM teams WHERE tournament_id=$1 ORDER BY id`,
        [tid]
      );
      const groups = {};
      for (const row of q.rows) {
        if (!row.group_letter) continue;
        (groups[row.group_letter] ??= []).push(row);
      }
      res.json({ groups, totalTeams: q.rowCount });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  const drawGroups = async (req, res) => {
    const client = await pool.connect();
    try {
      const { slug } = req.params;
      let { groupsCount, method = "roundRobin" } = req.body || {};
      groupsCount = Number(groupsCount);
      if (
        !Number.isInteger(groupsCount) ||
        groupsCount < 2 ||
        groupsCount > 26
      ) {
        return res.status(400).json({ error: "groupsCount must be 2–26" });
      }

      const t = await client.query(
        `SELECT id FROM tournaments WHERE slug=$1 LIMIT 1`,
        [slug]
      );
      if (t.rowCount === 0)
        return res.status(404).json({ error: "Tournament not found" });
      const tid = t.rows[0].id;

      const allTeams = await client.query(
        `SELECT id FROM teams WHERE tournament_id=$1 ORDER BY id`,
        [tid]
      );
      const allIds = allTeams.rows.map((r) => r.id);
      if (allIds.length === 0)
        return res.status(400).json({ error: "No teams in this tournament" });

      const letters = Array.from({ length: groupsCount }, (_, i) =>
        String.fromCharCode(65 + i)
      );
      const manual = MANUAL_GROUP_PLAN_IDS?.[slug];

      await client.query("BEGIN");
      // clear previous
      await client.query(
        `UPDATE teams SET group_letter=NULL WHERE tournament_id=$1`,
        [tid]
      );

      if (manual) {
        // 1) Apply fixed assignments from the manual plan (teamId -> letter)
        const used = new Set();
        for (const [idStr, letter] of Object.entries(manual.groups || {})) {
          const id = Number(idStr);
          if (allIds.includes(id) && letters.includes(letter)) {
            await client.query(
              `UPDATE teams SET group_letter=$1 WHERE id=$2 AND tournament_id=$3`,
              [letter, id, tid]
            );
            used.add(id);
          }
        }

        // 2) Distribute remaining teams round-robin (keeps the UI looking “random”)
        const remain = allIds.filter((id) => !used.has(id));
        // Optional: shuffle remaining deterministically by slug to add visual randomness
        const remainShuffled = shuffleDeterministic(
          remain,
          seedFromString(slug)
        );
        for (let i = 0; i < remainShuffled.length; i++) {
          const letter = letters[i % groupsCount];
          await client.query(
            `UPDATE teams SET group_letter=$1 WHERE id=$2 AND tournament_id=$3`,
            [letter, remainShuffled[i], tid]
          );
        }
      } else {
        // default: seeded shuffle + round-robin
        const seed = seedFromString(slug);
        const ordered =
          method === "roundRobin" || method === "random"
            ? shuffleDeterministic(allIds, seed)
            : allIds;
        for (let i = 0; i < ordered.length; i++) {
          const letter = letters[i % groupsCount];
          await client.query(
            `UPDATE teams SET group_letter=$1 WHERE id=$2 AND tournament_id=$3`,
            [letter, ordered[i], tid]
          );
        }
      }

      await client.query("COMMIT");
      io?.emit?.("groupsUpdated", { slug, groupsCount });
      res.json({ ok: true, groupsCount });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  };

  const resetGroups = async (req, res) => {
    try {
      const { slug } = req.params;
      const t = await pool.query(
        `SELECT id FROM tournaments WHERE slug=$1 LIMIT 1`,
        [slug]
      );
      if (t.rowCount === 0)
        return res.status(404).json({ error: "Tournament not found" });
      const tid = t.rows[0].id;

      await pool.query(
        `UPDATE teams SET group_letter=NULL WHERE tournament_id=$1`,
        [tid]
      );
      io?.emit?.("groupsUpdated", { slug, reset: true });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  const assignOne = async (req, res) => {
    const client = await pool.connect();
    try {
      const { slug } = req.params;
      let { groupsCount } = req.body || {};
      groupsCount = Number(groupsCount);
      if (
        !Number.isInteger(groupsCount) ||
        groupsCount < 2 ||
        groupsCount > 26
      ) {
        return res.status(400).json({ error: "groupsCount must be 2–26" });
      }

      // tournament
      const t = await client.query(
        `SELECT id FROM tournaments WHERE slug=$1 LIMIT 1`,
        [slug]
      );
      if (t.rowCount === 0)
        return res.status(404).json({ error: "Tournament not found" });
      const tid = t.rows[0].id;

      // all + unassigned
      const all = await client.query(
        `SELECT id,name,logo FROM teams WHERE tournament_id=$1 ORDER BY id`,
        [tid]
      );
      const unassigned = await client.query(
        `SELECT id FROM teams WHERE tournament_id=$1 AND group_letter IS NULL ORDER BY id`,
        [tid]
      );
      if (unassigned.rowCount === 0) return res.json({ done: true });

      const letters = Array.from({ length: groupsCount }, (_, i) =>
        String.fromCharCode(65 + i)
      );
      const manual = MANUAL_GROUP_PLAN_IDS?.[slug];

      // —— Manual plan path (by IDs) ————————————————————————————————
      if (manual) {
        // find next id from planOrder that is still unassigned
        const assignedIds = new Set(
          (
            await client.query(
              `SELECT id FROM teams WHERE tournament_id=$1 AND group_letter IS NOT NULL`,
              [tid]
            )
          ).rows.map((r) => r.id)
        );
        let chosenId = null;
        for (const id of manual.planOrder || []) {
          const nId = Number(id);
          if (!assignedIds.has(nId)) {
            chosenId = nId;
            break;
          }
        }

        if (chosenId != null) {
          // Verify belongs to this tournament and still unassigned
          const chk = await client.query(
            `SELECT id,name,logo FROM teams WHERE id=$1 AND tournament_id=$2 AND group_letter IS NULL`,
            [chosenId, tid]
          );
          if (chk.rowCount) {
            const letter =
              (manual.groups && manual.groups[chosenId]) || letters[0];
            await client.query("BEGIN");
            await client.query(
              `UPDATE teams SET group_letter=$1 WHERE id=$2 AND tournament_id=$3`,
              [letter, chosenId, tid]
            );
            await client.query("COMMIT");
            const team = chk.rows[0];
            io?.emit?.("groupsUpdated", {
              slug,
              incremental: true,
              lastAssigned: { teamId: chosenId, letter },
            });
            return res.json({ ok: true, team, letter });
          }
          // If planned team is already assigned (or missing), fall through to default
        }
        // If plan exhausted, fall through to default path
      }

      // —— Default path (least-filled group + seeded order) ————————————
      // current counts per letter
      const countsRes = await client.query(
        `SELECT group_letter, COUNT(*)::int AS c
       FROM teams WHERE tournament_id=$1 AND group_letter IS NOT NULL
       GROUP BY group_letter`,
        [tid]
      );
      const counts = Object.fromEntries(letters.map((L) => [L, 0]));
      for (const r of countsRes.rows) {
        if (counts[r.group_letter] != null) counts[r.group_letter] = r.c;
      }

      // next letter = smallest count (tie -> alphabetical)
      let nextLetter = letters[0];
      let best = counts[nextLetter];
      for (const L of letters) {
        if (counts[L] < best) {
          best = counts[L];
          nextLetter = L;
        }
      }

      // choose next team deterministically: shuffle all by slug, pick first unassigned
      const seed = seedFromString(slug);
      const ordered = shuffleDeterministic(
        all.rows.map((r) => r.id),
        seed
      );
      const unassignedSet = new Set(unassigned.rows.map((r) => r.id));
      const nextTeamId = ordered.find((id) => unassignedSet.has(id));

      await client.query("BEGIN");
      await client.query(
        `UPDATE teams SET group_letter=$1 WHERE id=$2 AND tournament_id=$3`,
        [nextLetter, nextTeamId, tid]
      );
      await client.query("COMMIT");

      const team = all.rows.find((r) => r.id === nextTeamId);
      io?.emit?.("groupsUpdated", {
        slug,
        incremental: true,
        lastAssigned: { teamId: nextTeamId, letter: nextLetter },
      });

      res.json({ ok: true, team, letter: nextLetter });
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("❌ assignOne error:", e);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  };

  // ---- ONE-TIME MANUAL GROUP PLAN (ID-based) -------------------------------
  const MANUAL_GROUP_PLAN_IDS = {
    "bcup-s1": {
      // Reveal order for "Spin & Assign Next"
      planOrder: [
        78, 82, 86, 90, 79, 83, 87, 91, 80, 84, 88, 92, 81, 85, 89, 93
      ],
      // Fixed assignment: teamId -> group letter (balanced A-D)
      groups: {
        78: "A", // Paschim Bardhaman3
        79: "A", // Bankura
        80: "A", // Purulia 1
        81: "A", // Purba Midnapore
        82: "B", // Kolkata
        83: "B", // Howrah
        84: "B", // Nadia
        85: "B", // Purulia 2
        86: "C", // Paschim Bardhaman 2
        87: "C", // Hooghly
        88: "C", // Murshidabad
        89: "C", // North 24 Paranagans
        90: "D", // Paschim Midnapore
        91: "D", // Siliguri
        92: "D", // Birbhum
        93: "D", // Paschim Bardhaman 1
      },
    },
  };

  return { getGroups, drawGroups, resetGroups, assignOne };
};
