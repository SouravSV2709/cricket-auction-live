// src/pages/TournamentGroupDraw.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import Navbar from "../components/Navbar";

const API = CONFIG.API_BASE_URL;
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

const getTeamFlagSrc = (teamName, teamLogo) => {
  const byName = TEAM_FLAG_MAP[teamName?.trim?.()];
  if (byName) return byName;
  return teamLogo
    ? `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${teamLogo}?tr=w-900,h-900,q-50,bl-6`
    : "/no-team-logo.png";
};

const EA_BG_STYLE = {
  backgroundImage: `
    radial-gradient(1100px 600px at 0% 0%, rgba(250, 204, 21, .15), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(59, 130, 246, .16), transparent 60%),
    linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
  `,
};

export default function TournamentGroupDraw() {
  const { tournamentSlug } = useParams();
  const [groupsCount, setGroupsCount] = useState(4);
  const [tournament, setTournament] = useState(null);
  const [groupMap, setGroupMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [lastReveal, setLastReveal] = useState(null); // { team: {id,name,logo}, letter }
  const [teams, setTeams] = useState([]);
  const [spinName, setSpinName] = useState("");
  const spinTimerRef = useRef(null);

  const groupLetters = useMemo(
    () =>
      Array.from({ length: groupsCount }, (_, i) =>
        String.fromCharCode(65 + i)
      ),
    [groupsCount]
  );

  const fetchTournament = async () => {
    const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
    const data = await res.json();
    setTournament(data);
    if (data?.id) fetchTeams(data.id);
  };

  const fetchTeams = async (tournamentId) => {
    if (!tournamentId) return;
    const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
    const data = await res.json();
    setTeams(Array.isArray(data) ? data : data?.teams || []);
  };

  const fetchGroups = async () => {
    const res = await fetch(`${API}/api/tournaments/${tournamentSlug}/groups`);
    const data = await res.json();
    setGroupMap(data.groups || {});
  };

  useEffect(() => {
    fetchTournament();
    fetchGroups();
    // live updates from Socket.IO are possible — optional:
    // const s = io(API, { transports: ["websocket"] });
    // s.on("groupsUpdated", (p) => { if (p.slug === tournamentSlug) fetchGroups(); });
    // return () => s.disconnect();
  }, [tournamentSlug]);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) {
        clearInterval(spinTimerRef.current);
        spinTimerRef.current = null;
      }
    };
  }, []);

  const getUnassignedTeams = () => {
    // Build assigned ID set from current groupMap
    const assignedIds = new Set(
      Object.values(groupMap || {})
        .flat()
        .map((t) => t.id)
    );
    const unassigned = teams.filter((t) => !assignedIds.has(t.id));
    return unassigned.length ? unassigned : teams; // fallback to all to avoid empty spin
  };

  const handleDraw = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/tournaments/${tournamentSlug}/draw-groups`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupsCount, method: "roundRobin" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draw failed");
      await fetchGroups();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Clear all group assignments for this tournament?"))
      return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/tournaments/${tournamentSlug}/reset-groups`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      await fetchGroups();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpinAssign = async () => {
    // Start local spinning animation + name ticker
    const spinPool = getUnassignedTeams();
    if (!spinPool.length) {
      setLastReveal({ done: true });
      return;
    }

    setSpinning(true);
    let i = Math.floor(Math.random() * spinPool.length);
    if (spinTimerRef.current) clearInterval(spinTimerRef.current);
    spinTimerRef.current = setInterval(() => {
      setSpinName(spinPool[i % spinPool.length]?.name || "");
      i++;
    }, 80); // speed of cycling names

    try {
      const res = await fetch(
        `${API}/api/tournaments/${tournamentSlug}/assign-one`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupsCount }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assign-one failed");

      if (data.done) {
        setLastReveal({ done: true });
      } else {
        await fetchGroups(); // refresh board
        setLastReveal({ team: data.team, letter: data.letter });
      }
    } catch (e) {
      alert(e.message);
    } finally {
      if (spinTimerRef.current) {
        clearInterval(spinTimerRef.current);
        spinTimerRef.current = null;
      }
      setSpinName("");
      // tiny delay so the spin feels natural
      setTimeout(() => setSpinning(false), 300);
    }
  };

  const getInitials = (name = "") => {
    return name
      .split(" ")
      .map((word) => word[0]?.toUpperCase())
      .join("")
      .slice(0, 3); // limit to 3 letters
  };

  return (
    <div className="min-h-screen text-white mt-5" style={EA_BG_STYLE}>
      <div className="grid grid-cols-3 h-screen overflow-hidden">
        {/* Left 1/3: Flipping logos + Branding */}
        {/* Left 1/3: Flipping logos + Branding */}
        <div className="flex flex-col items-center justify-center border-r border-white/20 h-screen bg-black/20 px-6">
          <div className="w-80 h-80 flip-card">
            <div className="flip-inner relative">
              {/* Front: Tournament Logo */}
              <div className="flip-front flex items-center justify-center">
                {tournament?.logo && (
                  <img
                    src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournament.logo}`}
                    alt="Tournament Logo"
                    className="w-72 h-72 object-contain drop-shadow-2xl"
                  />
                )}
              </div>

              {/* Back: EAARENA Logo */}
              <div className="flip-back flex items-center justify-center">
                <img
                  src="/AuctionArena2.png"
                  alt="EA Arena Logo"
                  className="w-72 h-72 object-contain drop-shadow-2xl"
                />
              </div>
            </div>
          </div>

          {/* Branding text */}
          <div className="mt-10 text-center max-w-xs">
            <h2 className="text-2xl font-extrabold text-yellow-300 tracking-wide">
              Powered by EAARENA
            </h2>
            <p className="mt-3 text-sm text-yellow-200/80 leading-relaxed">
              The Ultimate Sports Auction Platform
            </p>
            <p className="mt-4 text-base font-semibold text-yellow-100">
              Customize and digitalize your auction experience with us.
            </p>

            {/* Contact info */}
            <div className="mt-6 text-sm text-yellow-200/80 space-y-2">
              <p>
                📞 Contact:{" "}
                <span className="font-bold text-yellow-300">
                  Sourav Mukherjee
                </span>
              </p>
              <p>
                📱{" "}
                <a
                  href="tel:+919547652702"
                  className="hover:underline text-yellow-300"
                >
                  +91-9547652702
                </a>
              </p>
              <p>
                🌐{" "}
                <a
                  href="https://www.eaarena.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-yellow-300"
                >
                  www.eaarena.in
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Right 2/3: UI */}
        <div className="col-span-2 px-6 py-8 overflow-y-auto h-full">
          {/* Header */}
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-extrabold mt-2 text-yellow-300 tracking-wide uppercase">
              {tournament?.title || tournamentSlug} — Group Draw
            </h1>
            <p className="text-xs text-yellow-200/80 mt-1">
              Select groups, draw, and view group-wise teams.
            </p>
          </div>

          {/* Controls */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-center">
            <div className="flex flex-col">
              <label className="text-xs text-yellow-200/80 mb-1">Groups</label>
              <select
                value={groupsCount}
                onChange={(e) => setGroupsCount(parseInt(e.target.value, 10))}
                className="bg-black/40 text-yellow-100 border border-white/20 rounded-md text-sm px-3 py-2 outline-none focus:border-yellow-400"
                title="Select number of groups"
              >
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 2 ? "group" : "groups"}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSpinAssign}
              disabled={loading || spinning}
              className="px-4 py-2 rounded-xl bg-emerald-400 text-black font-extrabold shadow hover:bg-emerald-300 transition"
              title="Assign one team to the next group"
            >
              {spinning ? "Spinning..." : "Spin the wheel"}
            </button>

            <button
              onClick={handleReset}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-yellow-200 hover:bg-white/20 transition"
              title="Clear all group assignments"
            >
              Reset
            </button>
            {/* <button
              onClick={handleDraw}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-extrabold shadow hover:bg-yellow-300 transition"
              title="Draw groups (round-robin)"
            >
              {" "}
              {loading ? "Drawing..." : "Draw Now"}{" "}
            </button> */}
          </div>

          {/* Spin Wheel + Reveal */}
          <div className="mt-8 flex flex-col items-center">
            {/* Wheel */}
            <div className="relative w-56 h-56">
              {/* wheel disc */}
              <div
                className={`w-full h-full rounded-full border-[6px] border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)] 
              bg-conic-gradient
              ${spinning ? "animate-[spin_5s_linear_infinite]" : ""}`}
              >
                {/* overlay ring */}
                <div className="absolute inset-2 rounded-full bg-black/40 backdrop-blur-sm" />
              </div>

              {/* pointer */}
              <div
                className="absolute -top-5 left-1/2 -translate-x-1/2 w-0 h-0
                  border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent
                  border-b-[24px] border-b-yellow-400 drop-shadow-lg"
              />

              {/* ticker name */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-3 text-center text-yellow-200 font-extrabold text-lg drop-shadow-sm animate-pulse">
                  {spinName}
                </div>
              </div>
            </div>

            {/* Reveal */}
            {lastReveal && !lastReveal.done && (
              <div className="mt-4 px-4 py-2 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md">
                <div className="text-sm text-yellow-200/90">
                  Assigned to{" "}
                  <span className="font-bold text-yellow-300">
                    Group {lastReveal.letter}
                  </span>
                  :
                </div>
                <div className="mt-1 flex items-center gap-3">
                  {lastReveal.team.logo ? (
                    <img
                      src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${lastReveal.team.logo}`}
                      alt={lastReveal.team.name}
                      className="w-8 h-8 rounded-full border border-white/30 bg-black/30 object-contain"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center font-bold border border-white/30">
                      {getInitials(lastReveal.team.name)}
                    </div>
                  )}

                  <div className="font-semibold">{lastReveal.team.name}</div>
                </div>
              </div>
            )}
            {lastReveal?.done && (
              <div className="mt-4 px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-yellow-300">
                All teams are already assigned.
              </div>
            )}
          </div>

          {/* Group-wise boards */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupLetters.map((L) => {
              const teams = groupMap[L] || [];
              return (
                <article
                  key={L}
                  className="relative overflow-hidden rounded-2xl bg-white/10 border border-white/10 p-4 shadow-lg backdrop-blur-md"
                >
                  <header className="flex items-center justify-between mb-3">
                    <h2 className="text-lg md:text-xl font-extrabold text-yellow-300 tracking-wide">
                      Group {L}
                    </h2>
                    <span className="text-xs bg-white/10 text-yellow-200 px-2 py-1 rounded">
                      {teams.length} Team{teams.length === 1 ? "" : "s"}
                    </span>
                  </header>

                  <ul className="space-y-2">
                    {teams.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl p-2"
                      >
                        {/* Initials */}
                        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-yellow-400 text-black font-bold border border-white/40">
                          {getInitials(t.name)}
                        </div>

                        {/* Team Name */}
                        <div className="min-w-0">
                          <div className="text-sm md:text-base font-bold truncate">
                            {t.name}
                          </div>
                        </div>
                      </li>
                    ))}
                    {teams.length === 0 && (
                      <li className="text-sm text-yellow-200/80">
                        No teams yet.
                      </li>
                    )}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
