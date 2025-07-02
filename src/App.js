import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import SpectatorLiveDisplay from './components/SpectatorLiveDisplay';
import SpectatorLiveDisplay2 from './components/SpectatorLiveDisplay2';
import CONFIG from './components/config';
import AllPlayerCards from './components/AllPlayerCards';
import AllTeamCards from './components/AllTeamCards';
import TournamentDashboard from "./components/TournamentDashboard";


const API = CONFIG.API_BASE_URL;


function App() {
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState({ bid_amount: 0, team_name: '' });
  const [teams, setTeams] = useState([]);

  const tournamentId = 1; // or dynamic from login/session

  const fetchData = async () => {
  try {
    const [playersRes, currentPlayerRes, currentBidRes, teamsRes] = await Promise.all([
      fetch(`${API}/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`),
      fetch(`${API}/api/current-player`),
      fetch(`${API}/api/current-bid`),
      fetch(`${API}/api/teams?tournament_id=${CONFIG.TOURNAMENT_ID}`),
    ]);

    const players = await playersRes.json();

    // Safely parse currentPlayer
    let currentPlayer = null;
    if (currentPlayerRes.ok) {
      const text = await currentPlayerRes.text();
      if (text) currentPlayer = JSON.parse(text);
    }

    // Safely parse currentBid
    let currentBid = { bid_amount: 0, team_name: '' };
    if (currentBidRes.ok) {
      const text = await currentBidRes.text();
      if (text) currentBid = JSON.parse(text);
    }

    const teams = await teamsRes.json();

    setPlayers(players);
    setCurrentPlayer(currentPlayer);
    setCurrentBid(currentBid);
    setTeams(teams);
  } catch (err) {
    console.error("Failed to fetch data from backend", err);
  }
};


  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // refresh every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const clapAudio = new Audio("clapping.wav");
  let audioUnlocked = false;

  const unlockAudio = () => {
    if (!audioUnlocked) {
      clapAudio.play().then(() => {
        clapAudio.pause(); // immediately pause
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
    <Router>
      <Routes>
        <Route path="/:tournamentSlug" element={<AdminPanel />} />
        <Route
          path="/spectator/:tournamentSlug"
          element={
            <SpectatorLiveDisplay
              player={currentPlayer}
              highestBid={currentBid.bid_amount}
              leadingTeam={currentBid.team_name}
              teamSummaries={teams}
            />
          }
        />
        <Route
          path="/spectator2/:tournamentSlug"
          element={
            <SpectatorLiveDisplay2
              player={currentPlayer}
              highestBid={currentBid.bid_amount}
              leadingTeam={currentBid.team_name}
              teamSummaries={teams}
            />
          }
        />
        <Route
          path="/player-cards/:tournamentSlug"
          element={<AllPlayerCards />}
        />

        <Route path="/team-cards/:tournamentSlug" 
        element={<AllTeamCards />} 
        />

        <Route path="/tournament/:tournamentSlug"
         element={<TournamentDashboard />} 
         />


      </Routes>
    </Router>
  );
}

export default App;
