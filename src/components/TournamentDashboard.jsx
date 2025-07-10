import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import CONFIG from "../components/config";

const API = CONFIG.API_BASE_URL;

const TournamentDashboard = () => {
  const { tournamentSlug } = useParams();
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
  const [tournamentName, setTournamentName] = useState("Loading...");
  const [tournamentLogo, setTournamentLogo] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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

  // Refresh code
  // useEffect(() => {
  //   const tick = setInterval(() => {
  //     setLastUpdated((prev) => (prev ? new Date(prev) : null));
  //   }, 1000);
  //   return () => clearInterval(tick);
  // }, []);

  // const getTimeAgo = () => {
  //   if (!lastUpdated) return "Never";
  //   const seconds = Math.floor((new Date() - lastUpdated) / 1000);
  //   if (seconds < 60) return `${seconds}s ago`;
  //   const minutes = Math.floor(seconds / 60);
  //   return `${minutes}m ${seconds % 60}s ago`;
  // };

  const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString()}`;

  const getTeamGradient = (index) => {
    const gradients = [
      { from: "#2E3192", to: "#1BFFFF" },
      { from: "#FF5F6D", to: "#FFC371" },
      { from: "#00C9FF", to: "#92FE9D" },
      { from: "#f2709c", to: "#ff9472" },
      { from: "#7F00FF", to: "#E100FF" },
      { from: "#12c2e9", to: "#c471ed" },
      { from: "#F7971E", to: "#FFD200" },
      { from: "#00F260", to: "#0575E6" },
      { from: "#3a1c71", to: "#d76d77" },
      { from: "#FF512F", to: "#F09819" },
      { from: "#43cea2", to: "#185a9d" },
      { from: "#F00000", to: "#DC281E" },
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-100 to-black text-black pt-16 pb-0">
      <Navbar tournamentSlug={tournamentSlug} />

      <div className="flex flex-col items-center justify-center mt-1">
        {tournamentLogo && (
          <img
            src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
            alt="Tournament Logo"
            className="w-36 h-36 object-contain animate-pulse"
          />
        )}
        <h1 className="text-2xl font-bold my-2 text-center">{tournamentName}</h1>
        {/* <p className="text-xs font-bold text-black-600 mt-1">Last updated: {getTimeAgo()}</p> */}
      </div>

      <div className="max-w-4xl mx-auto px-2 space-y-2 mt-2">
        <div className="grid grid-cols-4 gap-4 px-4 py-2 text-white font-bold text-xs sm:text-sm md:text-base rounded-2xl bg-gray-800 shadow">
          <div className="flex items-center">Team</div>
          <div className="flex justify-center">💰 Purse</div>
          <div className="flex justify-center">🚀 Max Bid</div>
          <div className="flex justify-center">🎯 Slots</div>
        </div>

        {teams.map((team, idx) => {
          const teamPlayers = players.filter(
            (p) => Number(p.team_id) === Number(team.id)
            );
            const totalSpent = teamPlayers.reduce(
            (sum, p) => sum + (Number(p.sold_price) || 0), 0
            );
            const remainingPurse = Math.max((team.budget || 0) - totalSpent, 0);

          const playersBought = team.bought_count || 0;
          const playersLeftToBuy = (totalPlayersToBuy || 14) - playersBought;

          return (
            <div
              key={team.id}
              className="grid grid-cols-4 gap-4 items-center rounded-2xl px-4 py-2 shadow-lg hover:shadow-xl transition-shadow duration-300 border border-white/20 ring-1 ring-white/10 text-white font-bold text-xs sm:text-sm md:text-base"
              style={{
                background: `linear-gradient(to right, ${getTeamGradient(idx).from}, ${getTeamGradient(idx).to})`,
              }}
            >
              <div className="flex items-center gap-2">
                <img
                  src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                  alt={team.name}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-white"
                />
                <span className="uppercase">{team.name}</span>
              </div>
              <div className="text-center">{formatCurrency(remainingPurse)}</div>
              <div className="text-center">{formatCurrency(team.max_bid_allowed)}</div>
              <div className="text-center">{playersLeftToBuy}</div>
            </div>
          );
        })}
      </div>

      <footer className="float bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
        🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
      </footer>
    </div>
  );
};

export default TournamentDashboard;
