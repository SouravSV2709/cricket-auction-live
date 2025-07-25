import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import CONFIG from './config';
import Navbar from "../components/Navbar";

const API = CONFIG.API_BASE_URL;

const SecretBidPage = () => {
  const { tournamentSlug } = useParams();
  const [tournamentId, setTournamentId] = useState(null);
  const [playerSerial, setPlayerSerial] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [teamCode, setTeamCode] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [statusType, setStatusType] = useState(null); // 'success' or 'error'
  const [playerDetails, setPlayerDetails] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [maxBid, setMaxBid] = useState(null);

  useEffect(() => {
    const fetchCurrentPlayerAndTournament = async () => {
      try {
        const tourRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
        const tournament = await tourRes.json();
        setTournamentId(tournament.id);

        const res = await fetch(`${API}/api/current-player`);
        const current = await res.json();

        if (!current || !current.secret_bidding_enabled) {
          setPlayerDetails(null);
          return;
        }

        setPlayerId(current.id);
        setPlayerSerial(current.auction_serial);
        setPlayerDetails({
          id: current.id,
          name: current.name,
          role: current.role,
          profile_image: current.profile_image
        });
      } catch (err) {
        console.error("❌ Failed to fetch data:", err);
        setPlayerDetails(null);
      }
    };

    fetchCurrentPlayerAndTournament();
  }, [tournamentSlug]);

  const handleCodeChange = async (code) => {
    setTeamCode(code);

    if (code.length === 5 && tournamentId) {
      try {
        const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
        const data = await res.json();
        const team = data.find(t => t.secret_code === code);
        if (team) {
          setTeamName(team.name);
          setMaxBid(team.max_bid_allowed);
        } else {
          setTeamName('');
          setMaxBid(null);
        }
      } catch (err) {
        console.error("Error fetching team:", err);
        setTeamName('');
        setMaxBid(null);
      }
    } else {
      setTeamName('');
      setMaxBid(null);
    }
  };

  const handleSubmit = async () => {
    setStatus(null);
    setStatusType(null);

    if (!playerSerial || !teamCode || !bidAmount) {
      setStatus("❗ All fields are required.");
      setStatusType("error");
      return;
    }

    // 🛑 Check if current player changed
    try {
      const check = await fetch(`${API}/api/current-player`);
      const latest = await check.json();
      if (latest.auction_serial !== Number(playerSerial)) {
        setStatus("🚫 Player has changed. Please refresh the page.");
        setStatusType("error");
        return;
      }
    } catch (err) {
      console.error("Player revalidation failed:", err);
    }

    try {
      const res = await fetch(`${API}/api/secret-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          player_serial: Number(playerSerial),
          team_code: teamCode.trim(),
          bid_amount: Number(bidAmount)
        })
      });

      const result = await res.json();
      if (res.ok) {
        const now = new Date();
        const time = now.toLocaleTimeString('en-IN', { hour12: false });
        setStatus(`✅ Bid of ₹${bidAmount} submitted successfully at ${time}`);
        setStatusType("success");
      } else {
        setStatus(`❌ ${result.error || "Failed to submit bid."}`);
        setStatusType("error");
      }
    } catch (err) {
      console.error("Error submitting bid:", err);
      setStatus("❌ Server error. Try again later.");
      setStatusType("error");
    }
  };

  if (!playerDetails) {
    return (
      <div 
      className="min-h-screen bg-black text-white flex flex-col items-center justify-center"
      style={{
        backgroundImage: `linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), rgba(255, 215, 0, 0.3)), url("/bg1.jpg")`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        overflowX: 'hidden'
      }}
      >
        <Navbar tournamentSlug={tournamentSlug} />
        <h1 className="text-3xl font-bold text-red-400 mb-4">🚫 No Player Available for Secret Bidding</h1>
        <p className="text-yellow-300">Please wait for the Admin to enable Secret Bidding.</p>
      </div>
    );
  }

  return (
    <div 
    className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12"
    style={{
        backgroundImage: `linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), rgba(255, 215, 0, 0.3)), url("/bg1.jpg")`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        overflowX: 'hidden'
      }}
    >
      <Navbar tournamentSlug={tournamentSlug} />
      <h1 className="text-xl font-bold text-yellow-400 mb-6">PLACE A SECRET BID</h1>

      <div className="flex flex-col items-center mb-6">
        {playerDetails.profile_image && (
          <img
            src={playerDetails.profile_image}
            alt={playerDetails.name}
            className="w-48 h-48 object-cover rounded-xl shadow-lg border-2 border-yellow-400"
          />
        )}
        <h2 className="text-2xl font-bold mt-4 text-white">{playerDetails.name}</h2>
        <p className="text-yellow-300">{playerDetails.role}</p>
      </div>

      <div className="space-y-4 w-full max-w-md">
        <input
          type="number"
          value={playerSerial}
          readOnly
          className="w-full p-3 rounded text-black bg-gray-200 cursor-not-allowed"
        />

        <input
          type="text"
          placeholder="Your 5-digit Secret Team Code"
          value={teamCode}
          maxLength={5}
          onChange={(e) => handleCodeChange(e.target.value)}
          className="w-full p-3 rounded text-black"
        />
        {teamName && <p className="text-sm text-green-400">✅ Team: {teamName}</p>}
        {maxBid !== null && <p className="text-sm text-blue-400">💰 Max Bid Allowed: ₹{maxBid}</p>}

        <input
          type="number"
          placeholder="Secret Bid Amount (₹)"
          value={bidAmount}
          onChange={(e) => setBidAmount(e.target.value)}
          className="w-full p-3 rounded text-black"
        />

        <button
          onClick={handleSubmit}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded font-bold"
        >
          🚀 Submit Secret Bid
        </button>

        {status && (
          <div className={`p-3 rounded text-center font-bold text-sm mt-2 
            ${statusType === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecretBidPage;