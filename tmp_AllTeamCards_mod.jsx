import React, { useEffect, useState, useRef , useMemo} from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import Navbar from "../components/Navbar";
// import BackgroundEffect from "../components/BackgroundEffect";`nimport * as XLSX from "xlsx";`nimport { getTeamPosterExporter } from "../utils/teamPosters";


const API = CONFIG.API_BASE_URL;

// Brand gradient background (EAARENA)
const EA_BG_STYLE = {
    backgroundImage: `
    radial-gradient(1100px 600px at 0% 0%, rgba(250, 204, 21, .15), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(59, 130, 246, .16), transparent 60%),
    linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
  `
};


const AllTeamCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [playersPerTeam, setPlayersPerTeam] = useState(0);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [viewMode, setViewMode] = useState("card"); // or "list"
    const [openImage, setOpenImage] = useState(null);


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
                console.error("G¥î Error loading data:", err);
            }
        };

        fetchData();
    }, [tournamentSlug]);

    const teamPlayers = selectedTeam
        ? players.filter(player => player.team_id === selectedTeam.id)
        : [];

    const placeholdersToShow = Math.max(0, playersPerTeam - teamPlayers.length);

    const exportToExcel = () => {
    const teamName = selectedTeam?.name || "Team";

    // Collect all fields that might be useful
    const allFields = {
        Name: (p) => p.name,
        Role: (p) => p.role,
        "Kit Size": (p) => p.jersey_size || p.pant_size ? `${p.jersey_size || "-"} / ${p.pant_size || "-"}` : null,
        Mobile: (p) => p.mobile,
        "Sold Amount": (p) => p.sold_price != null ? p.sold_price : null,
        Nickname: (p) => p.nickname,
        District: (p) => p.district,
    };

    // Determine all fields that are actually used (have at least one value)
    const usedFields = Object.entries(allFields).filter(([label, getter]) =>
        teamPlayers.some(player => getter(player))
    );

    const data = teamPlayers
        .sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0))
        .map((player, idx) => {
            const row = { "#": idx + 1 };
            usedFields.forEach(([label, getter]) => {
                const value = getter(player);
                if (value !== null && value !== undefined) {
                    row[label] = value;
                }
            });
            return row;
        });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Players");

    XLSX.writeFile(workbook, `${teamName}-Players.xlsx`);
};



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

        <div className="min-h-screen text-black relative overflow-x-hidden mt-5 flex flex-col" style={EA_BG_STYLE}>
            <div className="relative flex-1">
                <Navbar tournamentSlug={tournamentSlug} />

                <div className="pt-16">

                    <div className="flex items-center justify-center mx-8 my-8">
                        {tournamentLogo && (
                            <img
                                src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}`}
                                alt="Tournament Logo"
                                className="w-28 h-28 object-contain"
                            />
                        )}
                        <h1 className="text-xl font-bold text-center text-yellow-300">{tournamentName}</h1>
                    </div>

                    {/* Team Selector */}
                    <div className="bg-yellow/80 rounded-lg shadow-md p-4 max-w-5xl mx-auto mb-6 flex flex-wrap justify-center gap-4">
                        <div className="w-64">
                            <h1 className="text-yellow-300 font-bold my-3">Select a Team</h1>
                            <Listbox value={selectedTeam} onChange={setSelectedTeam}>
                                <div className="relative">
                                    <Listbox.Button className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left border border-gray-300 shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-500 flex items-center gap-2">
                                        {selectedTeam?.logo && (
                                            <img
                                                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${selectedTeam.logo}`}
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
                                                            src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
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

                    <div className="flex flex-row justify-center items-center text-center my-4 mx-4">
                        <button
                            onClick={() => setViewMode(viewMode === "card" ? "list" : "card")}
                            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-4 rounded"
                        >
                            Switch to {viewMode === "card" ? "Detailed View" : "Card View"}
                        </button>
                        <button
                            onClick={exportToExcel}
                            className="bg-green-600 hover:bg-green-700 text-black font-bold py-2 px-4 rounded ml-3"
                        >
                            =ƒôÑ Download Excel
                        </button>
                    </div>




                    {/* Selected Team Title */}
                    {selectedTeam && (
                        <div className="text-center text-lg font-bold text-yellow-300 my-2 flex justify-center items-center gap-2">
                            {selectedTeam.logo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${selectedTeam.logo}`}
                                    alt={selectedTeam.name}
                                    className="w-10 h-10 object-contain"
                                />
                            )}
                            {selectedTeam.name}
                        </div>
                    )}

                    {/* Player Cards */}
                    {viewMode === "card" ? (
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4 px-3">
                            {[...teamPlayers, ...Array(placeholdersToShow).fill(null)].map((player, idx) => (
                                <div key={player ? `player-${player.id}` : `placeholder-${idx}`} className="aspect-[1/2] w-full max-w-[220px] mx-auto m-2">
                                    {player ? (
                                        <div className="player-card relative h-full rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/10 bg-white/5 backdrop-blur-[1px] transition-transform duration-300 ease-out cursor-pointer hover:scale-105">
                                            {/* TOP: full image on red background */}
                                            {/* TOP: image section with red bg + watermark + serial + player image */}
                                            <div
                                                className="relative h-[72%] bg-center bg-cover"
                                                style={{ backgroundImage: "url('/goldbg.jpg')" }}
                                            >
                                                {/* Dark overlay to dim the red background */}
                                                <div className="absolute inset-0 bg-black/40 z-0" />

                                                {/* EAARENA Logo watermark */}
                                                <img
                                                    src="/AuctionArena2.png"
                                                    alt="EAARENA Logo"
                                                    className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none z-10"
                                                />

                                                {/* Serial pill */}
                                                <span className="absolute top-2 left-2 inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow z-30">
                                                    #{player?.auction_serial ?? idx + 1}
                                                </span>

                                                {/* Player image */}
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-900,q-85,e-sharpen,f-webp`}
                                                    alt={player.name}
                                                    className="absolute inset-0 w-full h-full object-cover object-[center_22%] md:object-[center_15%] drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] pointer-events-auto cursor-zoom-in z-20"
                                                    onClick={() =>
                                                        setOpenImage(
                                                            `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-1600,q-95`
                                                        )
                                                    }
                                                    onError={(e) => {
                                                        e.currentTarget.src = "/no-image-found.png";
                                                    }}
                                                />

                                                {/* scrim for gradient fade */}
                                                <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-transparent z-30" />
                                            </div>


                                            {/* BOTTOM: classy info panel (same as PlayerCard) */}
                                            <div className="relative h-[34%] bg-white/10 backdrop-blur-md border-t border-yellow-400/40 px-3 pt-3 pb-2 rounded-b-2xl max-h-[180px] overflow-y-auto">
                                                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500"></div>

                                                <div className="text-[13px] sm:text-sm font-bold text-yellow-300 leading-[1.25] truncate drop-shadow">
                                                    {player.name}
                                                    {player.nickname && (
                                                        <div>
                                                            {/* <span className="uppercase tracking-wide text-gray-400 text-[10px]">Nickname</span> */}
                                                            <div className="font-semibold text-white">{player.nickname}</div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-200 px-2">
                                                    <div>
                                                        {/* <span className="uppercase tracking-wide text-gray-400 text-[10px]">Role</span> */}
                                                        <div className="font-semibold text-white">{player.role || "-"}</div>
                                                    </div>
                                                    {player.district && (
                                                    <div>
                                                        {/* <span className="uppercase tracking-wide text-gray-400 text-[10px]">District</span> */}
                                                        <div className="font-semibold text-white">{player.district || "-"}</div>
                                                    </div>
                                                    )}
                                                    <div>
                                                        {/* <span className="uppercase tracking-wide text-gray-400 text-[10px]">Sold Price</span> */}
                                                        <div className="font-semibold text-white">Gé¦{player.sold_price?.toLocaleString() || "0"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                                className="relative h-[72%] bg-center bg-cover"
                                                style={{ backgroundImage: "url('/goldbg.jpg')" }}
                                            >
                                        <div className="flex h-full flex-col justify-center items-center text-yellow-900 font-semibold opacity-50 rounded-2xl ring-1 ring-white/10 bg-white/5">
                                            <img
                                            src="/AuctionArena2.png"
                                            alt="EAARENA Logo"
                                            className="relative inset-0 w-full h-auto object-contain opacity-80 pointer-events-none z-10 mt-20"
                                            />
                                            <span>Empty Slot</span>
                                        </div>
                                    
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                    ) : (

                        <div className="max-w-5xl mx-auto bg-white/80 rounded-lg shadow p-4 overflow-x-auto">
                            <table className="table-auto w-full text-sm text-left border border-gray-300 break-words">
                                <thead>
                                    <tr className="bg-yellow-200 text-black font-bold text-center">
                                        <th className="px-2 py-2 border whitespace-normal break-words">#</th>
                                        <th className="px-2 py-2 border whitespace-normal break-words">Name</th>
                                        <th className="px-2 py-2 border whitespace-normal break-words">Role</th>
                                        <th className="px-2 py-2 border whitespace-normal break-words w-[80px] max-w-[100px]">Kit Size<br />(Jersey / Pant)</th>
                                        <th className="px-2 py-2 border whitespace-normal break-words w-[80px] max-w-[100px]">Mobile</th>
                                        <th className="px-2 py-2 border whitespace-normal break-words">Sold<br />Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...teamPlayers]
                                        .sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0))
                                        .map((player, idx) => (
                                            <tr key={player.id} className="bg-white even:bg-gray-50">
                                                <td className="border px-2 py-1">{idx + 1}</td>
                                                <td className="border px-2 py-1">{player.name} ({player.nickname})</td>
                                                <td className="border px-2 py-1 text-center">{player.role}</td>
                                                <td className="border px-2 py-1">
                                                    {player.jersey_size || "-"} / {player.pant_size || "-"}
                                                </td>
                                                <td className="border px-2 py-1">{player.mobile || "-"}</td>
                                                <td className="border px-2 py-1 text-center">Gé¦{player.sold_price?.toLocaleString() || "0"}</td>
                                            </tr>
                                        ))}
                                    {Array(placeholdersToShow).fill(null).map((_, idx) => (
                                        <tr key={`placeholder-${idx}`} className="text-gray-400 italic">
                                            <td className="border px-2 py-1">-</td>
                                            <td className="border px-2 py-1" colSpan={6}>Empty Player Slot</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    )}

                    {openImage && (
                        <div
                            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999]"
                            onClick={() => setOpenImage(null)}
                        >
                            {/* EAARENA watermark background */}
                            <img
                                src="/AuctionArena2.png"
                                alt="EA ARENA Logo"
                                className="absolute inset-0 w-full h-full object-contain opacity-10 pointer-events-none"
                            />

                            {/* Player full image */}
                            <img
                                src={openImage}
                                alt="Full View"
                                className="relative max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl border-2 border-yellow-400 z-10"
                                onClick={(e) => e.stopPropagation()}
                            />

                            {/* Close button */}
                            <button
                                className="absolute top-6 right-6 text-white text-3xl font-bold hover:text-yellow-300 z-20"
                                onClick={() => setOpenImage(null)}
                            >
                                G£ò
                            </button>
                        </div>
                    )}





                    {/* Footer */}
                    <footer className="bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
                        =ƒö¦ All rights reserved | Powered by Auction Arena | +91-9547652702 =ƒº¿
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default AllTeamCards;

