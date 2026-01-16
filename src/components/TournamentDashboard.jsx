import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import CONFIG from "../components/config";
// import BackgroundEffect from "../components/BackgroundEffect";

const API = CONFIG.API_BASE_URL;



// Helper: format rupees to lakhs (e.g., 2000000 -> "20 lakhs", 2050000 -> "20.5 lakhs")
// Formats rupees: >= 1,00,000 as lakhs; else as k (thousands).
// Shows "0" cleanly if value is 0.
const formatLakhs = (amt) => {
  const n = Number(amt) || 0;

  if (n === 0) return "0";

  // Lakhs
  if (n >= 100000) {
    const lakhs = n / 100000;
    const str = (Number.isInteger(lakhs) ? lakhs.toFixed(0) : lakhs.toFixed(2)).replace(/\.0$/, "");
    return `${str} ${parseFloat(str) === 1 ? "lakh" : "lakhs"}`;
  }

  // Thousands → k
  const thousands = n / 1000;
  const str = (Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(2)).replace(/\.0$/, "");
  return `${str}k`;
};


// --- Team flags (public/...) ---
const PUB = process.env.PUBLIC_URL || "";
const FLAG = (file) => `${PUB}/${file}`;

const TEAM_FLAG_MAP = {
  Badgers: FLAG("badgers-flag.png"),
  Blasters: FLAG("blasters-flag.png"),
  Fighters: FLAG("fighters-flag.png"),
  Kings: FLAG("kings-flag.png"),
  Knights: FLAG("knights-flag.png"),
  Lions: FLAG("lions-flag.png"),
  Royals: FLAG("royals-flag.png"),
  Titans: FLAG("titans-flag.png"),
};

// Fallback to team logo if a flag image is missing
const getTeamFlagSrc = (teamName, teamLogo) => {
  const byName = TEAM_FLAG_MAP[teamName?.trim?.()];
  if (byName) return byName;
  return teamLogo
    ? `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${teamLogo}?tr=w-900,h-900,q-50,bl-6`
    : "/no-team-logo.png";
};

// Brand gradient background (EAARENA)
const EA_BG_STYLE = {
  backgroundImage: `
    radial-gradient(1100px 600px at 0% 0%, rgba(250, 204, 21, .15), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(59, 130, 246, .16), transparent 60%),
    linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
  `
};


