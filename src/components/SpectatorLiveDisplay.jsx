import React, { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";
import { useParams } from "react-router-dom";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import PlayerTransitionLoader from "../components/PlayerTransitionLoader";
import { io } from "socket.io-client";
import BackgroundEffect from "../components/BackgroundEffect";


const API = CONFIG.API_BASE_URL;

let currentSoldAudio = null;

const soldAudioFiles = [
    '/sounds/clapping.wav',
    '/sounds/bbpl1.wav',
    '/sounds/bbpl2.wav',
    '/sounds/bbpl3.wav'
];

const getRandomSoldAudio = () => {
    const index = Math.floor(Math.random() * soldAudioFiles.length);
    return soldAudioFiles[index];
};

const unsoldMedia = [
    '/sounds/unsold1207.gif',
    '/sounds/unsold2.gif',
    '/sounds/unsold3.gif'
];

const unsoldAudio = new Audio('/sounds/unsold4.mp3');


const SpectatorLiveDisplay = () => {
    const [player, setPlayer] = useState(null);
    const [teamSummaries, setTeamSummaries] = useState([]);
    const { width, height } = useWindowSize();
    const [customMessage, setCustomMessage] = useState(null);
    const [teamIdToShow, setTeamIdToShow] = useState(null);
    const [playerList, setPlayerList] = useState([]);
    const [unsoldClip, setUnsoldClip] = useState(null);
    const [customView, setCustomView] = useState(null);
    const [theme, setTheme] = useState('default');
    const [highestBid, setHighestBid] = useState(0);
    const [leadingTeam, setLeadingTeam] = useState("");
    const [isLoading, setIsLoading] = useState(false);



    useEffect(() => {
        document.title = "Live1 | Auction Arena";
    }, []);

    useEffect(() => {
        fetch(`${API}/api/theme`)
            .then(res => res.json())
            .then(data => setTheme(data.theme || "default"));

        const socket = io(API);
        socket.on("themeUpdate", (newTheme) => setTheme(newTheme));
        return () => socket.disconnect();
    }, []);


    const computeBasePrice = (player) => {
        if (player.base_price && player.base_price > 0) return player.base_price;
        const map = { A: 1700, B: 3000, C: 5000 };
        return map[player.base_category] || 0;
    };

    const triggerConfettiIfSold = (playerData) => {
        if (!isLoading && ["TRUE", "true", true].includes(playerData?.sold_status)) {
            console.log("🎉 Confetti fired for SOLD player:", playerData.name);

            //  ✅ Sold Play sound
            // Stop previous audio if still playing
            if (currentSoldAudio) {
                currentSoldAudio.pause();
                currentSoldAudio.currentTime = 0;
            }

            const selectedSrc = getRandomSoldAudio();
            console.log("🔊 Playing audio:", selectedSrc);

            currentSoldAudio = new Audio(selectedSrc);
            currentSoldAudio.volume = 1.0;
            currentSoldAudio.play().catch(err => {
                console.warn("Autoplay prevented:", err);
            });

            // Confetti Animatiom
            setTimeout(() => {
                const duration = 3000;
                const end = Date.now() + duration;

                const frame = () => {
                    confetti({ particleCount: 10, angle: 60, spread: 100, origin: { x: 0 } });
                    confetti({ particleCount: 10, angle: 120, spread: 100, origin: { x: 1 } });
                    confetti({ particleCount: 10, angle: 270, spread: 100, origin: { y: 0 } });
                    confetti({ particleCount: 10, angle: 90, spread: 100, origin: { y: 1 } });
                    if (Date.now() < end) requestAnimationFrame(frame);
                };

                frame();
            }, 100); // ⏱️ delay to ensure DOM settles
        }
    };

    const lastPlayerId = useRef(null);

    const fetchPlayer = async () => {
        try {
            const res = await fetch(`${API}/api/current-player`);
            const text = await res.text();
            const basic = text ? JSON.parse(text) : null;

            if (!basic?.id) {
                setPlayer(null);
                setUnsoldClip(null);
                return;
            }

            const isPlayerChanged = lastPlayerId.current !== basic.id;
            if (isPlayerChanged) {
                setIsLoading(true);
            }

            const fullRes = await fetch(`${API}/api/players/${basic.id}`);
            const fullPlayer = await fullRes.json();
            fullPlayer.base_price = computeBasePrice(fullPlayer);

            setPlayer(fullPlayer);
            fetchTeams();

            if (["FALSE", "false", false].includes(fullPlayer?.sold_status)) {
                try {
                    unsoldAudio.volume = 1.0;
                    unsoldAudio.currentTime = 0;
                    unsoldAudio.play();
                    const randomClip = unsoldMedia[Math.floor(Math.random() * unsoldMedia.length)];
                    setUnsoldClip(randomClip);
                } catch (e) {
                    console.error("UNSOLD audio error:", e);
                }
            } else {
                setUnsoldClip(null);
            }

            lastPlayerId.current = basic.id;

            if (isPlayerChanged) {
                setTimeout(() => {
                    setIsLoading(false);
                    triggerConfettiIfSold(fullPlayer);
                }, 800);
            }

        } catch (err) {
            console.error("Failed to fetch full player info", err);
            setPlayer(null);
            setUnsoldClip(null);
            setIsLoading(false);
        }
    };






    const fetchAllPlayers = async () => {
        try {
            const res = await fetch(`${API}/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`);
            const data = await res.json();
            console.log("✅ Player list fetched:", data.length);
            setPlayerList(data);
        } catch (err) {
            console.error("Error fetching player list:", err);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch(`${API}/api/teams?tournament_id=${CONFIG.TOURNAMENT_ID}`);
            const data = await res.json();
            setTeamSummaries(data);
        } catch (err) {
            console.error("Error fetching teams:", err);
        }
    };

    const [tournamentName, setTournamentName] = useState("Loading Tournament...");
    const [tournamentLogo, setTournamentLogo] = useState("");
    const { tournamentSlug } = useParams();
    const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
    const [teams, setTeams] = useState([]);
    const [players, setPlayers] = useState([]);



    const fetchTournament = async () => {
        try {
            const res = await fetch(`${API}/api/tournaments/${CONFIG.TOURNAMENT_ID}`);
            const data = await res.json();
            console.log("🏷️ Tournament fetched:", data);

            setTournamentName(data.title || "AUCTION ARENA LIVE");

            if (data.logo) {
                setTournamentLogo(`https://ik.imagekit.io/auctionarena/uploads/tournaments/${data.logo}?tr=h-300,w-300,fo-face,z-0.4`);
            }
        } catch (err) {
            console.error("Failed to fetch tournament name/logo:", err);
            setTournamentName("AUCTION ARENA LIVE");
        }
    };

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
    }, [tournamentSlug]);

    useEffect(() => {
    if (!player) return;

    const isSold = ["TRUE", "true", true].includes(player.sold_status);
    if (isSold) {
        console.log("🎉 SOLD player detected in useEffect:", player.name);

        // 🔊 Play sound
        if (currentSoldAudio) {
            currentSoldAudio.pause();
            currentSoldAudio.currentTime = 0;
        }

        const selectedSrc = getRandomSoldAudio();
        currentSoldAudio = new Audio(selectedSrc);
        currentSoldAudio.volume = 1.0;
        currentSoldAudio.play().catch(err => {
            console.warn("Autoplay prevented:", err);
        });

        // 🎊 Confetti burst
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
            confetti({ particleCount: 10, angle: 60, spread: 100, origin: { x: 0 } });
            confetti({ particleCount: 10, angle: 120, spread: 100, origin: { x: 1 } });
            confetti({ particleCount: 10, angle: 270, spread: 100, origin: { y: 0 } });
            confetti({ particleCount: 10, angle: 90, spread: 100, origin: { y: 1 } });
            if (Date.now() < end) requestAnimationFrame(frame);
        };

        setTimeout(frame, 100);
    }
}, [player?.sold_status]);



    useEffect(() => {
        fetchPlayer();
        fetchTeams();
        fetchTournament();
        fetchAllPlayers();

        const socket = io(API);

        socket.on("playerSold", () => {
            fetchPlayer();
            fetchAllPlayers();
            fetchTeams();
        });

        socket.on("playerChanged", () => {
            fetchPlayer();
        });


        socket.on("customMessageUpdate", (msg) => {
    if (msg === "__SHOW_TEAM_STATS__") {
        setCustomView("team-stats");
        setCustomMessage(null);
    } else if (msg === "__SHOW_NO_PLAYERS__") {
        setCustomView("no-players");
        setCustomMessage(null);
    } else if (msg === "__CLEAR_CUSTOM_VIEW__") {
        setCustomView(null);
        setCustomMessage(null);
    } else if (msg === "__RESET_AUCTION__") {
        fetchAllPlayers();
        fetchTeams();
        setCustomView(null);
        setCustomMessage(null);
    } else if (!msg.startsWith("__")) {
        // 🧠 Only treat as display message if not a system command
        setCustomMessage(msg);
        setCustomView(null);
    }
});


        socket.on("bidUpdated", ({ bid_amount, team_name }) => {
            console.log("🎯 bidUpdated received:", bid_amount, team_name);
            setHighestBid(bid_amount);
            setLeadingTeam(team_name);
        });


        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        if (teamSummaries.length === 0) return;

        const socket = io(API);

        socket.on("showTeam", (payload) => {
            if (!payload || payload.team_id === null) {
                setTeamIdToShow(null);        // ✅ Reset teamId
                setCustomMessage(null);       // ✅ Clear message
                setCustomView("live");        // ✅ Back to live
                return;
            }


            setTeamIdToShow(payload.team_id); // ✅ Always set team ID

            if (payload.empty) {
                setCustomMessage("No players yet for this team.");
                setCustomView("noPlayers");
            } else {
                setCustomMessage(null);          // ✅ Reset custom message
                setCustomView("team");
                fetchAllPlayers();  // 🔥 AUTOMATIC REFRESH TO FETCH ALL PLAYERS IN TEAM
            }
        });

        return () => socket.disconnect();
    }, [teamSummaries]);

    useEffect(() => {
        fetch(`${API}/api/custom-message`)
            .then(res => res.json())
            .then(data => {
    if (!data.message || data.message.startsWith("__")) {
        setCustomMessage(null);  // ignore system commands
    } else {
        setCustomMessage(data.message);
    }
});

    }, []);


    // When no players in team display

    if (customView === "noPlayers") {

        const team = teamSummaries.find(t => Number(t.id) === Number(teamIdToShow));
        const teamPlayers = playerList.filter(p =>
            Number(p.team_id) === Number(teamIdToShow) &&
            (p.sold_status === true || p.sold_status === "TRUE")
        );

        const teamLogoUrl = team.logo
            ? `https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`
            : null;

        return (
            <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
                {/* Background Layer – Particle Animation */}
                <BackgroundEffect theme={theme} />

                {/* Content Layer */}
                <div className="relative z-10 flex flex-col items-center justify-center h-full p-6">
                    {teamLogoUrl && (
                        <img
                            src={teamLogoUrl}
                            alt={team.name}
                            className="w-14 h-14 object-contain mb-2 rounded-xl border border-white shadow-md"
                        />
                    )}

                    <h1 className="text-2xl font-extrabold text-center mb-4">{team.name}</h1>

                    <p className="text-red-500 font-bold text-3xl mb-4 text-center">
                        {customMessage || "No players yet!"}
                    </p>

                    {tournamentLogo && (
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-16 h-16 object-contain absolute bottom-12 right-4 opacity-70"
                        />
                    )}

                    <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                        🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                    </footer>
                </div>
            </div>

        );
    }


    // 🔁 Show TEAM SQUAD if selected

    if (teamIdToShow && (teamSummaries.length === 0 || playerList.length === 0)) {
        return (
            <div className="w-screen h-screen bg-black text-white flex items-center justify-center text-2xl">
                Loading Team Squad...
            </div>
        );
    }

    if (teamIdToShow && teamSummaries.length > 0 && playerList.length > 0) {
        console.log("🟢 teamIdToShow =", teamIdToShow);
        console.log("📦 All team IDs =", teamSummaries.map(t => t.id));
        const team = teamSummaries.find(t => Number(t.id) === Number(teamIdToShow));
        const teamPlayers = playerList.filter(p =>
            Number(p.team_id) === Number(teamIdToShow) &&
            (p.sold_status === true || p.sold_status === "TRUE")
        );

        if (!team) {
            return (
                <div className="w-screen h-screen bg-black text-white flex items-center justify-center text-2xl">
                    Loading Team Squad...
                </div>
            );
        }

        const teamLogoUrl = team.logo
            ? `https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`
            : null;

        return (
            // <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} p-6 overflow-hidden flex flex-col items-center justify-start relative
            //  animate-fade-in-up`}>
            <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
                {/* Background Layer – Particle Animation */}
                <BackgroundEffect theme={theme} />

                {/* TEAM LOGO */}
                <div className="flex flex-col items-center mt-6 mb-4">
                    {teamLogoUrl && (
                        <img
                            src={teamLogoUrl}
                            alt={team.name}
                            className="w-20 h-20 object-contain mb-2 rounded-xl border border-white shadow-md"
                        />
                    )}

                    <h1 className="text-2xl font-extrabold text-center">{team.name}</h1>
                </div>


                {/* PLAYER GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 px-4">
                    {teamPlayers.map((player, idx) => (
                        <div
                            key={idx}
                            className="relative rounded-xl text-center font-sans text-white shadow-lg"
                            style={{
                                backgroundImage: 'url("/goldenbg.png")',
                                backgroundSize: 'contain',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                height: '320px',
                            }}
                        >
                            <div className="flex flex-col items-center justify-center h-full px-2 py-3">
                                <img
                                    src={
                                        player.profile_image
                                            ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-160,h-160,fo-face,z-0.4`
                                            : "/no-image-found.png"
                                    }
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = "/no-image-found.png";
                                    }}
                                    alt={player.name}
                                    className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain rounded-full mb-1"
                                    style={{
                                        WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                                        maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
                                        WebkitMaskSize: "100% 100%",
                                        maskSize: "100% 100%",
                                        WebkitMaskRepeat: "no-repeat",
                                        maskRepeat: "no-repeat",
                                    }}
                                />
                                <div className="text-[10px] font-bold uppercase text-white text-center px-2 break-words leading-tight max-w-full">
                                    {player.name}
                                </div>
                                <div className="text-[10px] font-medium text-yellow-100">
                                    {player.role} | ₹{player.sold_price?.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>


                {/* TOURNAMENT LOGO (BOTTOM RIGHT) */}
                {tournamentLogo && (
                    <img
                        src={tournamentLogo}
                        alt="Tournament Logo"
                        className="w-16 h-16 object-contain absolute bottom-12 right-4 opacity-70"
                    />
                )}

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }

    // Show Team Stats

    if (customView === "team-stats") {
        const leftTeams = teamSummaries.slice(0, Math.ceil(teamSummaries.length / 2));
        const rightTeams = teamSummaries.slice(Math.ceil(teamSummaries.length / 2));

        const getTeamPlayers = (teamId) => playerList.filter(p =>
            Number(p.team_id) === Number(teamId) &&
            (p.sold_status === true || p.sold_status === "TRUE")
        );

        const formatCurrency = (amt) => `₹${Number(amt || 0).toLocaleString()}`;

        return (
            <div className="w-screen h-screen bg-black text-white flex flex-col p-6">
                <BackgroundEffect theme={theme} />

                <div className="flex flex-row items-center justify-center mt-2 mb-4">
                    {tournamentLogo && (
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-36 h-36 object-contain animate-pulse"
                        />
                    )}
                    <h1 className="text-2xl font-bold text-center mt-2">{tournamentName}</h1>
                </div>

                <h2 className="text-3xl font-bold text-center py-5 text-white">📊 Team Statistics</h2>
                <div className="flex flex-1 justify-center gap-6 overflow-hidden mt-3">
                    {[leftTeams, rightTeams].map((group, groupIdx) => (
                        <div key={groupIdx} className="w-1/2 flex flex-col h-full overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-4 gap-2 px-3 py-2 font-bold text-sm bg-gray-800 rounded-lg text-white">
                                <div>TEAM NAME</div>
                                <div className="text-center">PURSE REMAINING</div>
                                <div className="text-center">MAX BID</div>
                                <div className="text-center">SLOTS LEFT</div>
                            </div>

                            {/* Rows */}
                            <div className="flex-1 overflow-auto mt-2 space-y-2 pr-1">
                                {group.map((team, idx) => {
                                    const teamPlayers = getTeamPlayers(team.id);
                                    const spent = teamPlayers.reduce((sum, p) => {
                                        const price = Number(p.sold_price);
                                        return sum + (isNaN(price) ? 0 : price);
                                    }, 0);
                                    const purse = Math.max(Number(team.budget || 0) - spent, 0);
                                    const leftSlots = (totalPlayersToBuy || 14) - (team.bought_count || 0);

                                    return (
                                        <div
                                            key={team.id}
                                            className="grid grid-cols-4 gap-2 items-center px-3 py-3 rounded-lg bg-gradient-to-r from-blue-900 to-purple-900 text-sm font-semibold shadow-sm"
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                                                    alt={team.name}
                                                    className="w-6 h-6 rounded-full border border-white"
                                                />
                                                <span className="truncate">{team.name}</span>
                                            </div>
                                            <div className="text-center">{formatCurrency(purse)}</div>
                                            <div className="text-center">{formatCurrency(team.max_bid_allowed)}</div>
                                            <div className="text-center">{leftSlots}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <footer className="mt-4 text-center text-white text-sm opacity-70">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }


    // Live Auction and no player is selected

    if (!player) {
        return (

            // <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
            <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
                {/* Background Layer – Particle Animation */}
                <BackgroundEffect theme={theme} />

                <div className="flex flex-col items-center justify-center text-5xl font-extrabold text-center px-10">
                    <div>

                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-64 h-64 object-contain animate-shake"
                            />
                        )}
                    </div>
                    <div className="animate-pulse ">
                        Live Auction Starts soon...
                    </div>
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }


    // Show Broadcast message

    const team = teamSummaries?.find(t => t.id === Number(player.team_id));
    const teamName = team?.name || leadingTeam || "Unknown";
    const teamLogoId = team?.logo;

    const isWaitingForBid =
        !["TRUE", "true", true].includes(player?.sold_status) &&
        (!highestBid || Number(highestBid) === 0);


    if (customMessage && customView !== "team-stats") {
        return (
            // <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
            <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
                {/* Background Layer – Particle Animation */}
                <BackgroundEffect theme={theme} />

                <div className="flex flex-col items-center justify-center text-5xl font-extrabold text-center px-10">
                    <div>
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-64 h-64 object-contain animate-shake"
                            />
                        )}
                    </div>
                    <div>
                        <div className="broadcast-message">{customMessage}</div>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading) return <PlayerTransitionLoader />;

    // Live Auction view

    return (
        // <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} overflow-hidden relative`}>
        <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
            {/* Background Layer – Particle Animation */}
            <BackgroundEffect theme={theme} />

            <div className="flex items-center justify-between px-6 py-4 border-b border-purple-700">
                {/* Left: Auction Arena Logo */}
                <img
                    src="/AuctionArena2.png"
                    alt="Auction Arena"
                    className="w-14 h-14 object-contain animate-rotate-360"
                />
                <h1 className="text-4xl font-extrabold tracking-wide text-center flex-1 animate-pulse">
                    {tournamentName?.toUpperCase() || "AUCTION ARENA LIVE"}
                </h1>
                {tournamentLogo && (
                    <img
                        src="/AuctionArena2.png"
                        alt="Auction Arena"
                        className="w-14 h-14 object-contain ml-4 animate-rotate-360"
                    />
                )}
            </div>

            <div
                key={player.id}
                className={`flex h-[calc(100%-120px)] px-12 pt-6 pb-10 gap-2 transition-opacity duration-700 ${!isLoading ? 'opacity-100 animate-fade-in' : 'opacity-0'}`}
            >
                <div className="w-1/3 flex flex-col items-center justify-center relative">
                    {["TRUE", "true", true].includes(player?.sold_status) && (
                        <div className="sold-stamp">SOLD OUT</div>
                    )}

                    {["FALSE", "false", false].includes(player?.sold_status) && (
                        <div className="unsold-stamp">UNSOLD</div>
                    )}

                    <img
                        src={player.profile_image}
                        alt={player.name}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "/no-image-found.png"; // Make sure this image exists in /public
                        }}
                        className="w-[48rem] h-[48rem] object-cover rounded-3xl border-4 border-white shadow-2xl"
                    />
                    <h1 className="text-2xl font-extrabold mt-6 uppercase">{player.name}</h1>
                    <p className="text-xl font-bold mt-2">({player.nickname || "-"})</p>
                </div>

                <div className="w-1/3 flex flex-col justify-center items-center space-y-10">
                    <div>
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-[20rem] h-[20rem] object-contain animate-shake"
                            />
                        )}
                    </div>
                    <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">Serial No: {player.auction_serial}</p>
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">Role: {player.role}</p>
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">Batting-hand: {player.batting_hand || "NA"}</p>
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">Bowling-hand: {player.bowling_hand || "NA"}</p>
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">District: {player.district || "-"}</p>

                    </div>
                    <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">Base Price</p>
                        <p className="text-sm uppercase tracking-wider font-bold drop-shadow-sm">
                            ₹{(player.base_price || 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="w-1/4 flex flex-col justify-center items-center space-y-8">
                    {["TRUE", "true", true].includes(player?.sold_status) && (
                        <div>
                            <div className="spark-burst" />
                            <img
                                src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${teamLogoId}?`}
                                alt={teamName}
                                className="relative z-10 animate-bounce-in"
                            />
                            <p className="text-xl font-bold text-center mb-2 mt-1">{teamName}</p>

                            <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                                <p className="text-xl uppercase tracking-wider font-bold drop-shadow-sm">
                                    🎉 Sold Amount: ₹{player.sold_price.toLocaleString()}
                                </p>
                                {team?.bought_count !== undefined && team?.max_bid_allowed !== undefined && (
                                    <div>
                                        <p className="text-xl uppercase tracking-wider font-bold drop-shadow-sm">
                                            🧑‍🤝‍🧑 Players Bought: {team.bought_count} / {CONFIG.PLAYERS_PER_TEAM || 14}
                                        </p>
                                        <p className="text-xl uppercase tracking-wider font-bold drop-shadow-sm">
                                            🚀 Max Bid Allowed: ₹{team.max_bid_allowed.toLocaleString()}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) && (
                        isWaitingForBid ? (
                            <div className="text-center">
                                <img
                                    src="/waitingbid.gif"
                                    alt="Waiting for a Bid"
                                    className="w-[20rem] h-[20rem] object-contain mx-auto mb-4"
                                />
                                <p className="text-2xl text-yellow-300 font-bold animate-pulse">
                                    Waiting for a Bid...
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-green-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                                    <p className="text-lg uppercase text-green-bold">Current Bid</p>
                                    <p className="text-4xl uppercase text-green-bold animate-pulse">
                                        ₹{(highestBid || 0).toLocaleString()}
                                    </p>
                                </div>

                                {(() => {
                                    const leadingTeamObj = teamSummaries.find(t => t.name?.trim() === leadingTeam?.trim());
                                    const leadingTeamLogo = leadingTeamObj?.logo;
                                    return (
                                        <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                                            <p className="text-2xl uppercase tracking-wider font-bold drop-shadow-sm">Leading Team</p>
                                            {leadingTeamLogo && (
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${leadingTeamLogo}?tr=w-400,h-400`}
                                                    alt={leadingTeamObj.name}
                                                    className="mx-auto mb-2 rounded-full w-[20rem] h-[20rem] object-contain inline-block align-middle"
                                                />
                                            )}
                                            <div className="text-4xl uppercase text-green-bold">
                                                {leadingTeam || "—"}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </>
                        )
                    )};




                    {["FALSE", "false", false].includes(player?.sold_status) && unsoldClip && (
                        <div className="relative w-[30rem] h-[30rem] px-4">
                            {unsoldClip.endsWith('.mp4') ? (
                                <video
                                    src={unsoldClip}
                                    autoPlay
                                    muted
                                    playsInline
                                    loop
                                    className="w-[30rem] h-[30rem] rounded-xl border-4 shadow-xl"
                                />
                            ) : (
                                <img
                                    src={unsoldClip}
                                    alt="UNSOLD Reaction"
                                    className="w-full rounded-xl shadow-xl object-cover"
                                />
                            )}

                            <p className="text-2xl text-red-300 font-bold animate-pulse text-center justify-center mt-2">
                                Player went Unsold...
                            </p>
                        </div>
                    )}


                </div>
            </div>

            <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>

        </div>
    );
};

export default SpectatorLiveDisplay;