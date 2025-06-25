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
    const [filterSerial, setFilterSerial] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");




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

    const uniqueRoles = [...new Set(players.map(p => p.role).filter(Boolean))];
    const uniqueDistricts = [...new Set(players.map(p => p.district).filter(Boolean))];


    return (
        <div className="min-h-screen text-black bg-gradient-to-br from-yellow-100 to-black relative">
            <div className="absolute top-2 right-2 z-50 mb-4">
                <img
                    src="/AuctionArena2.png"
                    alt="Auction Arena"
                    className="w-12 h-12 object-contain"
                />
            </div>

            <div className="flex items-center justify-center mb-4 mt-4 gap-1">
                {tournamentLogo && (
                    <img
                        src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                        alt="Tournament Logo"
                        className="w-40 h-40 object-contain"
                    />
                )}
                <h1 className="text-xl font-bold text-center">
                    {tournamentName}
                </h1>
            </div>


            {/* 🔍 Filter Section */}
<div className="bg-yellow/80 rounded-lg shadow-md p-4 max-w-5xl mx-auto mb-6 flex flex-wrap justify-center gap-4">
                <input
                    type="text"
                    placeholder="Filter by Serial Number"
                    value={filterSerial}
                    onChange={(e) => setFilterSerial(e.target.value)}
                    className="p-2 rounded-md border w-60"
                />
                <input
                    type="text"
                    placeholder="Filter by Name"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="p-2 rounded-md border w-60"
                />
                <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="p-2 rounded-md border w-60"
                >
                    <option value="">All Roles</option>
                    {uniqueRoles.map((role, idx) => (
                        <option key={idx} value={role}>
                            {role}
                        </option>
                    ))}
                </select>
                <select
                    value={filterDistrict}
                    onChange={(e) => setFilterDistrict(e.target.value)}
                    className="p-2 rounded-md border w-60"
                >
                    <option value="">All Districts</option>
                    {uniqueDistricts.map((district, idx) => (
                        <option key={idx} value={district}>
                            {district}
                        </option>
                    ))}
                </select>
                <button
    onClick={() => {
        setFilterSerial("");
        setFilterName("");
        setFilterRole("");
        setFilterDistrict("");
    }}
    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
>
    Clear Filters
</button>
            </div>


            {/* 🧾 Player Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-1 bg-transparent break-inside-avoid">
                {players
                    .filter((player) =>
                        (filterSerial === "" || player.auction_serial?.toString().includes(filterSerial)) &&
                        (filterName === "" || player.name.toLowerCase().includes(filterName.toLowerCase())) &&
                        (filterRole === "" || player.role?.toLowerCase().includes(filterRole.toLowerCase())) &&
                        (filterDistrict === "" || player.district?.toLowerCase() === filterDistrict.toLowerCase())

                    )
                    .map((player) => (
                        <div
                            key={player.id}
    className="relative rounded-xl text-center font-sans transform transition duration-300 hover:scale-105 hover:shadow-2xl hover:ring-2 hover:ring-yellow-300 animate-fade-in"
                            style={{
                                backgroundImage: 'url("/goldenbg.png")',
                                backgroundSize: 'contain',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                height: '360px'
                            }}
                        >
                            <div className="flex justify-center items-center text-black">
                                <div className="text-black text-lg font-bold mr-5">
                                    {player.auction_serial || "-"}
                                </div>
                                <div className="mt-10">
                                    <img
                                        src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`}
                                        alt={player.name}
                                        className="w-20 h-32 object-contain mx-auto rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="text-xs items-center justify-center font-bold text-black uppercase">
                                {player.name}
                            </div>

                            <div className="justify-center items-center text-xs text-black font-semibold gap-2 mt-1">
                                <div>🏏Role: {player.role || "-"}</div>
                                <div>📍District: {player.district || "-"}</div>
                            </div>

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
                                        className="w-7 h-7 object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
            </div>
            {/* LIVE AUCTION FOOTER */}
                <div className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse absolute bottom-0 w-full py-1">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </div>
        </div>
    );

};

export default AllPlayerCards;
