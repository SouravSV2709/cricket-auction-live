import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import CONFIG from "../components/config";
import BackgroundEffect from "../components/BackgroundEffect";

const API = CONFIG.API_BASE_URL;

const TournamentDashboard = () => {
  const { tournamentSlug } = useParams();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
  const [tournamentName, setTournamentName] = useState("Loading...");
  const [tournamentLogo, setTournamentLogo] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hoverTeamName, setHoverTeamName] = useState(null);


  useEffect(() => {
    document.title = "Home-Dashboard | Auction Arena";
  }, []);

  const fetchTournamentData = async () => {
    try {
      const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
      const data = await res.json();
      setTournamentName(data.title || tournamentSlug);
      setTournamentLogo(data.logo);
      setTotalPlayersToBuy(data.total_players_to_buy || 14);

      const tournamentId = data.id;

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

    <div className="min-h-screen text-black relative overflow-hidden mt-5">
      <BackgroundEffect theme="grid" />
      <div className="relative z-10">
        <Navbar tournamentSlug={tournamentSlug} />

        <div className="flex flex-col items-center justify-center mt-8">
          {tournamentLogo && (
            <img
              src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
              alt="Tournament Logo"
              className="w-36 h-36 object-contain animate-pulse"
            />
          )}
          <h1 className="text-2xl font-bold my-2 text-center text-yellow-300">{tournamentName}</h1>
          {/* <p className="text-xs font-bold text-yellow-600 mt-1 animate-pulse">🔴 LIVE || Last updated: {getTimeAgo()}</p> */}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mt-6 px-4">
          {[teams.slice(0, 8), teams.slice(8)].map((group, groupIdx) => (
            <div
              key={groupIdx}
              className="w-full md:w-[48%] bg-white/10 border border-white/10 rounded-2xl px-4 py-6 backdrop-blur-sm shadow-xl space-y-2"
            >
              {/* Header */}
              <div className="grid grid-cols-4 gap-2 px-3 py-2 font-bold text-sm bg-gray-800 rounded-lg text-yellow-300 text-center">
                <div>TEAM</div>
                <div className="text-center">PURSE</div>
                <div className="text-center">MAX BID</div>
                <div className="text-center">SLOTS</div>
              </div>

              {/* Teams */}
              {group.map((team) => {
                const teamPlayers = players.filter(p => Number(p.team_id) === Number(team.id));
                const totalSpent = teamPlayers.reduce((sum, p) => sum + (Number(p.sold_price) || 0), 0);
                const remainingPurse = Math.max((team.budget || 0) - totalSpent, 0);
                const playersLeftToBuy = (totalPlayersToBuy || 14) - (team.bought_count || 0);

                return (
                  <div
                    key={team.id}
                    className="grid grid-cols-4 gap-2 items-center px-3 py-3 rounded-lg bg-gradient-to-r from-blue-900 to-purple-900 text-base font-semibold shadow-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <img
                        src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                        alt={team.name}
                        className="w-6 h-6 rounded-full border border-white hidden md:block"
                      />
                      <span
                        className="truncate cursor-pointer"
                        onClick={() => setHoverTeamName(team.name)}
                      >
                        {team.name}
                      </span>
                    </div>
                    <div className="text-center text-yellow-600 text-bold">{formatCurrency(remainingPurse)}</div>
                    <div className="text-center text-yellow-600 text-bold">{formatCurrency(team.max_bid_allowed)}</div>
                    <div className="text-center text-yellow-600 text-bold">{playersLeftToBuy}</div>
                    {hoverTeamName === team.name && (
                      <div className="text-xs text-yellow-300 font-bold mt-1">{team.name}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <footer className="float bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
        🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
      </footer>
    </div>


  );
};

export default TournamentDashboard;
