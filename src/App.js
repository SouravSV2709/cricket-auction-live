import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminPanel from './components/AdminPanel';
import LiveDisplayAuction from './components/LiveDisplayAuction';
import LiveOnlyView from './components/LiveOnlyView';
import SpectatorLiveDisplay from './components/SpectatorLiveDisplay';
import CONFIG from './components/config';


function App() {
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState({ bid_amount: 0, team_name: '' });
  const [teams, setTeams] = useState([]);

  const tournamentId = 1; // or dynamic from login/session

  const fetchData = async () => {
    try {
      const [playersRes, currentPlayerRes, currentBidRes, teamsRes] = await Promise.all([
        fetch(`http://localhost:5000/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`),
        fetch(`http://localhost:5000/api/current-player`),
        fetch(`http://localhost:5000/api/current-bid`),
        fetch(`http://localhost:5000/api/teams?tournament_id=${CONFIG.TOURNAMENT_ID}`),
      ]);

      const players = await playersRes.json();
      const currentPlayer = await currentPlayerRes.json();
      const currentBid = await currentBidRes.json();
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
    }).catch(() => {});
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
        <Route path="/" element={<AdminPanel />} />
        <Route
          path="/live"
          element={
            <LiveDisplayAuction
              player={currentPlayer}
              highestBid={currentBid.bid_amount}
              leadingTeam={currentBid.team_name}
              auctionStatus={currentPlayer?.status}
              teamSummaries={teams}
            />
          }
        />
        <Route
          path="/spectator"
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
          path="/liveonly"
          element={
            <LiveOnlyView
              player={currentPlayer}
              highestBid={currentBid.bid_amount}
              leadingTeam={currentBid.team_name}
              teamSummaries={teams}
            />
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
