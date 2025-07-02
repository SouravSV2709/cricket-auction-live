import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";
import THEMES from "../components/themes";
import { Listbox } from "@headlessui/react";
import { Fragment } from "react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";
import Navbar from "../components/Navbar";

const API = CONFIG.API_BASE_URL;

const AllPlayerCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [theme, setTheme] = useState("default");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [filterSerial, setFilterSerial] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");

    useEffect(() => {
          document.title = "Players | Auction Arena";
        }, []);

    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const tournamentRes = await fetch(
                    `${API}/api/tournaments/slug/${tournamentSlug}`
                );
                const tournamentData = await tournamentRes.json();
                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
                const tournamentId = tournamentData.id;

                const playerRes = await fetch(
                    `${API}/api/players?tournament_id=${tournamentId}`
                );
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

    const uniqueRoles = [...new Set(players.map((p) => p.role).filter(Boolean))];
    const uniqueDistricts = [
        ...new Set(players.map((p) => p.district).filter(Boolean)),
    ];

    return (
        <div className="min-h-screen text-black bg-gradient-to-br from-yellow-100 to-black relative pb-12">
            <Navbar tournamentSlug={tournamentSlug} />
            <div className="pt-16">
                <div className="flex items-center justify-center my-8">
                    {tournamentLogo && (
                        <img
                            src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                            alt="Tournament Logo"
                            className="w-40 h-40 object-contain animate-pulse"
                        />
                    )}
                    <h1 className="text-xl font-bold text-center">{tournamentName}</h1>
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

                    {/* Role Dropdown */}
                    <Listbox value={filterRole} onChange={setFilterRole}>
                        <div className="relative w-60">
                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                <span className="block truncate">
                                    {filterRole || "All Roles"}
                                </span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                <Listbox.Option key="" value="">
                                    {({ active }) => (
                                        <li
                                            className={`${active ? "bg-yellow-100" : ""
                                                } cursor-default select-none py-2 px-4`}
                                        >
                                            All Roles
                                        </li>
                                    )}
                                </Listbox.Option>
                                {uniqueRoles.map((role, idx) => (
                                    <Listbox.Option key={idx} value={role}>
                                        {({ selected, active }) => (
                                            <li
                                                className={`${active ? "bg-yellow-100" : ""
                                                    } cursor-default select-none py-2 px-4`}
                                            >
                                                {selected && (
                                                    <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />
                                                )}
                                                {role}
                                            </li>
                                        )}
                                    </Listbox.Option>
                                ))}
                            </Listbox.Options>
                        </div>
                    </Listbox>

                    {/* District Dropdown */}
                    <Listbox value={filterDistrict} onChange={setFilterDistrict}>
                        <div className="relative w-60">
                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                <span className="block truncate">
                                    {filterDistrict || "All Districts"}
                                </span>
                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                </span>
                            </Listbox.Button>
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                <Listbox.Option key="" value="">
                                    {({ active }) => (
                                        <li
                                            className={`${active ? "bg-yellow-100" : ""
                                                } cursor-default select-none py-2 px-4`}
                                        >
                                            All Districts
                                        </li>
                                    )}
                                </Listbox.Option>
                                {uniqueDistricts.map((district, idx) => (
                                    <Listbox.Option key={idx} value={district}>
                                        {({ selected, active }) => (
                                            <li
                                                className={`${active ? "bg-yellow-100" : ""
                                                    } cursor-default select-none py-2 px-4`}
                                            >
                                                {selected && (
                                                    <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />
                                                )}
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
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                    >
                        Clear Filters
                    </button>
                </div>

                <div className="text-center text-bold text-sm text-gray-800 font-medium mb-2">
                    Count:{" "}
                    {
                        players.filter(
                            (player) =>
                                (filterSerial === "" ||
                                    player.auction_serial
                                        ?.toString()
                                        .includes(filterSerial)) &&
                                (filterName === "" ||
                                    player.name.toLowerCase().includes(filterName.toLowerCase())) &&
                                (filterRole === "" ||
                                    player.role?.toLowerCase().includes(filterRole.toLowerCase())) &&
                                (filterDistrict === "" ||
                                    player.district?.toLowerCase() === filterDistrict.toLowerCase())
                        ).length
                    }{" "}
                    players
                </div>

                {/* 🧾 Player Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-1 bg-transparent break-inside-avoid">
                    {players
                        .filter(
                            (player) =>
                                (filterSerial === "" ||
                                    player.auction_serial
                                        ?.toString()
                                        .includes(filterSerial)) &&
                                (filterName === "" ||
                                    player.name.toLowerCase().includes(filterName.toLowerCase())) &&
                                (filterRole === "" ||
                                    player.role?.toLowerCase().includes(filterRole.toLowerCase())) &&
                                (filterDistrict === "" ||
                                    player.district?.toLowerCase() === filterDistrict.toLowerCase())
                        )
                        .map((player) => (
                            <div
                                key={player.id}
                                className="relative rounded-xl text-center font-sans transform transition duration-300 hover:scale-105 hover:shadow-2xl hover:ring-2 hover:ring-yellow-300 animate-fade-in"
                                style={{
                                    backgroundImage: 'url("/goldenbg.png")',
                                    backgroundSize: "contain",
                                    backgroundPosition: "center",
                                    backgroundRepeat: "no-repeat",
                                    height: "360px",
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
                                                WebkitMaskImage:
                                                    "linear-gradient(to bottom, black 60%, transparent 100%)",
                                                maskImage:
                                                    "linear-gradient(to bottom, black 80%, transparent 100%)",
                                                WebkitMaskSize: "100% 100%",
                                                maskSize: "100% 100%",
                                                WebkitMaskRepeat: "no-repeat",
                                                maskRepeat: "no-repeat",
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="text-xs items-center justify-center font-bold text-black uppercase mt-3">
                                    {player.name}
                                </div>

                                <div className="justify-center items-center text-xs text-black font-semibold gap-2 mt-1">
                                    <div>🏏Role: {player.role || "-"}</div>
                                    <div>📍District: {player.district || "-"}</div>
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
                        ))}
                </div>

                {/* Footer */}
                <footer className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>
            </div>
        </div>
    );
};

export default AllPlayerCards;