const TournamentDashboard = () => {
  const { tournamentSlug } = useParams();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
  const [tournamentName, setTournamentName] = useState("Loading...");
  const [tournamentLogo, setTournamentLogo] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hoverTeamName, setHoverTeamName] = useState(null);
  const [kcplTeamStates, setKcplTeamStates] = useState([]);


  const [activePool, setActivePool] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("kcplActivePool")) || "A"
  );
  const userPinnedPoolRef = useRef(false);
  const POOLS = ["A", "B", "C", "D"];



  useEffect(() => {
    document.title = "Home-Dashboard | Auction Arena";
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "kcplActivePool" && e.newValue) setActivePool(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fetchTournamentData = async () => {
    try {
      const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
      const data = await res.json();
      setTournamentName(data.title || tournamentSlug);
      setTournamentLogo(data.logo);
      setTotalPlayersToBuy(data.players_per_team || 14);

      const tournamentId = data.id;

      // 🔹 Fetch KCPL active pool
      const poolRes = await fetch(`${API}/api/kcpl/active-pool`);
      const poolData = await poolRes.json();

      let localOverride = null;
      try { localOverride = localStorage.getItem("kcplActivePool"); } catch { }

      if (!localOverride && !userPinnedPoolRef.current && poolData?.pool && POOLS.includes(poolData.pool)) {
        setActivePool(poolData.pool);
      }

      // 🔹 Fetch KCPL team pool snapshots
      const statesRes = await fetch(`${API}/api/kcpl/team-states/${tournamentId}`);
      const statesData = await statesRes.json();
      setKcplTeamStates(statesData || []);


      const [teamRes, playerRes] = await Promise.all([
        fetch(`${API}/api/teams?tournament_id=${tournamentId}`),
        fetch(`${API}/api/players?tournament_id=${tournamentId}`),
      ]);

      const teamData = await teamRes.json();
      const playerData = await playerRes.json();

      const soldPlayers = playerData.filter(
        (p) => p.sold_status === true || p.sold_status === "TRUE"
      );

      setPlayers(soldPlayers);
      setTeams(teamData);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("❌ Failed to load dashboard data:", err);
    }
  };

  // Generates a random gradient background if no flag
  const getRandomBg = () => {
    const gradients = [
      "linear-gradient(135deg, #1e3c72, #2a5298)",
      "linear-gradient(135deg, #42275a, #734b6d)",
      "linear-gradient(135deg, #134e5e, #71b280)",
      "linear-gradient(135deg, #ff512f, #dd2476)",
      "linear-gradient(135deg, #373b44, #4286f4)",
      "linear-gradient(135deg, #141e30, #243b55)",
      "linear-gradient(135deg, #3a1c71, #d76d77, #ffaf7b)",
    ];
    const idx = Math.floor(Math.random() * gradients.length);
    return gradients[idx];
  };




  useEffect(() => {
    fetchTournamentData();
    const interval = setInterval(fetchTournamentData, 30000);
    return () => clearInterval(interval);
  }, [tournamentSlug]);


  useEffect(() => {
    if (hoverTeamName) {
      const timer = setTimeout(() => setHoverTeamName(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [hoverTeamName]);

  // Refresh code
  useEffect(() => {
    const tick = setInterval(() => {
      setLastUpdated((prev) => (prev ? new Date(prev) : null));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const getTimeAgo = () => {
    if (!lastUpdated) return "Never";
    const seconds = Math.floor((new Date() - lastUpdated) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s ago`;
  };

  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString()}`;

  const [sortKey, setSortKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sortKey") || "alphabetical";
    }
    return "alphabetical";
  });

  const [sortOrder, setSortOrder] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sortOrder") || "asc";
    }
    return "asc";
  });

  useEffect(() => {
    try {
      localStorage.setItem("sortKey", sortKey);
      localStorage.setItem("sortOrder", sortOrder);
    } catch (err) {
      console.warn("⚠️ Could not persist sort settings:", err);
    }
  }, [sortKey, sortOrder]);


  // Precompute per-team metrics
  const enrichedTeams = useMemo(() => {
    return (teams || []).map((team) => {
      const teamPlayers = players.filter(
        (p) => Number(p.team_id) === Number(team.id)
      );
      const totalSpent = teamPlayers.reduce(
        (sum, p) => sum + (Number(p.sold_price) || 0),
        0
      );
      const budget = Number(team?.budget) || 0;
      const remainingPurse = Math.max(0, budget - totalSpent);
      const slotsTotal = totalPlayersToBuy || 14;
      const bought = Number(team?.bought_count || 0);
      const slotsRemaining = Math.max(0, slotsTotal - bought);
      const maxBid = Number(team?.max_bid_allowed || 0);

      return {
        ...team,
        _calc: {
          budget,
          totalSpent,
          remainingPurse,
          slotsTotal,
          bought,
          slotsRemaining,
          maxBid,
          spentPct:
            budget > 0
              ? Math.min(100, Math.round((totalSpent / budget) * 100))
              : 0,
        },
      };
    });
  }, [teams, players, totalPlayersToBuy]);

  // Apply sorting
  const sortedTeams = useMemo(() => {
    const arr = [...enrichedTeams];
    const direction = sortOrder === "asc" ? 1 : -1;

    switch (sortKey) {
      case "maxBid":
        arr.sort((a, b) => (a._calc.maxBid - b._calc.maxBid) * direction);
        break;
      case "balance":
        arr.sort((a, b) => (a._calc.remainingPurse - b._calc.remainingPurse) * direction);
        break;
      case "slots":
        arr.sort((a, b) => (a._calc.slotsRemaining - b._calc.slotsRemaining) * direction);
        break;
      case "alphabetical":
      default:
        arr.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || "")) * direction
        );
        break;
    }
    return arr;
  }, [enrichedTeams, sortKey, sortOrder]);



  return (
    // <div className="min-h-screen bg-gradient-to-br from-yellow-100 to-black text-black pt-16 pb-0">

    // <div
    //   className="min-h-screen text-black relative"
    //   style={{
    //     backgroundImage: `linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), rgba(255, 215, 0, 0.3)), url("/bg1.jpg")`,
    //     backgroundSize: 'cover',
    //     backgroundRepeat: 'no-repeat',
    //     backgroundPosition: 'center',
    //     overflowX: 'hidden'
    //   }}
    // >

    <div className="min-h-screen text-black relative overflow-x-hidden mt-5 flex flex-col" style={EA_BG_STYLE}>
      <div className="relative flex-1">
        <Navbar tournamentSlug={tournamentSlug} />

        <div className="flex flex-col items-center justify-center mt-10">
          {tournamentLogo && (
            <img
              src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}`}
              alt="Tournament Logo"
              className="w-36 h-36 object-contain animate-pulse"
            />
          )}
          <h1 className="text-2xl font-bold my-2 text-center text-yellow-300">{tournamentName}</h1>
          <p className="text-xs font-bold text-yellow-600 mt-1 animate-pulse">🔴 LIVE || Last updated: {getTimeAgo()}</p>
        </div>

        {/* ======= TEAMS SECTION (hidden for KCPL) — Redesigned + Sorting ======= */}
        {tournamentSlug !== "kcpl" && (
          <section className="px-4 mt-8">
            {/* Header + sort control */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-yellow-300 text-lg md:text-xl font-extrabold tracking-wide uppercase">
                Teams Overview
              </h2>

              <div className="flex items-center gap-2">
                <label className="text-xs text-yellow-200/80 uppercase tracking-wide">
                  Sort by
                </label>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="bg-black/40 text-yellow-200 border border-white/20 rounded-md text-xs md:text-sm px-3 py-2 outline-none focus:border-yellow-400"
                  title="Sort teams"
                >
                  <option value="alphabetical">Alphabetical</option>
                  <option value="maxBid">Max Bid</option>
                  <option value="balance">Available Balance</option>
                  <option value="slots">Slots Remaining</option>
                </select>

                {/* ASC/DESC toggle button */}
                <button
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="px-2 py-1 rounded-md border border-white/20 bg-black/40 text-yellow-200 text-xs hover:bg-white/10 transition"
                  title={`Switch to ${sortOrder === "asc" ? "Descending" : "Ascending"} order`}
                >
                  {sortOrder === "asc" ? "↑ ASC" : "↓ DESC"}
                </button>
              </div>

            </div>

            {/* Cards grid */}
            {/* Cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedTeams.map((team, idx) => {
                const {
                  budget,
                  totalSpent,
                  remainingPurse,
                  slotsTotal,
                  bought,
                  slotsRemaining,
                  maxBid,
                  spentPct,
                } = team._calc;

                const flagSrc = getTeamFlagSrc(team?.name, team?.logo);

                return (
                  <React.Fragment key={team.id}>
                    <article
                      className="relative overflow-hidden rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg backdrop-blur-md transition-transform duration-300 hover:scale-[1.02] hover:shadow-xl"
                    >
                      {/* Watermark background (flag or gradient fallback) */}
                      <div className="absolute inset-0 pointer-events-none select-none z-0">
                        <div
                          className="absolute inset-0 bg-center bg-cover"
                          style={{
                            backgroundImage: `url(${flagSrc})`,
                            filter:
                              "grayscale(55%) brightness(0.55) contrast(1.1) blur(1px)",
                            transform: "scale(1.1)",
                            transformOrigin: "center",
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/15 to-transparent" />
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              "radial-gradient(85% 70% at 50% 55%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)",
                          }}
                        />
                      </div>

                      {/* Content */}
                      <div className="relative z-10">
                        {/* Header */}
                        <header className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
                              alt={team.name}
                              className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/60 bg-black/20 object-contain"
                            />
                            <h3 className="font-bold text-white text-base md:text-xl truncate">
                              {team.name}
                            </h3>
                          </div>

                          {/* Available balance quick badge */}
                          <span className="px-2 py-1 rounded bg-white/10 text-yellow-200 text-xs md:text-sm whitespace-nowrap">
                            Budget:{" "}
                            <span className="font-bold text-white">
                              {formatLakhs(budget)}
                            </span>
                          </span>
                        </header>

                        {/* Quick stats */}
                        <div className="grid grid-cols-3 gap-2 md:gap-3 text-[12px] md:text-sm text-yellow-300">
                          <div className="bg-black/40 rounded-md p-2 md:p-3 text-center">
                            <div className="opacity-70">PURSE</div>
                            <div className="font-extrabold text-white text-xs md:text-base">
                              {formatLakhs(remainingPurse)}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-md p-2 md:p-3 text-center">
                            <div className="opacity-70">MAX BID</div>
                            <div className="font-extrabold text-white text-xs md:text-base">
                              {formatLakhs(maxBid)}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-md p-2 md:p-3 text-center">
                            <div className="opacity-70">SLOTS</div>
                            <div className="font-extrabold text-white text-xs md:text-base">
                              {bought} / {slotsTotal}
                            </div>
                          </div>
                        </div>

                        {/* Purse progress */}
                        <div className="mt-3">
                          <div className="h-2 w-full bg-white/10 rounded">
                            <div
                              className="h-2 rounded bg-yellow-400 transition-all"
                              style={{ width: `${spentPct}%` }}
                              title={`Spent: ${formatLakhs(
                                totalSpent
                              )} / Cap: ${formatLakhs(budget)} (${spentPct}%)`}
                            />
                          </div>
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] md:text-sm text-yellow-200">
                          <span>Spent: {formatLakhs(totalSpent)}</span>
                          <span>
                            Remaining:{" "}
                            <span className="font-semibold text-white">
                              {formatLakhs(remainingPurse)}
                            </span>
                          </span>
                        </div>

                        {/* Secondary line */}
                        <div className="mt-1 text-[11px] md:text-sm text-yellow-200">
                          Players to buy:{" "}
                          <span className="font-semibold text-white">
                            {slotsRemaining}
                          </span>
                        </div>
                      </div>
                    </article>

                    {/* MOBILE-ONLY separator (hidden at >=640px where grid has 2+ columns) */}
                    {idx !== sortedTeams.length - 1 && (
                      <div className="sm:hidden h-px mx-1 -mt-2 mb-3 bg-white/40" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

          </section>
        )}





        {/* ===== KCPL FULL-PAGE POOL DASHBOARD ===== */}
        {tournamentSlug === "kcpl" && kcplTeamStates?.length > 0 && (
          <section className="px-4 mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-yellow-400 text-base md:text-lg font-extrabold tracking-wide uppercase">
                POOL {activePool} — LIVE MAX BID / MAX PLAYERS / POOL PURSE
              </div>
              <div className="flex gap-2">
                {POOLS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      userPinnedPoolRef.current = true;
                      setActivePool(p);
                      try { localStorage.setItem("kcplActivePool", p); } catch { }
                    }}
                    className={`px-3 py-1 rounded-md text-xs font-semibold border ${activePool === p
                      ? "bg-yellow-400 text-black border-yellow-300"
                      : "bg-white/10 text-yellow-200 border-white/20 hover:bg-white/20"
                      }`}
                    title={`Switch to Pool ${p}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Full-page grid, scaled up for laptops */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-2 gap-4">
              {kcplTeamStates.map((t, idx) => {
                // Overall (all pools)
                const teamMeta = teams.find(x => Number(x.id) === Number(t.teamId));
                const teamPlayersSold = players.filter(p => Number(p.team_id) === Number(t.teamId));
                const totalSpentOverall = teamPlayersSold.reduce((s, p) => s + (Number(p.sold_price) || 0), 0);
                const remainingOverall = Math.max(0, (Number(teamMeta?.budget) || 0) - totalSpentOverall);
                const totalSlots = totalPlayersToBuy || 14;
                const boughtOverall = teamMeta?.bought_count ?? teamPlayersSold.length;

                // Active pool
                const stats = t.poolStats?.[activePool] || {};
                const poolLimit = t.limitByPool?.[activePool] || 0;
                const poolSpent = t.spentByPool?.[activePool] || 0;
                const poolBought = t.boughtByPool?.[activePool] || 0;
                const poolRemaining = Math.max(0, poolLimit - poolSpent);

                return (
                  <React.Fragment key={t.teamId}>
                    <article className="relative overflow-hidden rounded-2xl bg-white/10 border border-white/20 sm:border-white/10 p-4 shadow-lg">                    {/* Watermark flag */}
                      {/* Watermark flag — muted, full-cover, with vignette for readability */}
                      {(() => {
                        const flagSrc = getTeamFlagSrc(t.teamName, teamMeta?.logo);
                        return (
                          <div className="absolute inset-0 pointer-events-none select-none z-0">
                            {/* Flag image: desaturated, darker, slightly blurred, scaled to always cover */}
                            <div
                              className="absolute inset-0 bg-center bg-cover"
                              style={{
                                backgroundImage: `url(${flagSrc})`,
                                filter: "grayscale(50%) brightness(0.55) contrast(1.1) blur(1.2px)",
                                transform: "scale(1.12)",           // avoids edges at any ratio
                                transformOrigin: "center",
                              }}
                            />
                            {/* Soft diagonal scrim (keeps text legible on bright areas) */}
                            <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/15 to-transparent" />
                            {/* Vignette to fade edges (no stripes) */}
                            <div
                              className="absolute inset-0"
                              style={{
                                background:
                                  "radial-gradient(85% 70% at 50% 55%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)",
                              }}
                            />
                          </div>
                        );
                      })()}

                      {/* Header: logo + name + overall purse + team count */}
                      <div className="relative z-10">
                        {/* Header: logo + name + overall purse + team count */}
                        <header className="flex items-center justify-between mb-3 gap-3">                      <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${teamMeta?.logo || ''}`}
                            alt={t.teamName}
                            className="w-8 h-8 md:w-16 md:h-16 rounded-full border border-white/60"
                          />
                          <span className="font-bold text-white text-base md:text-xl truncate">
                            {t.teamName}
                          </span>
                        </div>
                          <div className="flex items-center gap-2 text-xs md:text-xl">
                            <span className="px-2 py-0.5 rounded bg-white/10 text-yellow-200 whitespace-nowrap">
                              Purse: <span className="font-bold text-white">{formatLakhs(remainingOverall)}</span>
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white/10 text-yellow-200 whitespace-nowrap">
                              Team: <span className="font-bold text-white">{boughtOverall}/{totalSlots}</span>
                            </span>
                          </div>
                        </header>

                        {/* Pool stats (bigger on laptop) */}
                        <div className="grid grid-cols-3 gap-3 text-[12px] md:text-lg text-yellow-300">
                          <div className="bg-black/40 rounded-md p-3 text-center">
                            <div className="opacity-70">MAX BID</div>
                            <div className="font-extrabold text-white text-sm md:text-base">
                              {formatLakhs(stats.maxBid || 0)}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-md p-3 text-center">
                            <div className="opacity-70">MAX PLY</div>
                            <div className="font-extrabold text-white text-sm md:text-base">
                              {stats.maxPlayers ?? 0}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-md p-3 text-center">
                            <div className="opacity-70">POOL PURSE</div>
                            <div className="font-extrabold text-white text-sm md:text-base">
                              {formatLakhs(poolRemaining)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="h-2 w-full bg-white/10 rounded">
                            <div
                              className="h-2 rounded bg-yellow-400"
                              style={{ width: poolLimit > 0 ? `${Math.min(100, (poolSpent / poolLimit) * 100)}%` : "0%" }}
                            />
                          </div>
                        </div>
                        <div className="mt-1 flex justify-between text-[11px] md:text-lg text-yellow-200">
                          <span>Spent: {formatLakhs(poolSpent)}</span>
                          <span>Cap: {formatLakhs(poolLimit)}</span>
                        </div>
                        <div className="mt-1 text-[11px] md:text-lg text-yellow-200">
                          Bought in {activePool}: <span className="font-semibold text-white">{poolBought}</span>
                        </div>
                      </div>
                    </article>
                    {/* MOBILE-ONLY separator (hidden at >=640px where grid is 2+ columns) */}
                    {idx !== kcplTeamStates.length - 1 && (
                      <div className="sm:hidden h-px mx-1 -mt-2 mb-3 bg-white/40" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </section>
        )}

      </div>

      <footer className="relative z-10 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 py-2 mt-10">
        🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
      </footer>
    </div>


  );
};

export default TournamentDashboard;
