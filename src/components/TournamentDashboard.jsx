import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import CONFIG from "../components/config";
import BackgroundEffect from "../components/BackgroundEffect";

const API = CONFIG.API_BASE_URL;



// Helper: format rupees to lakhs (e.g., 2000000 -> "20 lakhs", 2050000 -> "20.5 lakhs")
const formatLakhs = (amount) => {
  const n = Number(amount) || 0;
  const lakhs = n / 100000;

  // Decide decimal places: 0 if whole, 1 if tenths fits, else 2
  let decimals = 0;
  if (lakhs % 1 !== 0) {
    decimals = (Math.round(lakhs * 10) / 10 === lakhs) ? 1 : 2;
  }

  const str = lakhs.toFixed(decimals).replace(/\.0$/, ''); // trim trailing .0
  const unit = parseFloat(str) === 1 ? 'lakh' : 'lakhs';
  return `${str} ${unit}`;
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

    <div className="min-h-screen text-black relative overflow-x-hidden mt-5 flex flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <BackgroundEffect theme="grid" />
      </div>
      <div className="relative z-10 flex-1">
        <Navbar tournamentSlug={tournamentSlug} />

        <div className="flex flex-col items-center justify-center mt-10">
          {tournamentLogo && (
            <img
              src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
              alt="Tournament Logo"
              className="w-36 h-36 object-contain animate-pulse"
            />
          )}
          <h1 className="text-2xl font-bold my-2 text-center text-yellow-300">{tournamentName}</h1>
          <p className="text-xs font-bold text-yellow-600 mt-1 animate-pulse">🔴 LIVE || Last updated: {getTimeAgo()}</p>
        </div>

        {/* ======= TEAMS SECTION (hidden for KCPL) ======= */}
        {tournamentSlug !== 'kcpl' && (
          <div className="flex flex-wrap justify-center gap-4 mt-6 px-4">
            {teams.length <= 8 ? (
              // Single block
              <div className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-6 backdrop-blur-sm shadow-xl space-y-2">
                {/* Header */}
                <div className="grid grid-cols-4 gap-2 px-3 py-2 font-bold text-sm bg-gray-800 rounded-lg text-yellow-300 text-center">
                  <div>TEAM</div>
                  <div>PURSE</div>
                  <div>MAX BID</div>
                  <div>SLOTS</div>
                </div>

                {teams.map((team) => {
                  const teamPlayers = players.filter(p => Number(p.team_id) === Number(team.id));
                  const totalSpent = teamPlayers.reduce((sum, p) => sum + (Number(p.sold_price) || 0), 0);
                  const remainingPurse = Math.max((team.budget - totalSpent) || 0);
                  const playersLeftToBuy = (totalPlayersToBuy || 14) - (team.bought_count || 0);

                  return (
                    <div key={team.id} className="grid grid-cols-4 gap-2 items-center px-3 py-3 rounded-lg bg-gradient-to-r from-blue-900 to-purple-900 text-base font-semibold shadow-sm">
                      <div className="flex items-center gap-2 truncate">
                        <img src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`} alt={team.name} className="w-6 h-6 rounded-full border border-white hidden md:block" />
                        <span className="truncate">{team.name}</span>
                      </div>
                      <div className="text-center text-yellow-600">{formatCurrency(remainingPurse)}</div>
                      <div className="text-center text-yellow-600">{formatCurrency(team.max_bid_allowed)}</div>
                      <div className="text-center text-yellow-600">{playersLeftToBuy} / {totalPlayersToBuy}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Two blocks (8 + rest)
              [teams.slice(0, 8), teams.slice(8)].map((group, groupIdx) => (
                <div key={groupIdx} className="w-full md:w-[48%] bg-white/10 border border-white/10 rounded-2xl px-4 py-6 backdrop-blur-sm shadow-xl space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 font-bold text-sm bg-gray-800 rounded-lg text-yellow-300 text-center">
                    <div>TEAM</div>
                    <div>PURSE</div>
                    <div>MAX BID</div>
                    <div>SLOTS</div>
                  </div>

                  {group.map((team) => {
                    const teamPlayers = players.filter(p => Number(p.team_id) === Number(team.id));
                    const totalSpent = teamPlayers.reduce((sum, p) => sum + (Number(p.sold_price) || 0), 0);
                    const remainingPurse = Math.max((team.budget - totalSpent) || 0);
                    const playersLeftToBuy = (totalPlayersToBuy || 14) - (team.bought_count || 0);

                    return (
                      <div key={team.id} className="grid grid-cols-4 gap-2 items-center px-3 py-3 rounded-lg bg-gradient-to-r from-blue-900 to-purple-900 text-base font-semibold shadow-sm">
                        <div className="flex items-center gap-2 truncate">
                          <img src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`} alt={team.name} className="w-6 h-6 rounded-full border border-white hidden md:block" />
                          <span className="truncate">{team.name}</span>
                        </div>
                        <div className="text-center text-yellow-600">{formatCurrency(remainingPurse)}</div>
                        <div className="text-center text-yellow-600">{formatCurrency(team.max_bid_allowed)}</div>
                        <div className="text-center text-yellow-600">{playersLeftToBuy} / {totalPlayersToBuy}</div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {kcplTeamStates.map((t) => {
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
                  <article key={t.teamId} className="rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg">
                    {/* Header: logo + name + overall purse + team count */}
                    <header className="flex items-center justify-between mb-3 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${teamMeta?.logo || ''}`}
                          alt={t.teamName}
                          className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/60"
                        />
                        <span className="font-bold text-white text-base md:text-lg truncate">
                          {t.teamName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs md:text-sm">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-yellow-200 whitespace-nowrap">
                          Purse: <span className="font-bold text-white">{formatLakhs(remainingOverall)}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-yellow-200 whitespace-nowrap">
                          Team: <span className="font-bold text-white">{boughtOverall}/{totalSlots}</span>
                        </span>
                      </div>
                    </header>

                    {/* Pool stats (bigger on laptop) */}
                    <div className="grid grid-cols-3 gap-3 text-[12px] md:text-sm text-yellow-300">
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
                        <div className="opacity-70">PURSE</div>
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
                      <div className="mt-1 flex justify-between text-[11px] md:text-xs text-yellow-200">
                        <span>Spent: {formatLakhs(poolSpent)}</span>
                        <span>Cap: {formatLakhs(poolLimit)}</span>
                      </div>
                      <div className="mt-1 text-[11px] md:text-xs text-yellow-200">
                        Bought in {activePool}: <span className="font-semibold text-white">{poolBought}</span>
                      </div>
                    </div>
                  </article>
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
