import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import Navbar from "../components/Navbar";

const API = CONFIG.API_BASE_URL;

const AllTeamCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);

    useEffect(() => {
          document.title = "Teams | Auction Arena";
        }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const tournamentRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const tournamentData = await tournamentRes.json();
                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
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

    return (
        <div className="min-h-screen text-black bg-gradient-to-br from-yellow-100 to-black relative pb-12">

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
                <h1 className="text-xl font-bold text-center">{tournamentName}</h1>
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
                <div className="text-center text-lg font-bold text-yellow-800 my-2 flex justify-center items-center gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-1">
                {teamPlayers.length === 0 ? (
                    <div className="col-span-full text-center text-sm text-gray-600">No players found for this team.</div>
                ) : (
                    teamPlayers.map(player => (
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
                            <div className="flex justify-center items-center text-black mt-2">
                                <div className="text-black text-lg font-bold mr-5">
                                    {player.auction_serial || "-"}
                                </div>
                                <div className="mt-10">
                                    <img
                                        src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-400,fo-face,z-1`}
                                        alt={player.name}
                                        className="w-20 h-45 object-contain mx-auto rounded-lg"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = "/no-image-found.png";
                                        }}
                                        style={{
                                            WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
                                            maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                                            WebkitMaskSize: "100% 100%",
                                            maskSize: "100% 100%",
                                            WebkitMaskRepeat: "no-repeat",
                                            maskRepeat: "no-repeat",
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="justify-center items-center text-xs text-black font-semibold gap-2 mt-1">
                                <div>🏏Role: {player.role || "-"}</div>
                                <div>📍District: {player.district || "-"}</div>
                                <div>🎉 Sold Amount: ₹{player.sold_price.toLocaleString()}</div>
                            </div>

                            {tournamentLogo && (
                                <div className="flex justify-center items-center gap-2 mt-1 animate-pulse">
                                    <img
                                        src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-40,h-40`}
                                        alt="Tournament Logo"
                                        className="w-14 h-14 object-contain rounded-lg"
                                    />
                                    <img
                                        src="/AuctionArena2.png"
                                        alt="Auction Arena"
                                        className="w-10 h-10 object-contain"
                                    />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <footer className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>
            </div>
        </div>
    );
};

export default AllTeamCards;
