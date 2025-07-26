import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import Navbar from "../components/Navbar";
import BackgroundEffect from "../components/BackgroundEffect";


const API = CONFIG.API_BASE_URL;

const AllTeamCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [playersPerTeam, setPlayersPerTeam] = useState(0);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);

    const fetchPlayersRef = useRef(false);


    useEffect(() => {
        document.title = "Teams | Auction Arena";
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (fetchPlayersRef.current) return; // Skip repeated calls
            fetchPlayersRef.current = true;

            try {
                const tournamentRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const tournamentData = await tournamentRes.json();
                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
                setPlayersPerTeam(tournamentData.players_per_team || 0);
                const tournamentId = tournamentData.id;

                const [playersRes, teamsRes] = await Promise.all([
                    fetch(`${API}/api/players?tournament_id=${tournamentId}`),
                    fetch(`${API}/api/teams?tournament_id=${tournamentId}`)
                ]);
                const playerData = await playersRes.json();
                const teamData = await teamsRes.json();

                const filteredPlayers = playerData.filter(p => p.payment_success && p.deleted_at == null);
                setPlayers(filteredPlayers);
                setTeams(teamData);
                if (teamData.length > 0) setSelectedTeam(teamData[0]);
            } catch (err) {
                console.error("❌ Error loading data:", err);
            }
        };

        fetchData();
    }, [tournamentSlug]);

    const teamPlayers = selectedTeam
        ? players.filter(player => player.team_id === selectedTeam.id)
        : [];

    const placeholdersToShow = Math.max(0, playersPerTeam - teamPlayers.length);

    return (
        // <div className="min-h-screen text-black bg-gradient-to-br from-yellow-100 to-black relative pb-12">

        // <div
        //     className="min-h-screen text-black relative"
        //     style={{
        //         backgroundImage: `linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), rgba(255, 215, 0, 0.3)), url("/bg1.jpg")`,
        //         backgroundSize: 'cover',
        //         backgroundRepeat: 'no-repeat',
        //         backgroundPosition: 'center',
        //         overflowX: 'hidden'
        //     }}
        // >

        <div className="min-h-screen text-black relative overflow-hidden mt-5">
            <BackgroundEffect theme="grid" />
            <div className="relative z-10">
                <Navbar tournamentSlug={tournamentSlug} />

                <Navbar tournamentSlug={tournamentSlug} />
                <div className="pt-16">

                    <div className="flex items-center justify-center mx-8 my-8">
                        {tournamentLogo && (
                            <img
                                src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                                alt="Tournament Logo"
                                className="w-28 h-28 object-contain"
                            />
                        )}
                        <h1 className="text-xl font-bold text-center text-yellow-300">{tournamentName}</h1>
                    </div>

                    {/* Team Selector */}
                    <div className="bg-yellow/80 rounded-lg shadow-md p-4 max-w-5xl mx-auto mb-6 flex flex-wrap justify-center gap-4">
                        <div className="w-64">
                            <Listbox value={selectedTeam} onChange={setSelectedTeam}>
                                <div className="relative">
                                    <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-500 flex items-center gap-2">
                                        {selectedTeam?.logo && (
                                            <img
                                                src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${selectedTeam.logo}`}
                                                alt={selectedTeam.name}
                                                className="w-6 h-6 object-contain"
                                            />
                                        )}
                                        <span className="block truncate">{selectedTeam?.name || "Select Team"}</span>
                                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                                        </span>
                                    </Listbox.Button>

                                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                                        {teams.map((team) => (
                                            <Listbox.Option
                                                key={team.id}
                                                className={({ active }) =>
                                                    clsx("relative cursor-pointer select-none py-2 pl-12 pr-4 flex items-center gap-2", {
                                                        "bg-yellow-100 text-yellow-900": active,
                                                        "text-gray-900": !active,
                                                    })
                                                }
                                                value={team}
                                            >
                                                {({ selected }) => (
                                                    <>
                                                        <img
                                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                                                            alt={team.name}
                                                            className="w-6 h-6 object-contain absolute left-2 top-2"
                                                        />
                                                        <span className={clsx("block truncate", { "font-medium": selected })}>
                                                            {team.name}
                                                        </span>
                                                        {selected && (
                                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-yellow-600">
                                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </Listbox.Option>

                                        ))}
                                    </Listbox.Options>
                                </div>
                            </Listbox>
                        </div>
                    </div>

                    {/* Selected Team Title */}
                    {selectedTeam && (
                        <div className="text-center text-lg font-bold text-yellow-300 my-2 flex justify-center items-center gap-2">
                            {selectedTeam.logo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${selectedTeam.logo}`}
                                    alt={selectedTeam.name}
                                    className="w-10 h-10 object-contain"
                                />
                            )}
                            {selectedTeam.name}
                        </div>
                    )}

                    {/* Player Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-1 px-1">
                        {[...teamPlayers, ...Array(placeholdersToShow).fill(null)].map((player, idx) => (
                            <div
                                key={player ? `player-${player.id}` : `placeholder-${idx}`}
                                onMouseEnter={() => {
                                    if (player && window.innerWidth > 768) {
                                        setSelectedPlayerId((prevId) => (prevId === player.id ? null : player.id));
                                    }
                                }}
                                onClick={() => {
                                    if (player && window.innerWidth <= 768) {
                                        setSelectedPlayerId((prevId) => (prevId === player.id ? null : player.id));
                                    }
                                }}
                                className={`relative rounded-xl text-center font-sans transition-all duration-500 ease-in-out cursor-pointer
                                    ${player && selectedPlayerId === player.id ? "scale-110 z-10" : "scale-95 opacity-80"}
                                `} style={{
                                    backgroundImage: 'url("/goldenbg.png")',
                                    backgroundSize: 'contain',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                    height: '320px'
                                }}
                            >
                                {player ? (
                                    <>
                                        <div className="w-full h-full flex flex-col justify-center items-center scale-[.95] sm:scale-100 transition-transform duration-500 ease-in-out">
                                            <div className="absolute top-12 left-8 sm:top-12 sm:left-10 md:top-12 md:left-12">
                                                <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] sm:text-xs md:text-sm font-bold px-2 py-1 rounded-full shadow-lg tracking-wide">
                                                    #{player.id}
                                                </span>
                                            </div>

                                            <img
                                                src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`}
                                                alt={player.name}
                                                className={`object-contain mx-auto rounded-full ${selectedPlayerId === player.id ? "w-24 h-24 sm:w-24 sm:h-24 md:w-32 md:h-32" : "w-16 h-16 sm:w-16 sm:h-16 md:w-24 md:h-24"}`}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = "/no-image-found.png";
                                                }}
                                            // style={{
                                            //     backgroundImage: 'url("/goldenbg.png")',
                                            //     backgroundSize: 'contain', // better fill
                                            //     backgroundPosition: 'top',
                                            //     backgroundRepeat: 'no-repeat',
                                            //     height: '320px'
                                            // }}

                                            />

                                            <div className="text-xs items-center justify-center font-bold text-black uppercase mt-1">
                                                {player.name}
                                            </div>

                                            {/* <div className="flex flex-col items-center justify-end text-xs font-semibold text-black text-center leading-tight"> */}
                                            <div className={`text-xs font-bold ${selectedPlayerId === player.id ? "text-black" : "text-gray-700"}`}>
                                                <div>Role: {player.role || "-"}</div>
                                                <div>District: {player.district || "-"}</div>
                                                <div>🎉 ₹{player.sold_price.toLocaleString()}</div>
                                            </div>

                                            {tournamentLogo && (
                                                <div className="flex justify-center items-center gap-1 mt-1 animate-pulse">
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-24,h-24`}
                                                        alt="Tournament Logo"
                                                        className="w-8 h-8 object-contain rounded"
                                                    />
                                                    <img
                                                        src="/AuctionArena2.png"
                                                        alt="Auction Arena"
                                                        className="w-6 h-6 object-contain"
                                                    />
                                                </div>
                                            )}
                                            {/* </div> */}
                                        </div>

                                    </>
                                ) : (
                                    <div className="flex flex-col justify-center items-center text-yellow-900 font-semibold h-full opacity-50 pt-28">
                                        <span>Player Slot</span>
                                        <span>Not Filled</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>


                    {/* Footer */}
                    <footer className="bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
                        🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default AllTeamCards;
