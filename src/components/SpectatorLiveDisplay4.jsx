import React, { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";
import { useParams } from "react-router-dom";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import PlayerTransitionLoader from "../components/PlayerTransitionLoader";
import { io } from "socket.io-client";
import BackgroundEffect from "../components/BackgroundEffect";
import { DateTime } from "luxon";



const API = CONFIG.API_BASE_URL;

let currentSoldAudio = null;

const soldAudioFiles = [
    // '/sounds/clapping.wav',
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
    '/sounds/unsold3.gif',
    '/sounds/unsold5.gif',
    '/sounds/unsold6.gif',
    '/sounds/unsold7.gif'
];

const unsoldAudio = new Audio('/sounds/unsold4.mp3');


const SpectatorLiveDisplay = () => {
    const [player, setPlayer] = useState(null);
    const socketRef = useRef(null);
    const [teamSummaries, setTeamSummaries] = useState([]);
    const { width, height } = useWindowSize();
    const [customMessage, setCustomMessage] = useState(null);
    const [teamIdToShow, setTeamIdToShow] = useState(null);
    const [playerList, setPlayerList] = useState([]);
    const [unsoldClip, setUnsoldClip] = useState(null);
    const [customView, setCustomView] = useState(null);
    const [theme, setTheme] = useState("Fireflies");
    const [highestBid, setHighestBid] = useState(0);
    const [leadingTeam, setLeadingTeam] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [countdownTime, setCountdownTime] = useState(null);
    const countdownIntervalRef = useRef(null);
    const [tournamentId, setTournamentId] = useState(null);
    const [revealedBids, setRevealedBids] = useState([]);
    const [secretBidWinner, setSecretBidWinner] = useState(null);
    const [auctionDatetime, setAuctionDatetime] = useState(null);
    const [cricheroesStats, setCricheroesStats] = useState(null);


    useEffect(() => {
        document.title = "Live1 | Auction Arena";
    }, []);

    useEffect(() => {
        fetch(`${API}/api/theme`)
            .then(res => res.json())
            .then(data => setTheme(data.theme || "fireflies"));

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
                    confetti({ particleCount: 10, angle: 60, spread: 200, origin: { x: 0 } });
                    confetti({ particleCount: 10, angle: 120, spread: 200, origin: { x: 1 } });
                    confetti({ particleCount: 10, angle: 270, spread: 200, origin: { y: 0 } });
                    confetti({ particleCount: 10, angle: 90, spread: 200, origin: { y: 1 } });
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
                setPlayer(null);
                return;
            }

            const basic = JSON.parse(text);
            if (!basic?.id) {
                console.warn("⚠️ No player ID found in current-player response — skipping update");
                setPlayer(null); // ✅ Reset player 
                setCricheroesStats(null);

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
            // Only reset bid/team if it's a NEW player
            if (isPlayerChanged && !fullPlayer.secret_bidding_enabled) {
                setHighestBid(0);
                setLeadingTeam("");
            }



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

            if (fullPlayer.cricheroes_id) {
                try {
                    const statsRes = await fetch(`${API}/api/cricheroes-stats/${fullPlayer.cricheroes_id}`);
                    const stats = await statsRes.json();
                    setCricheroesStats(stats);
                } catch (err) {
                    console.error("❌ Error fetching Cricheroes stats:", err);
                    setCricheroesStats(null);
                }
            } else {
                setCricheroesStats(null);
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
                        ? `https://ik.imagekit.io/auctionarena/uploads/tournaments/${data.logo}?tr=w-300,h-300,fo-face,z-0.4,q-95,e-sharpen`
                        : ""
                );
                setTotalPlayersToBuy(data.players_per_team || 14);
                setAuctionDatetime(data.auction_datetime || null);

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
        if (!player || !["TRUE", "true", true].includes(player.sold_status)) return;

        if (player.id === lastPlayerId.current) {
            console.log("⏭️ Skipping confetti - player already shown as SOLD:", player.name);
            return;
        }

        console.log("🎉 SOLD player detected:", player.name);
        lastPlayerId.current = player.id;

        // 🔊 Confetti + Audio
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
        socketRef.current = socket;

        // 🔌 Custom message logic
        socket.on("customMessageUpdate", (msg) => {
            console.log("📩 Spectator received custom message:", msg);

            if (!msg || typeof msg !== "string") return;

            if (msg === "__SHOW_TEAM_STATS__") {
                setCustomView("team-stats");
                setCustomMessage(null);
            } else if (msg === "__SHOW_NO_PLAYERS__") {
                setCustomView("no-players");
                setCustomMessage(null);
            } else if (msg === "__CLEAR_CUSTOM_VIEW__") {
                setIsLoading(false);
                setCustomView(null);
                setCustomMessage(null);
                setCountdownTime(null);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                fetchPlayer();
            } else if (msg === "__RESET_AUCTION__") {
                fetchAllPlayers();
                fetchTeams();
                setCustomView("no-players");
                setCustomMessage(null);
                setCountdownTime(null);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            } else if (msg.startsWith("__START_COUNTDOWN__")) {
                const seconds = parseInt(msg.replace("__START_COUNTDOWN__", ""), 10) || 0;
                setCustomMessage(null);
                setCountdownTime(seconds);

                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

                countdownIntervalRef.current = setInterval(() => {
                    setCountdownTime(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownIntervalRef.current);
                            return 0;
                        }
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

        // 🔁 Other event bindings (move your socket.on(...) here)
        socket.on("playerSold", () => {
            fetchPlayer();
            fetchAllPlayers();
            fetchTeams();
        });

        socket.on("playerChanged", fetchPlayer);
        socket.on("secretBiddingToggled", fetchPlayer);

        socket.on("revealSecretBids", async ({ tournament_id, player_serial }) => {
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
            setCustomView(null);
            setRevealedBids([]);
            setCustomMessage(null);
            setTimeout(() => fetchPlayer(), 100);
        });

        socket.on("showTeam", (payload) => {
            if (!payload || payload.team_id === null) {
                setTeamIdToShow(null);
                setCustomMessage(null);
                setCustomView("live");
            } else {
                setTeamIdToShow(payload.team_id);
                if (payload.empty) {
                    setCustomMessage("No players yet for this team.");
                    setCustomView("noPlayers");
                } else {
                    setCustomMessage(null);
                    setCustomView("team");
                    fetchAllPlayers();
                }
            }
        });

        socket.on("bidUpdated", ({ bid_amount, team_name }) => {
            setHighestBid(bid_amount);
            setLeadingTeam(team_name);
        });

        return () => {
            socket.disconnect();
        };
    }, [tournamentId]); // Use tournamentId to rebind only when necessary


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

    if (customView === "reveal-bids" && revealedBids.length > 0 && player) {
        // Sort by highest bid DESC, then earliest created_at ASC
        const sortedBids = [...revealedBids].sort((a, b) => {
            if (b.bid_amount !== a.bid_amount) {
                return b.bid_amount - a.bid_amount; // higher bid first
            }
            return new Date(a.created_at) - new Date(b.created_at); // earlier wins tie
        });

        const winningTeamId = sortedBids[0]?.team_id;
        const midpoint = Math.ceil(sortedBids.length / 2);
        const leftTable = sortedBids.slice(0, midpoint);
        const rightTable = sortedBids.slice(midpoint);


        return (
            <div className="w-screen h-screen bg-black text-white flex overflow-hidden">
                <BackgroundEffect theme={theme} />

                {/* LEFT: Player Info Centered */}
                <div className="w-1/3 h-full flex flex-col items-center justify-center p-6 border-r border-white/20">
                    <h2 className="text-lg  tracking-wider uppercase mb-4 text-center">
                        PLAYER #{player.auction_serial}
                    </h2>

                    <img
                        src={
                            player.profile_image?.startsWith("http")
                                ? player.profile_image
                                : `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-300,h-400,fo-face,z-0.4,q-95,e-sharpen`
                        }
                        alt={player.name}
                        className="w-[30rem] h-[36rem] object-cover rounded-xl border-2 border-white shadow-lg mb-4"
                    />

                    <div className="text-center space-y-2">
                        <h1 className="text-2xl ">{player.name}</h1>
                        <p className="text-sm italic text-yellow-200">
                            {player.role} | {player.district || "NA"}
                        </p>
                        <p className="text-sm uppercase">BASE PRICE</p>
                        <p className="text-xl font-extrabold text-green-400">
                            ₹{(player.base_price || 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                {/* RIGHT: Adaptive Table(s) Centered */}
                <div className="w-2/3 h-full flex items-center justify-center px-4 py-6 overflow-auto">
                    <div className="w-full flex flex-col items-center justify-center">
                        {/* Tournament Header */}
                        <div className="flex flex-row items-center mb-4">
                            {tournamentLogo && (
                                <img
                                    src={tournamentLogo}
                                    alt="Tournament Logo"
                                    className="w-24 h-24 object-contain mb-2 animate-pulse"
                                />
                            )}
                            <h1 className="text-xl  text-white tracking-wide text-center m-6">{tournamentName}</h1>
                        </div>

                        {/* Player-specific Bid Header */}
                        <h2 className="text-3xl font-extrabold tracking-wider uppercase mb-6 text-center">
                            Secret Bids for Player #{player.auction_serial}: {player.name}
                        </h2>


                        {revealedBids.length <= 8 ? (
                            // ✅ Single Table Layout
                            <div className="w-full max-w-4xl">
                                <table className="w-full table-auto text-left border-collapse shadow-md rounded-xl overflow-hidden backdrop-blur-md animate-fade-in">
                                    <thead className="bg-white/10 text-yellow-300 text-xs uppercase text-center">
                                        <tr>
                                            <th className="px-4 py-2 border-b border-white/10">#</th>
                                            <th className="px-4 py-2 border-b border-white/10">Logo</th>
                                            <th className="px-4 py-2 border-b border-white/10">Team Name</th>
                                            <th className="px-4 py-2 border-b border-white/10 text-right">Bid</th>
                                            <th className="px-3 py-2 border-b border-white/10 text-right">Submitted At</th> {/* ⬅ new */}
                                        </tr>
                                    </thead>
                                    <tbody className="text-white text-sm divide-y divide-white/10 text-center">
                                        {revealedBids.map((bid, idx) => (
                                            <tr
                                                key={bid.team_id}
                                                className={`${bid.team_id === winningTeamId ? "bg-green-700/70  animate-pulse" : "bg-white/5"
                                                    }`}
                                            >
                                                <td className="px-4 py-2">{idx + 1}</td>
                                                <td className="px-4 py-2">
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${bid.logo}`}
                                                        alt={bid.team_name}
                                                        className="w-8 h-8 rounded-full object-contain border border-white/30"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">{bid.team_name}</td>
                                                <td className="px-4 py-2 text-right text-green-300">
                                                    ₹{Number(bid.bid_amount).toLocaleString()}
                                                </td>
                                                <td className="text-center text-sm">
                                                    {(() => {
                                                        if (!bid.created_at) return "Invalid Time";

                                                        const raw = bid.created_at;
                                                        console.log("bid.created_at raw:", raw);

                                                        let dt;

                                                        // If time is before 9:30am UTC, it’s likely a correct UTC timestamp (local env)
                                                        // Otherwise (>= IST), treat as mistaken IST pretending to be UTC (prod bug)
                                                        const hour = parseInt(raw.substring(11, 13));

                                                        if (hour < 9) {
                                                            // Proper UTC string (like in local) — convert to IST
                                                            dt = DateTime.fromISO(raw, { zone: "UTC" }).setZone("Asia/Kolkata");
                                                        } else {
                                                            // Mis-tagged IST (like in prod) — ignore Z and parse as IST
                                                            const cleaned = raw.replace("Z", "");
                                                            dt = DateTime.fromFormat(cleaned, "yyyy-MM-dd'T'HH:mm:ss.SSS", {
                                                                zone: "Asia/Kolkata",
                                                            });

                                                            if (!dt.isValid) {
                                                                dt = DateTime.fromFormat(cleaned, "yyyy-MM-dd'T'HH:mm:ss", {
                                                                    zone: "Asia/Kolkata",
                                                                });
                                                            }
                                                        }

                                                        if (!dt.isValid) return "Invalid Date";

                                                        return dt.toFormat("hh:mm:ss a");
                                                    })()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            // ✅ Two Table Layout
                            <div className="flex w-full justify-center items-start gap-6">
                                {[leftTable, rightTable].map((group, i) => (
                                    <table
                                        key={i}
                                        className="w-1/2 table-auto text-left border-collapse shadow-md rounded-xl overflow-hidden backdrop-blur-md animate-fade-in"
                                    >
                                        <thead className="bg-white/10 text-yellow-300 text-xs uppercase text-center">
                                            <tr>
                                                <th className="px-3 py-2 border-b border-white/10">#</th>
                                                <th className="px-3 py-2 border-b border-white/10">Logo</th>
                                                <th className="px-3 py-2 border-b border-white/10">Team Name</th>
                                                <th className="px-3 py-2 border-b border-white/10 text-right">Bid</th>
                                                <th className="px-3 py-2 border-b border-white/10 text-right">Submitted At</th> {/* ⬅ new */}
                                            </tr>
                                        </thead>
                                        <tbody className="text-white text-sm divide-y divide-white/10">
                                            {group.map((bid, idx) => (
                                                <tr
                                                    key={bid.team_id}
                                                    className={`${bid.team_id === winningTeamId ? "bg-green-700/70  animate-pulse" : "bg-white/5"
                                                        }`}
                                                >
                                                    <td className="px-3 py-2">{idx + 1 + (i === 1 ? midpoint : 0)}</td>
                                                    <td className="px-3 py-2">
                                                        <img
                                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${bid.logo}`}
                                                            alt={bid.team_name}
                                                            className="w-8 h-8 rounded-full object-contain border border-white/30"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">{bid.team_name}</td>
                                                    <td className="px-3 py-2 text-right text-green-300">
                                                        ₹{Number(bid.bid_amount).toLocaleString()}
                                                    </td>
                                                    <td className="text-center text-sm">
                                                        {(() => {
                                                            if (!bid.created_at) return "Invalid Time";

                                                            const raw = bid.created_at;
                                                            console.log("bid.created_at raw:", raw);

                                                            let dt;

                                                            // If time is before 9:30am UTC, it’s likely a correct UTC timestamp (local env)
                                                            // Otherwise (>= IST), treat as mistaken IST pretending to be UTC (prod bug)
                                                            const hour = parseInt(raw.substring(11, 13));

                                                            if (hour < 9) {
                                                                // Proper UTC string (like in local) — convert to IST
                                                                dt = DateTime.fromISO(raw, { zone: "UTC" }).setZone("Asia/Kolkata");
                                                            } else {
                                                                // Mis-tagged IST (like in prod) — ignore Z and parse as IST
                                                                const cleaned = raw.replace("Z", "");
                                                                dt = DateTime.fromFormat(cleaned, "yyyy-MM-dd'T'HH:mm:ss.SSS", {
                                                                    zone: "Asia/Kolkata",
                                                                });

                                                                if (!dt.isValid) {
                                                                    dt = DateTime.fromFormat(cleaned, "yyyy-MM-dd'T'HH:mm:ss", {
                                                                        zone: "Asia/Kolkata",
                                                                    });
                                                                }
                                                            }

                                                            if (!dt.isValid) return "Invalid Date";

                                                            return dt.toFormat("hh:mm:ss a");
                                                        })()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
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

        const teamLogoUrl = team?.logo
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

                    <h1 className="text-2xl font-extrabold text-center mb-4">{team?.name || "Team Not Found"}</h1>


                    <p className="text-red-500  text-3xl mb-4 text-center">
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

        // Add before the return statement
        const team = teamSummaries.find((t) => Number(t.id) === Number(teamIdToShow));
        const totalSlots = Number(team?.team_squad) || 14;

        // Fill placeholders to match totalSlots - 1 (excluding topPlayer)
        const restWithPlaceholders = [
            ...restPlayers,
            ...Array(Math.max(0, totalSlots - 1 - restPlayers.length)).fill(null)
        ];


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
                    <h3 className="text-2xl  text-yellow-300 mb-3">#1 Most Expensive Player</h3>
                    <div className="text-center mb-4">
                        <h1 className="text-3xl font-extrabold">{topPlayer?.name || "No Player"}</h1>
                        <p className="text-yellow-200 text-sm">{topPlayer?.role || "Not Assigned"}</p>
                        <p className="text-2xl text-green-400  mt-2">
                            ₹{topPlayer?.sold_price?.toLocaleString() || "0"}
                        </p>
                    </div>
                    <img
                        src={
                            topPlayer?.profile_image
                                ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4,q-95,e-sharpen`
                                : "/no-image-found.png"
                        }
                        alt={topPlayer?.name || "No Player"}
                        className="w-[36rem] h-[36rem] object-cover rounded-2xl shadow-2xl"
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
                                        team?.logo
                                            ? `https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`
                                            : "/no-team-logo.png"
                                    }
                                    alt="Team Logo"
                                    className="w-36 h-36 object-contain animate-pulse"
                                />

                                <h3 className="text-xl  text-yellow-300 text-center mb-2 uppercase">{team.name} Squad</h3>
                            </>
                        )}
                    </div>
                    <div className="flex flex-row justify-between gap-4">
                        {[0, 1].map((groupIdx) => {
                            const playerGroup = restWithPlaceholders.length
                                ? restWithPlaceholders.slice(groupIdx * 7, groupIdx * 7 + 7)
                                : Array(7).fill(null);

                            return (
                                <div key={groupIdx} className="flex-1 flex flex-col space-y-4">
                                    {playerGroup.map((player, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center justify-between bg-white/10 border-l-4 pl-4 pr-6 py-3 rounded-xl shadow-lg backdrop-blur-sm border-white/20"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="text-2xl  text-yellow-300 w-8">#{groupIdx * 7 + idx + 2}</div>
                                                <img
                                                    src={
                                                        player?.profile_image
                                                            ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-80,h-80,fo-face,z-0.4,q-95,e-sharpen`
                                                            : "/no-image-found.png"
                                                    }
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = "/no-image-found.png";
                                                    }}
                                                    alt={player?.name || "No Player"}
                                                    className="w-14 h-14 rounded-full border border-white object-cover"
                                                />
                                                <div className="flex flex-col">
                                                    <div className=" text-white">{player?.name || "No Player"}</div>
                                                    <div className="text-sm text-yellow-100">{player?.role || "Not Assigned"}</div>
                                                </div>
                                            </div>
                                            <div className="text-xl  text-green-400">
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
                    <h1 className="text-4xl font-extrabold text-red-400 mb-4 animate-pulse">⚠️ No Sold Players</h1>
                    <p className="text-lg text-white/80">No player has been marked as SOLD yet. Please try again later.</p>
                </div>
            );
        }

        const getRankStyle = (rank) => {
            if (rank === 1) return 'bg-gradient-to-r from-yellow-600/30 to-yellow-300/10 border-yellow-400';
            if (rank === 2) return 'bg-gradient-to-r from-gray-500/30 to-gray-300/10 border-gray-400';
            if (rank === 3) return 'bg-gradient-to-r from-orange-600/30 to-orange-300/10 border-orange-400';
            return 'bg-white/10 border-white/20';
        };

        const getRankText = (rank) => {
            if (rank === 1) return 'text-yellow-300';
            if (rank === 2) return 'test-yellow-400';
            if (rank === 3) return 'text-orange-300';
            return 'text-yellow-100';
        };

        return (
            <div className="w-screen h-screen flex flex-row bg-black text-white relative overflow-hidden">
                <BackgroundEffect theme={theme} />

                {/* Left Panel */}
                <div className="flex flex-col justify-start w-2/3 p-6 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col items-center mb-4 animate-fadeIn">
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-24 h-24 object-contain mb-2 animate-pulse"
                            />
                        )}
                        <h2 className="text-3xl font-extrabold tracking-wider uppercase drop-shadow-md text-center">
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
                                            className={`flex items-center justify-between border-l-4 pl-4 pr-6 py-3 rounded-xl shadow-lg backdrop-blur-sm 
                                            ${getRankStyle(rank)} transform transition-all hover:scale-[1.03] hover:shadow-2xl animate-fadeIn`}
                                            style={{ animationDelay: `${rank * 0.1}s` }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`text-2xl  w-8 ${getRankText(rank)}`}>#{rank}</div>
                                                <img
                                                    src={player.profile_image
                                                        ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-90,h-90,fo-face,z-0.4,q-95,e-sharpen`
                                                        : "/no-image-found.png"}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                                                    className={`rounded-full border border-white object-cover 
                                                    ${rank <= 3 ? 'w-16 h-16 ring-2 ring-yellow-400' : 'w-14 h-14'}`}
                                                    alt={player.name}
                                                />
                                                <div className="flex flex-col">
                                                    <div className=" text-lg">{player.name}</div>
                                                    <div className="text-sm text-yellow-100">{team?.name || "Unknown"}</div>
                                                </div>
                                            </div>
                                            <div className="text-xl  text-green-400">
                                                ₹{player.sold_price?.toLocaleString()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Panel */}
                <div className="w-1/3 flex flex-col items-center justify-center p-6 bg-gradient-to-t from-black to-black-900 shadow-inner animate-fadeIn">
                    <h3 className="text-2xl  text-yellow-300 mb-3">🏅 Highest Bidded Player</h3>
                    <div className="text-center mb-4">
                        <h1 className="text-3xl font-extrabold">{topPlayer.name}</h1>
                        <p className="text-yellow-200 text-sm">{topTeam?.name}</p>
                        <p className="text-2xl text-green-400  mt-2">₹{topPlayer.sold_price?.toLocaleString()}</p>
                    </div>
                    <img
                        src={
                            topPlayer.profile_image
                                ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4,q-95,e-sharpen`
                                : "/no-image-found.png"
                        }
                        onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                        alt={topPlayer.name}
                        className="w-[36rem] h-[36rem] object-cover rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:shadow-3xl"
                    />
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
                    <h1 className="text-2xl  text-center mt-2">{tournamentName}</h1>
                </div>

                <h2 className="text-3xl  text-center py-5 text-white">📊 Team Statistics</h2>
                <div className="flex gap-2 items-start justify-center">
                    {[leftTeams, rightTeams].map((group, groupIdx) => (
                        <div key={groupIdx} className="flex flex-col w-auto max-w-[48%] overflow-hidden bg-white/10 border border-white/10 rounded-2xl px-10 py-6 backdrop-blur-sm shadow-xl">
                            {/* Header */}
                            <div className="grid grid-cols-4 gap-2 px-3 py-2  text-sm bg-gray-800 rounded-lg text-white">
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
                                    // const purse = Number(team.budget || 0); // Already updated in DB
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
                            <p>Contact <span className="text-yellow-300 ">Auction-Arena</span> for</p>
                            <p>seamless auction experience</p>
                        </div>
                        <div className="flex items-center justify-center gap-2 tracking-wider uppercase text-lg ">
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

    // if (!player) {
    //     return (

    //         // <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
    //         <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
    //             <BackgroundEffect theme={theme} />

    //             <div className="absolute inset-0 flex flex-row items-center justify-center h-screen px-6">

    //                 {/* Left Branding Panel */}
    //                 <div className="flex flex-col items-center justify-center text-left pr-10 gap-4 min-w-[420px] max-w-[440px]">
    //                     <img
    //                         src="/AuctionArena2.png"
    //                         alt="Auction Arena"
    //                         className="w-64 h-64 object-contain mb-2 animate-shake"
    //                     />
    //                     <div className="text-xl text-white text-center leading-snug">
    //                         <p>Contact <span className="text-yellow-300 ">Auction-Arena</span> for</p>
    //                         <p>seamless auction experience</p>
    //                     </div>
    //                     <div className="flex items-center justify-center gap-2 tracking-wider uppercase text-lg ">
    //                         <span className="text-pink-400 text-xl">📞</span>
    //                         <span>+91-9547652702</span>
    //                     </div>
    //                     <p className="text-sm text-white font-semibold italic">Sourav Mukherjee</p>
    //                 </div>

    //                 {/* 🔸 Pulse Divider Bar */}
    //                 <div className="w-[2px] h-[300px] bg-white/30 animate-pulse mx-8 rounded-full" />

    //                 {/* Center – Logo and Message */}
    //                 <div className="flex flex-col items-center justify-center gap-6 text-center animate-ring-explode">
    //                     {tournamentLogo && (
    //                         // <img
    //                         //     src={tournamentLogo}
    //                         //     alt="Tournament Logo"
    //                         //     className="w-64 h-64 object-contain animate-shake"
    //                         // />
    //                         <img
    //                             src="/bbplposter.png"
    //                             alt="BBPL Poster"
    //                             className="w-96 h-auto object-contain rounded-2xl"
    //                         />
    //                     )}

    //                     <div className="bg-white/10 border border-white/30 rounded-2xl px-10 py-6 backdrop-blur-sm shadow-2xl">
    //                         <p className="text-xl md:text-2xl font-extrabold text-white drop-shadow-md animate-typing">
    //                             Live auction will resume soon...
    //                         </p>
    //                     </div>
    //                 </div>

    //             </div>
    //         </div>
    //     );
    // }

    if (!player) {
        const midpoint = Math.ceil(teamSummaries.length / 2);
        const leftTeams = teamSummaries.slice(0, midpoint);
        const rightTeams = teamSummaries.slice(midpoint);

        const splitIntoPattern = (teams, pattern) => {
            const result = [];
            let index = 0;
            for (let size of pattern) {
                result.push(teams.slice(index, index + size));
                index += size;
            }
            return result;
        };

        const leftPattern = [3, 3, 2];  // 8 total
        const rightPattern = [3, 3, 2]; // 8 total

        const leftGrid = splitIntoPattern(leftTeams, leftPattern);
        const rightGrid = splitIntoPattern(rightTeams, rightPattern);

        return (
            <div className="w-screen h-screen relative overflow-hidden text-white p-4 border-8 border-yellow-400 rounded-[30px] box-border">

                {/* Layout */}
                <div className="absolute inset-0 z-10 flex items-center justify-between px-2 py-4 bg-black">
                    {/* Background particles */}
                    <BackgroundEffect theme={theme} />
                    {/* Left Logos: 3-3-2 */}
                    <div className="flex flex-col gap-6 items-center pl-2">
                        {leftGrid.map((row, i) => (
                            <div key={i} className="flex justify-center gap-2">
                                {row.map(team => (
                                    <div key={team.id} className="w-48 h-48 m-3">
                                        <img
                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                                            alt={team.name}
                                            className="w-full h-full object-contain rounded-full shadow-xl border-l-8 border-yellow-300"
                                            style={{ background: `url('/flame-ring.png') center/contain no-repeat` }}
                                        />

                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Center Info */}
                    <div className="flex flex-col items-center justify-center text-center px-1">
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                style={{
                                    width: '180px',
                                    height: '180px',
                                    objectFit: 'contain',
                                    marginBottom: '1rem',
                                    animation: 'pulse 2s infinite',
                                    filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.4))',
                                }}
                            />
                        )}
                        <h1
                            style={{
                                fontFamily: "'Orbitron', sans-serif",
                                fontWeight: 800,
                                fontSize: '4rem',
                                color: '#f87171',
                                letterSpacing: '0.15em',
                                textShadow: '2px 2px 10px rgba(255,0,0,0.4)',
                            }}
                        >
                            {tournamentName?.split(' ')[0] || 'TOURNAMENT'}
                        </h1>

                        <h2
                            style={{
                                fontFamily: "'Poppins', sans-serif",
                                fontWeight: 600,
                                fontSize: '1.5rem',
                                color: '#ffffff',
                                letterSpacing: '0.2em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {tournamentName?.split(' ').slice(1).join(' ') || ''}
                        </h2>

                        <h1 className="text-6xl md:text-8xl font-extrabold text-yellow-300 mb-4 drop-shadow-lg">
                            AUCTION
                        </h1>
                        <p
                            style={{
                                fontFamily: "'Poppins', sans-serif",
                                fontWeight: 600,
                                fontSize: '1.5rem',
                                color: '#ffffff',
                                marginTop: '1rem',
                                animation: 'pulse 2s infinite',
                            }}
                        >
                            {auctionDatetime
                                ? `TIME – ${new Date(auctionDatetime).toLocaleTimeString('en-IN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                })}`
                                : 'TIME – TBD'}
                        </p>

                        <div className="flex items-center justify-center gap-4 mb-6">
                            <div className="bg-red-600 text-white text-sm  px-4 py-2 rounded-full animate-pulse">
                                🔴 LIVE STREAMING
                            </div>
                            <img src="/hammer.png" alt="Gavel" className="w-10 h-10 object-contain" />
                            <img src="/AuctionArena2.png" alt="Auction Arena" className="w-20 h-20 object-contain" />
                        </div>

                        <div className="text-white text-xl bg-black/60 border border-white/30 px-6 py-2 rounded-lg tracking-widest font-semibold">
                            📅{" "}
                            {auctionDatetime
                                ? new Date(auctionDatetime).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                }).toUpperCase()
                                : 'TBD'}

                        </div>
                    </div>

                    {/* Right Logos: 2-3-3 (mirror layout) */}
                    <div className="flex flex-col gap-6 items-center pr-2">
                        {rightGrid.map((row, i) => (
                            <div key={i} className="flex justify-center gap-4">
                                {row.map(team => (
                                    <div key={team.id} className="w-48 h-48 m-3">
                                        <img
                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
                                            alt={team.name}
                                            className="w-full h-full object-contain rounded-full shadow-xl border-r-8 border-yellow-300"
                                            style={{ background: `url('/flame-ring.png') center/contain no-repeat` }}
                                        />

                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <footer className="absolute bottom-0 left-0 w-full text-center text-white text-sm bg-black/80 border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
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
        (!highestBid || Number(highestBid) === 0) &&
        !player?.secret_bidding_enabled;





    // Live Auction view

    return (
        // <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} overflow-hidden relative`}>
        <div className="w-screen h-screen relative overflow-hidden bg-black text-white">
            {/* Background Layer – Particle Animation */}
            <BackgroundEffect theme={theme} />

            <div className="flex items-center justify-between px-6 py-4">
                {/* Left: Auction Arena Logo */}
                <img
                    src="/AuctionArena2.png"
                    alt="Auction Arena"
                    className="w-20 h-20 object-contain animate-pulse"
                />
                <h1 className="text-4xl font-extrabold tracking-wide text-center flex-1 animate-pulse">
                    {tournamentName?.toUpperCase() || "AUCTION ARENA LIVE"}-AUCTION <span animate-pulse>🔴 LIVE</span>
                </h1>
                {tournamentLogo && (
                    <img
                        src="/AuctionArena2.png"
                        alt="Auction Arena"
                        className="w-20 h-20 object-contain ml-4 animate-pulse"
                    />
                )}
            </div>

            <div
                key={player.id}
                className={`flex h-[calc(100%-120px)] px-12 pt-6 pb-10 gap-2 transition-opacity duration-700 ${!isLoading ? 'opacity-100 animate-fade-in' : 'opacity-0'}`}
            >
                <div className="w-1/2 flex flex-col items-center justify-center relative">
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
                        className="w-[48rem] h-[56rem] object-cover rounded-2xl"
                    />
                </div>

                <div className="w-1/3 flex flex-col justify-center items-center space-y-8">
                    {["TRUE", "true", true].includes(player?.sold_status) && (
                        <div className="bg-black/60 backdrop-blur-lg shadow-xl rounded-2xl w-full max-w-md mx-auto">
                            {/* Team Logo */}
                            <div className="flex justify-center">
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${teamLogoId}?`}
                                    alt={teamName}
                                    className="w-[20rem] h-[20rem] object-contain animate-bounce-in drop-shadow-lg"
                                />
                            </div>

                            {/* Team Name */}
                            <p className="text-2xl  text-center mt-2 text-white uppercase tracking-wide">
                                {teamName}
                            </p>

                            {/* Sold Amount */}
                            <div className="bg-green-500/20 border border-yellow-400/30 rounded-xl px-4 py-2 text-center mt-4 animate-pulse">
                                <p className="text-lg uppercase tracking-wider  text-white-300 drop-shadow-sm">
                                    🎉 Sold Amount: ₹{player.sold_price.toLocaleString()}
                                </p>
                            </div>

                            {/* Players Bought & Max Bid Allowed */}
                            {team?.bought_count !== undefined && team?.max_bid_allowed !== undefined && (
                                <div className="grid grid-cols-2 divide-x divide-white/20 rounded-xl border border-white/20 overflow-hidden mt-4">
                                    <div className="flex flex-col items-center py-3 bg-black/40">
                                        <p className="text-xs test-yellow-400 uppercase tracking-wider">Players Bought</p>
                                        <p className="text-xl  text-white">
                                            🧑‍🤝‍🧑 {team.bought_count} / {CONFIG.PLAYERS_PER_TEAM || 14}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center py-3 bg-black/40">
                                        <p className="text-xs test-yellow-400 uppercase tracking-wider">Max Bid Allowed</p>
                                        <p className="text-xl  text-green-400">
                                            🚀 ₹{team.max_bid_allowed.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            )}
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
                                <p className="text-2xl text-yellow-300  animate-pulse">
                                    Waiting for a Bid...
                                </p>
                            </div>
                        ) : (
                            <>

                                {(() => {
                                    const leadingTeamObj = Array.isArray(teamSummaries)
                                        ? teamSummaries.find(t => t.name?.trim() === leadingTeam?.trim())
                                        : null;

                                    const leadingTeamLogo = leadingTeamObj?.logo;
                                    const leadingTeamName = leadingTeamObj?.name;



                                    return (
                                        <div className="bg-white-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 text-center justify-center">
                                            <p className="text-2xl uppercase tracking-wider  drop-shadow-sm">Leading Team</p>

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

                                <div className="bg-green-600/60 backdrop-blur-md shadow-lg rounded-xl px-6 py-4 border border-white-400/30 text-center justify-center">
                                    <p className="text-lg uppercase text-green-bold">Current Bid</p>
                                    <p className="text-4xl uppercase text-green-bold animate-pulse">
                                        ₹{(highestBid || 0).toLocaleString()}
                                    </p>
                                </div>

                                <div>
                                    {/* 👇 Secret Bidding Flag Message */}
                                    {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) &&
                                        player?.secret_bidding_enabled && (
                                            <p className="text-2xl mt-4 text-yellow-300  animate-pulse">
                                                Secret Bidding In Progress...
                                            </p>
                                        )}
                                </div>

                            </>
                        )
                    )}


                    {["FALSE", "false", false].includes(player?.sold_status) && unsoldClip && (
                        <div className="relative w-[20rem] h-[20rem] px-4">
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

                            <div className="bg-red-500/20 border border-yellow-400/30 rounded-xl px-4 py-2 text-center mt-4 animate-pulse">
                                <p className="text-lg uppercase tracking-wider  text-white-300 drop-shadow-sm">
                                    UNSOLD
                                </p>
                            </div>
                        </div>
                    )}


                </div>

                <div className="w-1/3 flex flex-col justify-center items-center space-y-10">
                    {/* <div>
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament Logo"
                                className="w-[20rem] h-[20rem] object-contain animate-shake"
                            />
                        )}
                    </div> */}
                    <div
                        className="relative shadow-lg rounded-xl overflow-hidden border border-white/20 text-sm"
                        style={{
                            backgroundImage: `url('/backdrop11.jpg')`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    >
                        {/* Dark overlay */}
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>

                        {/* Content above overlay */}
                        <div className="relative grid grid-cols-2 divide-x divide-y divide-white/20 text-2xl font-orbitron">
                            <div className="px-3 py-2 tracking-wider uppercase">Serial No</div>
                            <div className="px-3 py-2 ">{player.auction_serial}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">Name</div>
                            <div className="px-3 py-2  uppercase">{player.name}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">Nick Name</div>
                            <div className="px-3 py-2  uppercase">{player.nickname || "-"}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">Role</div>
                            <div className="px-3 py-2  uppercase">{player.role}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">Batting-hand</div>
                            <div className="px-3 py-2  uppercase">{player.batting_hand || "-"}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">Bowling-hand</div>
                            <div className="px-3 py-2  uppercase">{player.bowling_hand || "-"}</div>

                            <div className="px-3 py-2 tracking-wider uppercase">District</div>
                            <div className="px-3 py-2  uppercase">{player.district || "-"}</div>
                        </div>
                    </div>


                    {cricheroesStats && (
                        <div className="bg-black/50 backdrop-blur-lg shadow-lg rounded-xl overflow-hidden border border-white/20 text-sm mt-4">
                            <div className="grid grid-cols-2 divide-x divide-y divide-white/20 text-2xl">
                                <div className="px-3 py-2 test-yellow-400">Matches</div>
                                <div className="px-3 py-2  text-white">{cricheroesStats?.matches || "-"}</div>

                                <div className="px-3 py-2 test-yellow-400">Runs</div>
                                <div className="px-3 py-2  text-white">{cricheroesStats?.runs || "-"}</div>

                                <div className="px-3 py-2 test-yellow-400">Wickets</div>
                                <div className="px-3 py-2  text-white">{cricheroesStats?.wickets || "-"}</div>
                            </div>
                        </div>
                    )}



                    {/* Base Price Section */}
                    <div className="mt-2 bg-yellow-500/20 border border-yellow-400/30 rounded-xl px-6 py-2 text-center text-2xl">
                        <p className="text-yellow-300">Base Price</p>
                        <p className=" tracking-wider uppercase">₹{(player.base_price || 0).toLocaleString()}</p>
                    </div>


                </div>


            </div>

            {tournamentLogo && (
                <img
                    src={tournamentLogo}
                    alt="Tournament Logo"
                    className="w-16 h-16 object-contain absolute bottom-12 right-4 opacity-70"
                />
            )}

            <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black animate-pulse z-50 py-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>

        </div>
    );
};

export default SpectatorLiveDisplay;