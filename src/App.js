import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import SpectatorLiveDisplay from './components/SpectatorLiveDisplay';
import SpectatorLiveDisplay2 from './components/SpectatorLiveDisplay2';
import SpectatorLiveDisplay3 from './components/SpectatorLiveDisplay3';
import SpectatorLiveDisplay4 from './components/SpectatorLiveDisplay4';
import SpectatorLiveDisplay5 from './components/SpectatorLiveDisplay5';
import SpectatorLiveDisplay6 from './components/SpectatorLiveDisplay6';
import CONFIG from './components/config';
import AllPlayerCards from './components/AllPlayerCards';
import AllPlayerCards2 from './components/AllPlayerCards2';
import AllTeamCards from './components/AllTeamCards';
import TournamentDashboard from "./components/TournamentDashboard";
import SecretBidPage from './components/SecretBidPage';
import TournamentGroupDraw from "./components/TournamentGroupDraw";
import SuperAdminLinks from "./components/SuperAdminLinks";
import ReauctionAnalyzer from "./components/ReauctionAnalyzer";


const API = CONFIG.API_BASE_URL;

const AppWrapper = () => {
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState({ bid_amount: 0, team_name: '' });
  const [teams, setTeams] = useState([]);

  const location = useLocation();

  // 👇 Only poll current-player and current-bid on auction-related screens
  useEffect(() => {
    const isAuctionPage = location.pathname.startsWith("/spectator");

    if (!isAuctionPage) return;

    const fetchLiveAuctionData = async () => {
      try {
        const [currentPlayerRes, currentBidRes, teamsRes] = await Promise.all([
          fetch(`${API}/api/current-player?tournament_id=${CONFIG.TOURNAMENT_ID}`),
          fetch(`${API}/api/current-bid?tournament_id=${CONFIG.TOURNAMENT_ID}`),
          fetch(`${API}/api/teams?tournament_id=${CONFIG.TOURNAMENT_ID}`),
        ]);

        // Parse currentPlayer
        let currentPlayer = null;
        if (currentPlayerRes.ok) {
          const text = await currentPlayerRes.text();
          if (text) currentPlayer = JSON.parse(text);
        }

        // Parse currentBid safely and keep a stable shape
        let currentBid = { bid_amount: 0, team_name: '' };
        if (currentBidRes.ok) {
          const text = await currentBidRes.text();
          if (text && text.trim().length > 0) {
            try {
              const parsed = JSON.parse(text);
              if (parsed && typeof parsed === 'object') {
                currentBid = {
                  bid_amount: Number(parsed.bid_amount) || 0,
                  team_name: parsed.team_name || ''
                };
              }
            } catch {}
          }
        }

        const teams = await teamsRes.json();

        setCurrentPlayer(currentPlayer);
        setCurrentBid(currentBid || { bid_amount: 0, team_name: '' });
        setTeams(teams);
      } catch (err) {
        console.error("Failed to fetch live auction data", err);
      }
    };

    fetchLiveAuctionData();
    const interval = setInterval(fetchLiveAuctionData, 3000); // refresh every 3 seconds
    return () => clearInterval(interval);
  }, [location.pathname]);

  const clapAudio = new Audio("clapping.wav");
  let audioUnlocked = false;

  const unlockAudio = () => {
    if (!audioUnlocked) {
      clapAudio.play().then(() => {
        clapAudio.pause();
        clapAudio.currentTime = 0;
        audioUnlocked = true;
      }).catch(() => { });
    }
  };

  useEffect(() => {
    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  return (
    <Routes>
      <Route path="2709/:tournamentSlug" element={<AdminPanel />} />
      <Route
        path="/spectator/:tournamentSlug"
        element={
          <SpectatorLiveDisplay
            player={currentPlayer}
            highestBid={currentBid?.bid_amount ?? 0}
            leadingTeam={currentBid?.team_name ?? ''}
            teamSummaries={teams}
          />
        }
      />
      <Route
        path="/spectator2/:tournamentSlug"
        element={
          <SpectatorLiveDisplay2
            player={currentPlayer}
            highestBid={currentBid?.bid_amount ?? 0}
            leadingTeam={currentBid?.team_name ?? ''}
            teamSummaries={teams}
          />
        }
      />
      <Route
        path="/spectator3/:tournamentSlug"
        element={
          <SpectatorLiveDisplay3
            player={currentPlayer}
            highestBid={currentBid?.bid_amount ?? 0}
            leadingTeam={currentBid?.team_name ?? ''}
            teamSummaries={teams}
          />
        }
      />
      <Route
        path="/spectator4/:tournamentSlug"
        element={
          <SpectatorLiveDisplay4
            player={currentPlayer}
            highestBid={currentBid?.bid_amount ?? 0}
            leadingTeam={currentBid?.team_name ?? ''}
            teamSummaries={teams}
          />
        }
      />
      <Route
        path="/spectator5/:tournamentSlug"
        element={
          <SpectatorLiveDisplay5
            player={currentPlayer}
            highestBid={currentBid?.bid_amount ?? 0}
            leadingTeam={currentBid?.team_name ?? ''}
            teamSummaries={teams}
          />
        }
      />
      <Route path="/spectator6/:tournamentSlug" element={<SpectatorLiveDisplay6 />} />
      <Route path="/player-cards/:tournamentSlug" element={<AllPlayerCards />} />
      <Route path="/player-cards2/:tournamentSlug" element={<AllPlayerCards2 />} />
      <Route path="/team-cards/:tournamentSlug" element={<AllTeamCards />} />
      <Route path="/tournament/:tournamentSlug" element={<TournamentDashboard />} />
      <Route path="/secret-bid/:tournamentSlug" element={<SecretBidPage />} />
      <Route path="/grouping/:tournamentSlug" element={<TournamentGroupDraw />} />
      <Route path="/superadmin/eaarena/" element={<SuperAdminLinks />} />
      <Route path="/reauction/:tournamentSlug" element={<ReauctionAnalyzer />} />
    </Routes>
  );
};

// 👇 Main entry with router
const App = () => (
  <Router>
    <AppWrapper />
  </Router>
);

export default App;
