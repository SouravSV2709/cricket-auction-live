import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import THEMES from '../components/themes';

const API = CONFIG.API_BASE_URL;


const AllPlayerCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [theme, setTheme] = useState('default');
    const [tournamentLogo, setTournamentLogo] = useState(null);


    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const tournamentRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const tournamentData = await tournamentRes.json();
                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo); // Add this new state
                const tournamentId = tournamentData.id;

                const playerRes = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
                const playerData = await playerRes.json();
                const filteredPlayers = playerData.filter(p => p.payment_success === true && p.deleted_at == null);
                setPlayers(filteredPlayers);
            } catch (err) {
                console.error("❌ Error loading players:", err);
            }
        };

        fetchPlayers();
    }, [tournamentSlug]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-black to-purple-900 text-white p-2">
            <h1 className="text-2xl font-bold text-center mb-6">🏏 {tournamentName} – Player Cards</h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 justify-center">
                {players.map(player => (
                    <div
                        key={player.id}
                        className="relative bg-yellow-300 rounded-xl shadow-lg p-3 text-center font-sans"
                        style={{
                            backgroundImage: 'linear-gradient(145deg,rgb(201, 123, 230), #f9e7b6)',
                            clipPath: 'polygon(0 5%, 5% 0, 95% 0, 100% 5%, 100% 95%, 95% 100%, 5% 100%, 0 95%)',
                            height: '360px', // or as needed
                        }}
                    >
                        {/* Auction Serial + Role */}
                        <div className="absolute top-3 left-3 text-left text-black">
                            <div className="text-2xl font-extrabold">{player.auction_serial || "--"}</div>
                        </div>

                        {/* Player Image */}
                        <div className="mt-4">
                            <img
                                src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`}
                                alt={player.name}
                                className="w-32 h-40 object-cover mx-auto rounded-lg"
                            />
                        </div>

                        {/* Player Name */}
                        <div className="mt-2 text-lg font-bold text-black uppercase">
                            {player.name}
                        </div>
                        <div className="text-xsm text-black">({player.nickname || "-"})</div>

                        {/* Nickname | Role | District */}
                        <div className="flex justify-center items-center text-xs text-black font-semibold gap-2 mt-1">
                            <div>🏏 {player.role || "-"}</div>
                            <div>📍 {player.district || "-"}</div>
                        </div>

                        {/* Tournament Logo */}
                        {tournamentLogo && (
                            <div className="flex justify-center items-center gap-2 mt-3">
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-40,h-40`}
                                    alt="Tournament Logo"
                                    className="w-10 h-10 object-contain rounded-lg"
                                />
                                <img
                                    src="/AuctionArena2.png"
                                    alt="Auction Arena"
                                    className="w-10 h-10 object-contain"
                                />
                            </div>
                        )}

                    </div>

                ))}
            </div>
        </div>
    );
};

export default AllPlayerCards;
