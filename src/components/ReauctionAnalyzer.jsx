import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "./config";

const API = CONFIG.API_BASE_URL;

const ReauctionAnalyzer = () => {
  const { tournamentSlug } = useParams();
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamSelections, setTeamSelections] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState("");
  const [evaluation, setEvaluation] = useState(null);

  const tournamentId = tournament?.id;
  const computeSlots = (team) => {
    if (!team) return 0;
    const squadSize =
      Number(team?.team_squad) ||
      Number(tournament?.players_per_team) ||
      0;
    const bought = Number(team?.bought_count) || 0;
    return Math.max(squadSize - bought, 0);
  };

  useEffect(() => {
    document.title = "Re-auction Analyzer | Auction Arena";
  }, []);

  // Fetch tournament details
  useEffect(() => {
    const fetchTournament = async () => {
      if (!tournamentSlug) return;
      try {
        const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
        const data = await res.json();
        if (res.ok && data?.id) {
          setTournament(data);
        } else {
          setStatus("Tournament not found");
        }
      } catch {
        setStatus("Failed to load tournament");
      }
    };
    fetchTournament();
  }, [tournamentSlug]);

  // Fetch teams, players and existing picks
  useEffect(() => {
    if (!tournamentId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [teamRes, playerRes, picksRes] = await Promise.all([
          fetch(`${API}/api/teams?tournament_id=${tournamentId}`),
          fetch(`${API}/api/players?tournament_id=${tournamentId}`),
          fetch(`${API}/api/reauction/picks?slug=${tournamentSlug}`),
        ]);

        const teamData = await teamRes.json();
        const playerData = await playerRes.json();
        const picksData = await picksRes.json();

        const normalizedTeams = Array.isArray(teamData) ? teamData : [];
        setTeams(normalizedTeams);
        setPlayers(Array.isArray(playerData) ? playerData : []);

        const mapped = {};
        if (Array.isArray(picksData?.picks)) {
          for (const p of picksData.picks) {
            const key = String(p.team_id);
            if (!mapped[key]) mapped[key] = [];
            if (p.player_id != null) mapped[key].push(Number(p.player_id));
          }
        }
        setTeamSelections(mapped);

        const firstWithSlot = normalizedTeams.find((t) => computeSlots(t) > 0);
        const hasSelectionWithSlots = normalizedTeams.some(
          (t) =>
            Number(t.id) === Number(selectedTeamId) &&
            computeSlots(t) > 0
        );

        if (!hasSelectionWithSlots && firstWithSlot) {
          setSelectedTeamId(firstWithSlot.id);
        }
      } catch {
        setStatus("Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tournamentId, tournamentSlug, selectedTeamId]);

  const selectedTeam = useMemo(
    () => teams.find((t) => Number(t.id) === Number(selectedTeamId)),
    [teams, selectedTeamId]
  );

  const availableSlots = useMemo(
    () => computeSlots(selectedTeam),
    [selectedTeam]
  );

  const teamsWithSlots = useMemo(
    () => teams.filter((t) => computeSlots(t) > 0),
    [teams]
  );

  const unsoldOrUnauctioned = useMemo(() => {
    return (players || [])
      .filter(
        (p) =>
          p?.deleted_at == null &&
          (p?.sold_status === false ||
            String(p?.sold_status).toUpperCase() === "FALSE" ||
            p?.sold_status == null)
      )
      .sort((a, b) => (a.auction_serial || 0) - (b.auction_serial || 0));
  }, [players]);

  const currentSelection = useMemo(() => {
    const arr = teamSelections[String(selectedTeamId)] || [];
    return Array.isArray(arr) ? arr : [];
  }, [teamSelections, selectedTeamId]);

  const togglePlayer = (playerId) => {
    if (!availableSlots) return;
    const pid = Number(playerId);
    if (!Number.isFinite(pid)) return;
    if (!selectedTeamId) return;
    const key = String(selectedTeamId);
    const existing = teamSelections[key] || [];
    const isSelected = existing.includes(pid);

    if (isSelected) {
      const next = existing.filter((id) => id !== pid);
      setTeamSelections({ ...teamSelections, [key]: next });
    } else {
      if (availableSlots && existing.length >= availableSlots) {
        setStatus(
          `Cannot select more than ${availableSlots} players for this team`
        );
        return;
      }
      const next = [...existing, pid];
      setTeamSelections({ ...teamSelections, [key]: next });
    }
  };

  const savePicks = async (advance = false) => {
    if (!selectedTeamId || !tournamentId) return;
    setSaving(true);
    setStatus("");
    try {
      const body = {
        tournament_id: tournamentId,
        team_id: selectedTeamId,
        player_ids: currentSelection,
      };
      const res = await fetch(`${API}/api/reauction/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save picks");
      }
      setStatus("Saved re-auction picks");
      if (advance) {
        const idx = teams.findIndex(
          (t) => Number(t.id) === Number(selectedTeamId)
        );
        const next = teams[(idx + 1) % teams.length];
        if (next) setSelectedTeamId(next.id);
      }
    } catch (err) {
      setStatus(err.message || "Failed to save picks");
    } finally {
      setSaving(false);
    }
  };

  const evaluate = async () => {
    if (!tournamentId) return;
    setEvaluating(true);
    setStatus("");
    try {
      const res = await fetch(`${API}/api/reauction/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to evaluate");
      }
      setEvaluation(data);
      setStatus("Evaluation refreshed");
    } catch (err) {
      setStatus(err.message || "Failed to evaluate");
    } finally {
      setEvaluating(false);
    }
  };

  const resetAll = async () => {
    if (!tournamentId) return;
    if (!window.confirm("Reset all re-auction selections for this tournament?"))
      return;
    setResetting(true);
    setStatus("");
    try {
      const res = await fetch(`${API}/api/reauction/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to reset");
      }
      setTeamSelections({});
      setEvaluation(null);
      setStatus("Re-auction list reset");
    } catch (err) {
      setStatus(err.message || "Failed to reset");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300 uppercase tracking-[0.2em]">
            Re-auction Analyzer
          </p>
          <h1 className="text-2xl md:text-3xl font-black">
            {tournament?.title || "Loading tournament..."}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={evaluate}
            disabled={evaluating}
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-4 py-2 rounded disabled:opacity-60"
          >
            {evaluating ? "Evaluating..." : "Evaluate"}
          </button>
          <button
            onClick={resetAll}
            disabled={resetting}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded disabled:opacity-60"
          >
            {resetting ? "Resetting..." : "Reset List"}
          </button>
        </div>
      </header>

      {status && (
        <div className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
          {status}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-800 rounded-xl bg-slate-900/70 p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <label className="text-slate-200 font-semibold">Select Team</label>
            <select
              className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
              value={selectedTeamId || ""}
              onChange={(e) => setSelectedTeamId(Number(e.target.value))}
              disabled={loading || teamsWithSlots.length === 0}
            >
              {teamsWithSlots.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="text-sm text-slate-300">
              Slots available:{" "}
              <span className="inline-block px-2 py-1 rounded bg-amber-300 text-black font-bold">
                {availableSlots}
              </span>
              <span className="ml-3 text-slate-400">
                Selected:{" "}
                <span className="inline-block px-2 py-1 rounded bg-emerald-300 text-black font-bold">
                  {currentSelection.length}
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => savePicks(false)}
              disabled={saving || (availableSlots > 0 && currentSelection.length < availableSlots)}
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-4 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Selection"}
            </button>
            <button
              onClick={() => savePicks(true)}
              disabled={saving || (availableSlots > 0 && currentSelection.length < availableSlots)}
              className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-4 py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save & Next Team"}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 inline-block w-full">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 p-3">
              {unsoldOrUnauctioned.map((p) => {
                const pid = Number(p.id);
                const checked = currentSelection.some(
                  (id) => Number(id) === pid
                );
                const disablePick =
                  !availableSlots ||
                  (!checked && currentSelection.length >= availableSlots);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer ${
                      checked
                        ? "bg-emerald-900/40 border-emerald-500 text-emerald-100"
                        : "bg-slate-900/60 border-slate-800 text-slate-200"
                    } ${disablePick && !checked ? "opacity-50 cursor-not-allowed" : "hover:border-emerald-500/60"}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={checked}
                      disabled={disablePick}
                      onChange={() => togglePlayer(pid)}
                    />
                    <span className="font-bold">#{p.auction_serial ?? "-"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl bg-slate-900/70 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Evaluation</h2>
            <div className="text-sm text-slate-300">
              Total picks: {evaluation?.totalPicks ?? 0} | Players involved:{" "}
              {evaluation?.totalPlayers ?? 0}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-emerald-300">
                Non-conflicting (selected by a single team)
              </h3>
              <div className="mt-2 space-y-2">
                {(evaluation?.nonConflicting || []).map((item) => (
                  <div
                    key={item.player_id}
                    className="flex items-center justify-between rounded border border-emerald-700/50 bg-emerald-900/20 px-3 py-2"
                  >
                    <div>
                      <span className="font-bold">{item.player_name}</span>{" "}
                      <span className="text-slate-300">
                        (Serial {item.auction_serial ?? "-"})
                      </span>
                    </div>
                    <span className="text-sm text-emerald-200">
                      {item.team_name}
                    </span>
                  </div>
                ))}
                {evaluation?.nonConflicting?.length === 0 && (
                  <p className="text-sm text-slate-400">None yet.</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-amber-300">
                Conflicting (selected by multiple teams)
              </h3>
              <div className="mt-2 space-y-2">
                {(evaluation?.conflicts || []).map((item) => (
                  <div
                    key={item.player_id}
                    className="rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold">{item.player_name}</span>{" "}
                        <span className="text-slate-300">
                          (Serial {item.auction_serial ?? "-"})
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.teams.map((t) => (
                        <span
                          key={t.team_id}
                          className="px-2 py-1 text-xs rounded bg-amber-600 text-black font-semibold"
                        >
                          {t.team_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {evaluation?.conflicts?.length === 0 && (
                  <p className="text-sm text-slate-400">No conflicts found.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ReauctionAnalyzer;
