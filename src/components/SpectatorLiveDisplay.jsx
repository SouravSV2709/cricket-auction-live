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
    const [countdownTime, setCountdownTime] = useState(null);
    const countdownIntervalRef = useRef(null);
    const [tournamentId, setTournamentId] = useState(null);
    const [revealedBids, setRevealedBids] = useState([]);
    const [secretBidWinner, setSecretBidWinner] = useState(null);






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


    useEffect(() => {
        // Lock scrolling
        document.body.classList.add('overflow-hidden');

        return () => {
            // Cleanup on unmount
            document.body.classList.remove('overflow-hidden');
        };
    }, []);



    const fetchAllPlayers = async () => {
        try {
            const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const data = await res.json();
            console.log("✅ Player list fetched:", data.length);
            setPlayerList(data);
        } catch (err) {
            console.error("Error fetching player list:", err);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
            const data = await res.json();
            console.log("✅ Team data fetched:", data);

            setTeamSummaries(data);
        } catch (err) {
            console.error("Error fetching teams:", err);
        }
    };

    const fetchPlayer = async () => {
        if (!tournamentId) {
            console.warn("⛔ fetchPlayer skipped — tournamentId not set");
            return;
        }

        try {
            const res = await fetch(`${API}/api/current-player`);
            if (!res.ok) throw new Error("❌ Failed to fetch current player");

            const text = await res.text();
            if (!text || text.trim().length === 0) {
                console.warn("⚠️ Empty response from /api/current-player — skipping update");
                return;
            }

            const basic = JSON.parse(text);
            if (!basic?.id) {
                console.warn("⚠️ No player ID found in current-player response — skipping update");
                return;
            }

            const isPlayerChanged = lastPlayerId.current !== basic.id;
            if (isPlayerChanged) {
                setIsLoading(true);
            }

            const fullRes = await fetch(`${API}/api/players/${basic.id}`);
            const fullPlayer = await fullRes.json();

            fullPlayer.base_price = computeBasePrice(fullPlayer);
            fullPlayer.secret_bidding_enabled = basic.secret_bidding_enabled;

            // Fetch team summaries and attach matching team to player
            const teams = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`).then(res => res.json());
            setTeamSummaries(teams);
            fullPlayer.team_data = teams.find(t => Number(t.id) === Number(fullPlayer.team_id));

            setPlayer(fullPlayer);

            // Play UNSOLD audio if needed
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
  // Only delay for new player
  setTimeout(() => {
    setIsLoading(false);
    triggerConfettiIfSold(fullPlayer);
  }, 800);
} else {
  // Immediate update for same player (like secret bid sold)
  setIsLoading(false);
  triggerConfettiIfSold(fullPlayer);
}


        } catch (err) {
            console.error("⚠️ Non-fatal fetchPlayer error:", err);
            setIsLoading(false);
            // ⚠️ Do NOT clear player — let old player remain visible
        }
    };





    const [tournamentName, setTournamentName] = useState("Loading Tournament...");
    const [tournamentLogo, setTournamentLogo] = useState("");
    const { tournamentSlug } = useParams();
    const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
    const [teams, setTeams] = useState([]);
    const [players, setPlayers] = useState([]);



    useEffect(() => {
        const fetchTournament = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();

                setTournamentName(data.title || tournamentSlug);
                setTournamentLogo(
                    data.logo
                        ? `https://ik.imagekit.io/auctionarena/uploads/tournaments/${data.logo}?tr=w-300,h-300,fo-face,z-0.4`
                        : ""
                );
                setTotalPlayersToBuy(data.total_players_to_buy || 14);

                const tournamentId = data.id;
                setTournamentId(tournamentId); // ✅ So other functions can use it

                const [teamRes, playerRes] = await Promise.all([
                    fetch(`${API}/api/teams?tournament_id=${tournamentId}`),
                    fetch(`${API}/api/players?tournament_id=${tournamentId}`)
                ]);

                const teamData = await teamRes.json();
                const playerData = await playerRes.json();

                const soldPlayers = playerData.filter(p => p.sold_status === true || p.sold_status === "TRUE");

                setPlayers(soldPlayers);
                setTeams(teamData);
                setTeamSummaries(teamData); // ✅ THIS FIXES THE ERROR
            } catch (err) {
                console.error("❌ Failed to load tournament data:", err);
            }
        };
        fetchTournament(); // 🟢 This was missing!
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
        if (!tournamentId) return;

        fetchPlayer(); // ✅ only runs after tournamentId is set
        fetchTeams();
        fetchAllPlayers();

        const socket = io(API);
        socket.on("playerSold", () => {
            fetchPlayer();
            fetchAllPlayers();
            fetchTeams();
        });

        socket.on("playerChanged", fetchPlayer);
        socket.on("secretBiddingToggled", fetchPlayer);

        return () => socket.disconnect();
    }, [tournamentId]);





    useEffect(() => {

        const socket = io(API);

        socket.on("playerSold", () => {
            fetchPlayer();
            fetchAllPlayers();
            fetchTeams();
        });

        socket.on("playerChanged", () => {
            fetchPlayer();
        });

        socket.on("secretBiddingToggled", () => {
            console.log("📡 Secret bidding toggle received");
            fetchPlayer(); // ⏱️ Immediately refresh current player data
        });

        socket.on("revealSecretBids", async ({ tournament_id, player_serial }) => {
            console.log("📡 Spectator received revealSecretBids:", tournament_id, player_serial);
            try {
                const res = await fetch(`${API}/api/secret-bids?tournament_id=${tournament_id}&player_serial=${player_serial}`);
                const data = await res.json();
                setRevealedBids(data || []);
                setCustomView("reveal-bids");
            } catch (err) {
                console.error("❌ Failed to fetch secret bids:", err);
            }
        });

        socket.on("secretBidWinnerAssigned", () => {
  console.log("📡 [Spectator] Received secretBidWinnerAssigned socket event");

  // Clear reveal-bids view
  setCustomView(null);
  setRevealedBids([]);
  setCustomMessage(null);

  setTimeout(() => {
    console.log("⏳ [Spectator] Fetching player after delay...");
    fetchPlayer(); // Ensure we hit this log before/after fetch
  }, 100);
});




        socket.on("customMessageUpdate", (msg) => {
            console.log("📩 Spectator received custom message:", msg);

            if (!msg || typeof msg !== "string") {
                console.warn("⛔ Ignored invalid custom message:", msg);
                return;
            }

            if (msg === "__SHOW_TEAM_STATS__") {
                setCustomView("team-stats");
                setCustomMessage(null);
            } else if (msg === "__SHOW_NO_PLAYERS__") {
                setCustomView("no-players");
                setCustomMessage(null);
            } else if (msg === "__CLEAR_CUSTOM_VIEW__") {
    setIsLoading(false); // 🔥 Bypass loader
    setCustomView(null);
    setCustomMessage(null);
    setCountdownTime(null);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    fetchPlayer(); // still fetch to update player info
} else if (msg === "__RESET_AUCTION__") {
                fetchAllPlayers();
                fetchTeams();
                setCustomView(null);
                setCustomMessage(null);
                setCountdownTime(null); // Reset countdown
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            } else if (msg.startsWith("__START_COUNTDOWN__")) {
                console.log("⏱️ Initializing countdown with seconds:", msg);
                const seconds = parseInt(msg.replace("__START_COUNTDOWN__", ""), 10) || 0;
                console.log("🔁 Countdown state before starting:", seconds);
                setCustomMessage(null);
                setCountdownTime(seconds);

                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

                countdownIntervalRef.current = setInterval(() => {
                    setCountdownTime(prev => {
                        if (prev <= 1) {
                            console.log("✅ Countdown finished");
                            clearInterval(countdownIntervalRef.current);
                            return 0;
                        }
                        console.log("⏳ Countdown ticking:", prev - 1);
                        return prev - 1;
                    });
                }, 1000);
            } else if (!msg.startsWith("__")) {
                setCustomMessage(msg);
                setCustomView(null);
            } else if (msg === "__SHOW_TOP_10_EXPENSIVE__") {
                setCustomView("top-10-expensive");
                setCustomMessage(null);
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

    // When secret-bid is revealed

    if (customView === "reveal-bids" && revealedBids.length > 0) {
        const highestBid = revealedBids[0]?.bid_amount;

        return (
            <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center overflow-auto px-4">
                <BackgroundEffect theme={theme} />

                <h1 className="text-4xl font-extrabold text-yellow-400 mb-6">📢 Secret Bids Revealed</h1>

                <div className="w-full max-w-4xl bg-white/10 rounded-xl shadow-xl p-6 backdrop-blur-sm space-y-4">
                    {revealedBids.map((bid, idx) => (
                        <div
                            key={bid.team_id}
                            className={`flex justify-between items-center px-6 py-4 rounded-lg ${bid.bid_amount === highestBid ? 'bg-green-700/80' : 'bg-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${bid.logo}`}
                                    alt={bid.team_name}
                                    className="w-14 h-14 rounded-full border border-white object-contain"
                                />
                                <div className="text-xl font-bold">{bid.team_name}</div>
                            </div>
                            <div className="text-2xl font-bold text-green-400">
                                ₹{Number(bid.bid_amount).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-sm bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }

    // When no players in team display

    if (customView === "noPlayers") {

        const team = Array.isArray(teamSummaries)
            ? teamSummaries.find(t => Number(t.id) === Number(teamIdToShow))
            : null;
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

    if (teamIdToShow && teamSummaries.length > 0 && playerList.length > 0) {
        const teamPlayers = playerList.filter(
            (p) =>
                Number(p.team_id) === Number(teamIdToShow) &&
                (p.sold_status === true || p.sold_status === "TRUE")
        );

        const sortedByPrice = [...teamPlayers].sort(
            (a, b) => (b.sold_price || 0) - (a.sold_price || 0)
        );
        const topPlayer = sortedByPrice[0];
        const restPlayers = sortedByPrice.slice(1);

        return (
            <div className="w-screen h-screen flex flex-row bg-black text-white relative overflow-hidden">
                <BackgroundEffect theme={theme} />

                {/* Tournament Logo – Top Left Corner */}
                {tournamentLogo && (
                    <div className="absolute top-4 left-4 z-50">
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-28 h-28 object-contain drop-shadow-md animate-pulse"
                        />
                    </div>
                )}

                {/* Left Panel – Highlight Player */}
                <div className="w-1/3 flex flex-col items-center justify-center p-6">
                    <h3 className="text-2xl font-bold text-yellow-300 mb-3">#1 Most Expensive Player</h3>
                    <div className="text-center mb-4">
                        <h1 className="text-3xl font-extrabold">{topPlayer?.name || "No Player"}</h1>
                        <p className="text-yellow-200 text-sm">{topPlayer?.role || "Not Assigned"}</p>
                        <p className="text-2xl text-green-400 font-bold mt-2">
                            ₹{topPlayer?.sold_price?.toLocaleString() || "0"}
                        </p>
                    </div>
                    <img
                        src={
                            topPlayer?.profile_image
                                ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4`
                                : "/no-player-found.png"
                        }
                        alt={topPlayer?.name || "No Player"}
                        className="w-[300px] h-[400px] object-cover rounded-2xl border-4 border-yellow-400 shadow-2xl"
                    />
                </div>

                {/* Right Panel – Rest of Players (Stacked 2 Columns) */}
                <div className="w-2/3 p-6 space-y-4">
                    {/* Selected Team Logo + Name */}
                    <div className="flex items-center justify-center gap-3 mb-2">
                        {teamIdToShow && (
                            <>
                                <img
                                    src={
                                        teamSummaries.find((t) => Number(t.id) === Number(teamIdToShow))?.logo
                                            ? `https://ik.imagekit.io/auctionarena/uploads/teams/logos/${teamSummaries.find((t) => Number(t.id) === Number(teamIdToShow)).logo}`
                                            : "/no-team-logo.png"
                                    }
                                    alt="Team Logo"
                                    className="w-36 h-36 object-contain animate-pulse"
                                />
                                <h3 className="text-xl font-bold text-yellow-300 text-center mb-2">Team Squad</h3>
                            </>
                        )}
                    </div>
                    <div className="flex flex-row justify-between gap-4">
                        {[0, 1].map((groupIdx) => {
                            const playerGroup = restPlayers.length
                                ? restPlayers.slice(groupIdx * 7, groupIdx * 7 + 7)
                                : Array(5).fill(null);

                            return (
                                <div key={groupIdx} className="flex-1 flex flex-col space-y-4">
                                    {playerGroup.map((player, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between bg-white/10 border-l-4 pl-4 pr-6 py-3 rounded-xl shadow-lg backdrop-blur-sm border-white/20"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="text-2xl font-bold text-yellow-300 w-8">#{groupIdx * 7 + idx + 2}</div>
                                                <img
                                                    src={
                                                        player?.profile_image
                                                            ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-80,h-80,fo-face,z-0.4`
                                                            : "/no-player-found.png"
                                                    }
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = "/no-player-found.png";
                                                    }}
                                                    alt={player?.name || "No Player"}
                                                    className="w-14 h-14 rounded-full border border-white object-cover"
                                                />
                                                <div className="flex flex-col">
                                                    <div className="font-bold text-white">{player?.name || "No Player"}</div>
                                                    <div className="text-sm text-yellow-100">{player?.role || "Not Assigned"}</div>
                                                </div>
                                            </div>
                                            <div className="text-xl font-bold text-green-400">
                                                ₹{player?.sold_price?.toLocaleString() || "0"}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }

    // Top 10 most expensive players

    if (customView === "top-10-expensive") {
        const sortedPlayers = [...playerList]
            .filter(p => p.sold_status === "TRUE" || p.sold_status === true)
            .sort((a, b) => (b.sold_price || 0) - (a.sold_price || 0))
            .slice(0, 10);

        const topPlayer = sortedPlayers[0];
        const topTeam = teamSummaries.find(t => Number(t.id) === Number(topPlayer?.team_id));
        const leftPlayers = sortedPlayers.slice(0, 5);
        const rightPlayers = sortedPlayers.slice(5, 10);

        if (sortedPlayers.length === 0) {
            return (
                <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center p-10 text-center">
                    <BackgroundEffect theme={theme} />
                    <h1 className="text-4xl font-extrabold text-red-400 mb-4">⚠️ No Sold Players</h1>
                    <p className="text-lg text-white/80">No player has been marked as SOLD yet. Please try again later.</p>
                </div>
            );
        }


        return (
            <div className="w-screen h-screen flex flex-row bg-black text-white relative overflow-hidden">
                <BackgroundEffect theme={theme} />

                {/* Left Panel: Tournament Title and Players */}
                <div className="flex flex-col justify-start w-2/3 p-6 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col items-center mb-4">
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-24 h-24 object-contain mb-2 animate-pulse"
                            />
                        )}
                        <h2 className="text-3xl font-extrabold text-yellow-400 drop-shadow-md text-center">
                            {tournamentName || "AUCTION ARENA"} <br />
                            <span className="text-white text-xl">Top 10 Most Expensive Players</span>
                        </h2>
                    </div>

                    {/* Two-Column Player List */}
                    <div className="flex flex-row justify-between gap-4">
                        {[leftPlayers, rightPlayers].map((group, groupIdx) => (
                            <div key={groupIdx} className="flex-1 flex flex-col space-y-4">
                                {group.map((player, idx) => {
                                    const team = Array.isArray(teamSummaries)
                                        ? teamSummaries.find(t => Number(t.id) === Number(player.team_id))
                                        : null;


                                    const rank = groupIdx * 5 + idx + 1;

                                    return (
                                        <div
                                            key={player.id}
                                            className={`flex items-center justify-between bg-white/10 border-l-4 pl-4 pr-6 py-3 rounded-xl shadow-lg backdrop-blur-sm 
                                            ${rank === 1 ? 'border-yellow-500' : 'border-white/20'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="text-2xl font-bold text-yellow-300 w-8">#{rank}</div>
                                                <img
                                                    src={player.profile_image
                                                        ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-80,h-80,fo-face,z-0.4`
                                                        : "/no-image-found.png"}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                                                    className="w-14 h-14 rounded-full border border-white object-cover"
                                                    alt={player.name}
                                                />
                                                <div className="flex flex-col">
                                                    <div className="font-bold">{player.name}</div>
                                                    <div className="text-sm text-yellow-100">{team?.name || "Unknown"}</div>
                                                </div>
                                            </div>
                                            <div className="text-xl font-bold text-green-400">
                                                ₹{player.sold_price?.toLocaleString()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Highlight Player */}
                <div className="w-1/3 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black to-black-900 shadow-inner">
                    <h3 className="text-2xl font-bold text-yellow-300 mb-3">🏅 Highest Bidded Player</h3>
                    <div className="text-center mb-4">
                        <h1 className="text-3xl font-extrabold">{topPlayer.name}</h1>
                        <p className="text-yellow-200 text-sm">{topTeam?.name}</p>
                        <p className="text-2xl text-green-400 font-bold mt-2">₹{topPlayer.sold_price?.toLocaleString()}</p>
                    </div>
                    <img
                        src={
                            topPlayer.profile_image
                                ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4`
                                : "/no-image-found.png"
                        }
                        onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                        alt={topPlayer.name}
                        className="w-[300px] h-[400px] object-cover rounded-2xl"
                    />

                    {tournamentLogo && (
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-16 h-16 object-contain mt-4 opacity-70"
                        />
                    )}
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
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
            <div className="w-screen h-screen bg-black text-white flex flex-col p-6 overflow-x-hidden overflow-y-hidden">
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
                <div className="flex gap-2 items-start justify-center">
                    {[leftTeams, rightTeams].map((group, groupIdx) => (
                        <div key={groupIdx} className="flex flex-col w-auto max-w-[48%] overflow-hidden bg-white/10 border border-white/10 rounded-2xl px-10 py-6 backdrop-blur-sm shadow-xl">
                            {/* Header */}
                            <div className="grid grid-cols-4 gap-2 px-3 py-2 font-bold text-sm bg-gray-800 rounded-lg text-white">
                                <div>TEAM NAME</div>
                                <div className="text-center">PURSE REMAINING</div>
                                <div className="text-center">MAX BID</div>
                                <div className="text-center">SLOTS LEFT</div>
                            </div>

                            {/* Rows */}
                            <div className="overflow-y-auto max-h-[calc(100vh-300px)] mt-2 space-y-2 pr-1">
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

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        );
    }

    if (customMessage && customView !== "team-stats") {
        return (
            // <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
            <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
                <BackgroundEffect theme={theme} />

                <div className="absolute inset-0 flex flex-row items-center justify-center h-screen px-6">

                    {/* Left Branding Panel */}
                    <div className="flex flex-col items-center justify-center text-left pr-10 gap-4 min-w-[420px] max-w-[440px]">
                        <img
                            src="/AuctionArena2.png"
                            alt="Auction Arena"
                            className="w-64 h-64 object-contain mb-2 animate-shake"
                        />
                        <div className="text-xl text-white text-center leading-snug">
                            <p>Contact <span className="text-yellow-300 font-bold">Auction-Arena</span> for</p>
                            <p>seamless auction experience</p>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-yellow-400 text-lg font-bold">
                            <span className="text-pink-400 text-xl">📞</span>
                            <span>+91-9547652702</span>
                        </div>
                        <p className="text-sm text-white font-semibold italic">Sourav Mukherjee</p>
                    </div>

                    {/* 🔸 Pulse Divider Bar */}
                    <div className="w-[2px] h-[300px] bg-white/30 animate-pulse mx-8 rounded-full" />

                    {/* Center – Logo and Message */}
                    <div className="flex flex-col items-center justify-center gap-6 text-center">
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-64 h-64 object-contain animate-shake"
                            />
                        )}
                        <div className="bg-white/10 border border-white/30 rounded-2xl px-10 py-6 backdrop-blur-sm shadow-2xl">
                            <p className="text-3xl md:text-5xl font-extrabold text-white drop-shadow-md">
                                {customMessage}
                            </p>
                        </div>
                    </div>

                </div>

            </div>

        );
    }

    if (isLoading) return <PlayerTransitionLoader />;

    if (countdownTime !== null) {
        const mins = Math.floor(countdownTime / 60);
        const secs = countdownTime % 60;
        const formatted = `${mins}:${secs.toString().padStart(2, "0")}`;

        return (
            <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center">
                <BackgroundEffect theme={theme} />
                {countdownTime === 0 ? (
                    <>
                        <h1 className="text-6xl font-extrabold text-red-500 mb-4 animate-pulse">⛔ Time's Up</h1>
                        <div className="text-7xl md:text-9xl font-extrabold tracking-widest text-white">
                            00:00
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="text-5xl md:text-7xl font-extrabold text-yellow-300 mb-6 animate-pulse">⏱️ Time Remaining</h1>
                        <div className="text-7xl md:text-9xl font-extrabold tracking-widest text-white animate-pulse">
                            {formatted}
                        </div>
                    </>
                )}
                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
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
                <BackgroundEffect theme={theme} />

                <div className="absolute inset-0 flex flex-row items-center justify-center h-screen px-6">

                    {/* Left Branding Panel */}
                    <div className="flex flex-col items-center justify-center text-left pr-10 gap-4 min-w-[420px] max-w-[440px]">
                        <img
                            src="/AuctionArena2.png"
                            alt="Auction Arena"
                            className="w-64 h-64 object-contain mb-2 animate-shake"
                        />
                        <div className="text-xl text-white text-center leading-snug">
                            <p>Contact <span className="text-yellow-300 font-bold">Auction-Arena</span> for</p>
                            <p>seamless auction experience</p>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-yellow-400 text-lg font-bold">
                            <span className="text-pink-400 text-xl">📞</span>
                            <span>+91-9547652702</span>
                        </div>
                        <p className="text-sm text-white font-semibold italic">Sourav Mukherjee</p>
                    </div>

                    {/* 🔸 Pulse Divider Bar */}
                    <div className="w-[2px] h-[300px] bg-white/30 animate-pulse mx-8 rounded-full" />

                    {/* Center – Logo and Message */}
                    <div className="flex flex-col items-center justify-center gap-6 text-center animate-ring-explode">
                        {tournamentLogo && (
                            // <img
                            //     src={tournamentLogo}
                            //     alt="Tournament Logo"
                            //     className="w-64 h-64 object-contain animate-shake"
                            // />
                            <img
                                src="/bbplposter.png"
                                alt="BBPL Poster"
                                className="w-96 h-auto object-contain rounded-2xl"
                            />
                        )}

                        <div className="bg-white/10 border border-white/30 rounded-2xl px-10 py-6 backdrop-blur-sm shadow-2xl">
                            <p className="text-xl md:text-2xl font-extrabold text-white drop-shadow-md animate-typing">
                                Live auction will resume soon...
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        );
    }


    // Show Broadcast message

    const team = Array.isArray(teamSummaries)
        ? teamSummaries.find(t => Number(t.id) === Number(player.team_id))
        : null;
    const teamName = team?.name || leadingTeam || "Unknown";
    const teamLogoId = team?.logo;

    const isWaitingForBid =
        !["TRUE", "true", true].includes(player?.sold_status) &&
        (!highestBid || Number(highestBid) === 0);





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
                        className="w-[48rem] h-[48rem] object-cover rounded-2xl border-4 border-white shadow-2xl"
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
                                    const leadingTeamObj = Array.isArray(teamSummaries)
                                        ? teamSummaries.find(t => t.name?.trim() === leadingTeam?.trim())
                                        : null;

                                    const leadingTeamLogo = leadingTeamObj?.logo;
                                    const leadingTeamName = leadingTeamObj?.name;



                                    return (
                                        <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                                            <p className="text-2xl uppercase tracking-wider font-bold drop-shadow-sm">Leading Team</p>

                                            {leadingTeamLogo && (
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${leadingTeamLogo}?tr=w-400,h-400`}
                                                    alt={leadingTeamName}
                                                    className="mx-auto mb-2 rounded-full w-[20rem] h-[20rem] object-contain inline-block align-middle"
                                                />
                                            )}

                                            <div className="text-4xl uppercase text-green-bold">
                                                {leadingTeamName || "—"}
                                            </div>

                                        </div>
                                    );
                                })()}

                                <div>
                                    {/* 👇 Secret Bidding Flag Message */}
                                    {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) &&
                                        player?.secret_bidding_enabled && (
                                            <p className="text-2xl mt-4 text-yellow-300 font-bold animate-pulse">
                                                Secret Bidding In Progress...
                                            </p>
                                        )}
                                </div>

                            </>
                        )
                    )}


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