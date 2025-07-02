import React, { useEffect, useState } from "react";
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

    useEffect(() => {
        const fetchTournament = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();
                setTournamentName(data.title || tournamentSlug);
                setTournamentLogo(data.logo);
            } catch (err) {
                console.error("❌ Failed to load tournament:", err);
            }
        };

        fetchTournament();
    }, [tournamentSlug]);

    useEffect(() => {
        const fetchTournament = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();
                setTournamentName(data.title || tournamentSlug);
                setTournamentLogo(data.logo);
                setTotalPlayersToBuy(data.total_players_to_buy || 14); // fallback default
                const tournamentId = data.id;

                const [teamRes, playerRes] = await Promise.all([
                    fetch(`${API}/api/teams?tournament_id=${tournamentId}`),
                    fetch(`${API}/api/players?tournament_id=${tournamentId}`)
                ]);

                const teamData = await teamRes.json();
                const playerData = await playerRes.json();

                // Filter only sold players
                const soldPlayers = playerData.filter(p => p.sold_status === true || p.sold_status === "TRUE");

                setPlayers(soldPlayers);
                setTeams(teamData);
            } catch (err) {
                console.error("❌ Failed to load dashboard data:", err);
            }
        };

        fetchTournament();
    }, [tournamentSlug]);


    return (
        <div className="min-h-full bg-gradient-to-br from-yellow-100 to-black text-black pt-16 pb-0">
            <Navbar tournamentSlug={tournamentSlug} />

            <div className="flex items-center justify-center mt-1">
                {tournamentLogo && (
                    <img
                        src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                        alt="Tournament Logo"
                        className="w-36 h-36 object-contain animate-pulse"
                    />
                )}
                <h1 className="text-2xl font-bold my-2 text-center">{tournamentName}</h1>
            </div>

            <div className="p-1 mt-1 rounded-xl overflow-hidden shadow-2xl border border-yellow-300">
                <table className="w-full text-sm table-auto bg-white">
                    <thead className="bg-gradient-to-r from-yellow-300 to-orange-400 text-black text-xs uppercase tracking-wide text-center text-wrap justify-center">
                        <tr>
                            <th>Team</th>
                            <th>💰 Purse</th>
                            <th>🚀 Max Bid</th>
                            <th>🎯 Slots</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((team, idx) => {
                            const teamPlayers = players.filter(p => Number(p.team_id) === Number(team.id));
                            const totalSpent = teamPlayers.reduce((sum, p) => sum + (p.sold_price || 0), 0);
                            const remainingPurse = (team.budget || 0) - totalSpent;
                            const playersBought = team.bought_count || 0;
                            const playersLeftToBuy = (totalPlayersToBuy || 14) - playersBought;

                            return (
                                <tr key={team.id} className="odd:bg-white even:bg-yellow-50 hover:bg-yellow-100 transition">
                                    <td className="py-2 px-4 flex items-center gap-2 font-semibold text-gray-900">
                                        <img
                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                                            alt={team.name}
                                            className="w-6 h-6 object-contain rounded-full border border-gray-300"
                                        />
                                        {team.name}
                                    </td>
                                    <td className="py-2 px-4 text-gray-800">₹{remainingPurse.toLocaleString()}</td>
                                    <td className="py-2 px-4 text-gray-800">₹{(team.max_bid_allowed || 0).toLocaleString()}</td>
                                    <td className="py-2 px-4 text-gray-800">{playersLeftToBuy}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <footer className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>
        </div>


    );
};

export default TournamentDashboard;
