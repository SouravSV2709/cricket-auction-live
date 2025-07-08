// AllPlayerCards.jsx with golden background masking, responsive virtual list, and styled filters

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import Navbar from "../components/Navbar";
import { FixedSizeGrid as Grid } from "react-window";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";

const API = CONFIG.API_BASE_URL;

const AllPlayerCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const [filterSerial, setFilterSerial] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");

    useEffect(() => {
        document.title = "Players | Auction Arena";
    }, []);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const tournamentRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const tournamentData = await tournamentRes.json();
                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
                const tournamentId = tournamentData.id;

                const playerRes = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
                const playerData = await playerRes.json();
                const filteredPlayers = playerData.filter(
                    (p) => p.payment_success === true && p.deleted_at == null
                );
                setPlayers(filteredPlayers);
            } catch (err) {
                console.error("❌ Error loading players:", err);
            }
        };
        fetchPlayers();
    }, [tournamentSlug]);

    const getColumnCount = () => {
        if (windowWidth < 640) return 2;
        if (windowWidth < 768) return 3;
        if (windowWidth < 1024) return 4;
        if (windowWidth < 1280) return 5;
        return 7;
    };

    const uniqueRoles = [...new Set(players.map((p) => p.role).filter(Boolean))];
    const uniqueDistricts = [...new Set(players.map((p) => p.district).filter(Boolean))];

    const filteredPlayers = players.filter(
        (player) =>
            player.name.toLowerCase().includes(filterName.toLowerCase()) &&
            player.role.toLowerCase().includes(filterRole.toLowerCase()) &&
            player.district.toLowerCase().includes(filterDistrict.toLowerCase()) &&
            player.id.toString().includes(filterSerial)
    );

    const columnCount = getColumnCount();
    const rowCount = Math.ceil(filteredPlayers.length / columnCount);
    const columnWidth = windowWidth / columnCount;

    const PlayerCard = ({ player, style }) => (
        <div
            key={player.id}
            style={{
                ...style,
                // padding: "0.25rem",
                backgroundImage: 'url("/goldenbg.png")',
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                height: "320px",
                WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat"
            }}
            onMouseEnter={() => {
                if (window.innerWidth > 768) setSelectedPlayerId(player.id);
            }}
            onClick={() => {
                if (window.innerWidth <= 768) {
                    setSelectedPlayerId((prevId) => (prevId === player.id ? null : player.id));
                }
            }}
            className={`relative rounded-xl text-center font-sans transition-all duration-500 ease-in-out cursor-pointer ${selectedPlayerId === player.id ? "scale-110 z-10" : "scale-95 opacity-80"
                }`}
        >
            <div className="w-full h-full flex flex-col justify-center items-center scale-[.95] sm:scale-100">
                <div className="absolute top-12 left-8 sm:top-12 sm:left-10 md:top-12 md:left-12">
                    <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] sm:text-xs md:text-sm font-bold px-2 py-1 rounded-full shadow-lg tracking-wide">
                        #{player.id}
                    </span>
                </div>
                <img
                    loading="lazy"
                    src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`}
                    alt={player.name}
                    className={`object-contain mx-auto rounded-full ${selectedPlayerId === player.id
                            ? "w-24 h-24 sm:w-24 sm:h-24 md:w-32 md:h-32"
                            : "w-16 h-16 sm:w-16 sm:h-16 md:w-24 md:h-24"
                        }`}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/no-image-found.png";
                    }}
                />
                <div className="text-xs font-bold text-black uppercase mt-1">{player.name}</div>
                <div className={`text-xs font-bold ${selectedPlayerId === player.id ? "text-black" : "text-gray-700"}`}>
                    <div>Role: {player.role || "-"}</div>
                    <div>District: {player.district || "-"}</div>
                </div>
                {tournamentLogo && (
                    <div className="flex justify-center items-center gap-1 animate-pulse">
                        <img
                            loading="lazy"
                            src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-40,h-40`}
                            alt="Tournament Logo"
                            className="w-14 h-14 object-contain rounded-lg"
                        />
                        <img
                            loading="lazy"
                            src="/AuctionArena2.png"
                            alt="Auction Arena"
                            className="w-10 h-10 object-contain"
                        />
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen text-black bg-gradient-to-br from-yellow-100 to-black relative pb-12">
            <Navbar tournamentSlug={tournamentSlug} />
            <div className="pt-8">
                <div className="flex items-center justify-center my-8">
                    {tournamentLogo && (
                        <img
                            src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                            alt="Tournament Logo"
                            className="w-40 h-40 object-contain animate-pulse"
                            loading="lazy"
                        />
                    )}
                    <h1 className="text-xl font-bold text-center">{tournamentName}</h1>
                </div>

                <div className="bg-yellow/80 rounded-lg shadow-md p-4 max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 sm:gap-4">
                    <input
                        type="number"
                        placeholder="Filter by Serial Number"
                        value={filterSerial}
                        onChange={(e) => setFilterSerial(e.target.value)}
                        className="p-2 rounded-md border w-full sm:w-48"
                    />
                    <input
                        type="text"
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                        placeholder="Filter by name"
                        className="p-2 rounded-md border w-full sm:w-48"
                    />

                    <Listbox value={filterRole} onChange={setFilterRole}>
                        <div className="relative w-60">
                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                <span className="block truncate">{filterRole || "All Roles"}</span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                <Listbox.Option key="" value="">
                                    {({ active }) => (
                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>All Roles</li>
                                    )}
                                </Listbox.Option>
                                {uniqueRoles.map((role, idx) => (
                                    <Listbox.Option key={idx} value={role}>
                                        {({ selected, active }) => (
                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                {role}
                                            </li>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </div>
                    </Listbox>

                    <Listbox value={filterDistrict} onChange={setFilterDistrict}>
                        <div className="relative w-60">
                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                <span className="block truncate">{filterDistrict || "All Districts"}</span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                <Listbox.Option key="" value="">
                                    {({ active }) => (
                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>All Districts</li>
                                    )}
                                </Listbox.Option>
                                {uniqueDistricts.map((district, idx) => (
                                    <Listbox.Option key={idx} value={district}>
                                        {({ selected, active }) => (
                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                {district}
                                            </li>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </div>
                    </Listbox>

                    <button
                        onClick={() => {
                            setFilterSerial("");
                            setFilterName("");
                            setFilterRole("");
                            setFilterDistrict("");
                        }}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition w-full sm:w-auto"
                    >
                        Clear Filters
                    </button>
                </div>

                <Grid
                    columnCount={columnCount}
                    columnWidth={columnWidth}
  height={window.innerHeight - 300} // or use a state that updates on resize
                    rowCount={rowCount}
                    rowHeight={340}
                    width={windowWidth - 20}
                >
                    {({ columnIndex, rowIndex, style }) => {
                        const index = rowIndex * columnCount + columnIndex;
                        const player = filteredPlayers[index];
                        return player ? <PlayerCard key={player.id} player={player} style={style} /> : null;
                    }}
                </Grid>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        </div>
    );
};

export default AllPlayerCards;
