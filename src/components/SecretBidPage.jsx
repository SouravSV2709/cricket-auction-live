import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import CONFIG from './config';

const API = CONFIG.API_BASE_URL;

const SecretBidPage = () => {
  const { tournamentSlug } = useParams();
  const [tournamentId, setTournamentId] = useState(null);
  const [playerSerial, setPlayerSerial] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [status, setStatus] = useState(null);
  const [playerDetails, setPlayerDetails] = useState(null);
const [biddingAllowed, setBiddingAllowed] = useState(false);



  useEffect(() => {
  const fetchCurrentPlayerAndTournament = async () => {
    try {
      const tourRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
      const tournament = await tourRes.json();
      setTournamentId(tournament.id);

      const res = await fetch(`${API}/api/current-player`);
      const current = await res.json();

      // If no current player or secret bidding not enabled
      if (!current || !current.secret_bidding_enabled) {
        setPlayerDetails(null);
        return;
      }

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



  const handleSubmit = async () => {
    if (!playerSerial || !teamCode || !bidAmount) {
      setStatus("❗ All fields are required.");
      return;
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
        setStatus("✅ Bid placed successfully!");
      } else {
        setStatus(`❌ ${result.error || "Failed to submit bid."}`);
      }
    } catch (err) {
      console.error("Error submitting bid:", err);
      setStatus("❌ Server error. Try again later.");
    }
  };

  if (!playerDetails) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-3xl font-bold text-red-400 mb-4">🚫 No Player Available for Secret Bidding</h1>
      <p className="text-yellow-300">Please wait for the Admin to enable Secret Bidding.</p>
    </div>
  );
}


return (
  <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-12">
    <h1 className="text-3xl font-bold text-yellow-400 mb-6">🕵️ Secret Bidding</h1>

    <div className="flex flex-col items-center mb-6">
      {playerDetails?.profile_image && (
        <img
          src={playerDetails.profile_image}
          alt={playerDetails.name}
          className="w-48 h-48 object-cover rounded-xl shadow-lg border-2 border-yellow-400"
        />
      )}
      <h2 className="text-2xl font-bold mt-4 text-white">{playerDetails?.name}</h2>
      <p className="text-yellow-300">{playerDetails?.role}</p>
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
        onChange={(e) => setTeamCode(e.target.value)}
        className="w-full p-3 rounded text-black"
      />
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
      {status && <div className="text-sm font-semibold text-center mt-2">{status}</div>}
    </div>
  </div>
);
};

export default SecretBidPage;