import React, { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { useParams } from "react-router-dom";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import Lottie from "lottie-react";
import { io } from "socket.io-client";


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
    '/sounds/unsold.mp4',
    '/sounds/unsold2.gif',
    '/sounds/unsold3.gif'
];

const unsoldAudio = new Audio('/sounds/unsold4.mp3');


const SpectatorLiveDisplay = ({ highestBid, leadingTeam }) => {
    const [player, setPlayer] = useState(null);
    const [teamSummaries, setTeamSummaries] = useState([]);
    const { width, height } = useWindowSize();
    const [customMessage, setCustomMessage] = useState(null);
    const [teamIdToShow, setTeamIdToShow] = useState(null);
    const [playerList, setPlayerList] = useState([]);
    const [unsoldClip, setUnsoldClip] = useState(null);
    const [customView, setCustomView] = useState(null);
    const [theme, setTheme] = useState('default');

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
        if (["TRUE", "true", true].includes(playerData?.sold_status)) {
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

    const fetchPlayer = async () => {
  try {
    const res = await fetch(`${API}/api/current-player`);

    let basic = null;
    if (res.ok) {
      const text = await res.text();
      if (text) {
        basic = JSON.parse(text);
      }
    }

    if (!basic?.id) {
      setPlayer(null); // Show "Live Auction Starts soon..."
      setUnsoldClip(null); // Clear previous clip
      return;
    }

    const fullRes = await fetch(`${API}/api/players/${basic.id}`);
    const fullPlayer = await fullRes.json();
    fullPlayer.base_price = computeBasePrice(fullPlayer);
    setPlayer(fullPlayer);

    fetchTeams(); // Refresh team stats live

    // 🎉 SOLD animation/sound
    triggerConfettiIfSold(fullPlayer);

    // ❌ UNSOLD logic
    if (["FALSE", "false", false].includes(fullPlayer?.sold_status)) {
      try {
        unsoldAudio.volume = 1.0;
        unsoldAudio.currentTime = 0;
        unsoldAudio.play().catch(err => {
          console.warn("Autoplay blocked for UNSOLD:", err);
        });

        const randomClip = unsoldMedia[Math.floor(Math.random() * unsoldMedia.length)];
        setUnsoldClip(randomClip);
      } catch (e) {
        console.error("UNSOLD audio error:", e);
      }
    } else {
      setUnsoldClip(null); // Reset if not UNSOLD
    }

  } catch (err) {
    console.error("Failed to fetch full player info", err);
    setPlayer(null);
    setUnsoldClip(null);
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

        if (["TRUE", "true", true].includes(player.sold_status)) {
            console.log("🎉 SOLD player rendered (via useEffect):", player.name);

            const duration = 3000;
            const end = Date.now() + duration;

            const frame = () => {
                confetti({ particleCount: 10, angle: 60, spread: 100, origin: { x: 0 } });
                confetti({ particleCount: 10, angle: 120, spread: 100, origin: { x: 1 } });
                confetti({ particleCount: 10, angle: 270, spread: 100, origin: { y: 0 } });
                confetti({ particleCount: 10, angle: 90, spread: 100, origin: { y: 1 } });
                if (Date.now() < end) requestAnimationFrame(frame);
            };

            setTimeout(() => {
                frame();
            }, 100); // Ensures DOM is painted
        }
    }, [player?.id]);


    useEffect(() => {
        fetchPlayer();
        fetchTeams();
        fetchTournament();
        fetchAllPlayers();

        const socket = io(API);

        socket.on("playerSold", () => setTimeout(fetchPlayer, 100));
        socket.on("playerChanged", () => setTimeout(fetchPlayer, 100));
        socket.on("customMessageUpdate", (msg) => setCustomMessage(msg));

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
            .then(data => setCustomMessage(data.message));
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
                <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} p-6 overflow-hidden flex flex-col items-center justify-start relative animate-fade-in-up`}>
                {teamLogoUrl && (
                    <img
                        src={teamLogoUrl}
                        alt={team.name}
                        className="w-14 h- object-contain mb-2 rounded-xl border border-white shadow-md"
                    />
                    
                )}
                <h1 className="text-2xl font-extrabold text-center mb-4">{team.name}</h1>
                <div>
                    <p className="text-red-500 font-bold text-3xl mb-4 items-center justify-center">
                        {customMessage || "No players yet!"}
                    </p>
                </div>
                {/* TOURNAMENT LOGO (BOTTOM RIGHT) */}
                {tournamentLogo && (
                    <img
                        src={tournamentLogo}
                        alt="Tournament Logo"
                        className="w-16 h-16 object-contain absolute bottom-12 right-4 opacity-70"
                    />
                )}

                {/* LIVE AUCTION FOOTER */}
                <div className="text-center text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse absolute bottom-0 w-full py-1">
                    🔴 LIVE AUCTION | Powered by Auction Arena 🧨
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
            <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} p-6 overflow-hidden flex flex-col items-center justify-start relative
             animate-fade-in-up`}>
                {/* TEAM LOGO */}
                {teamLogoUrl && (
                    <img
                        src={teamLogoUrl}
                        alt={team.name}
                        className="w-14 h- object-contain mb-2 rounded-xl border border-white shadow-md"
                    />
                )}

                {/* SQUAD TITLE */}
                <h1 className="text-2xl font-extrabold text-center mb-4">{team.name}</h1>

                {/* PLAYER GRID */}
                <div className="grid grid-cols-5 gap-4 justify-center flex-1">
                    {teamPlayers.map((player, idx) => (
                        <div
                            key={idx}
                            className="text-center"
                        >
                            <img
                            src={
                                player.profile_image
                                ? `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-300,h-300,fo-face,z-0.4`
                                : "/no-image-found.png"
                            }
                            alt={player.name}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "/no-image-found.png";
                            }}
                            className="w-24 h-24 object-cover rounded-full mx-auto mb-2 border-2 border-white"
                            />
                            <p className="text-lg font-bold">{player.name}</p>
                            <p className="text-sm text-gray-300">{player.role}</p>
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

                {/* LIVE AUCTION FOOTER */}
                <div className="text-center text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse absolute bottom-0 w-full py-1">
                    🔴 LIVE AUCTION | Powered by Auction Arena 🧨
                </div>
            </div>
        );
    }


    if (!player) {
        return (

            <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
                <div>
                    {tournamentLogo && (
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-64 h-64 object-contain animate-shake"
                        />
                    )}
                </div>
                <div className="animate-pulse">
                    Live Auction Starts soon...
                </div>
                <div className="text-center text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse absolute bottom-0 w-full py-1">
                    🔴 LIVE AUCTION | Powered by Auction Arena 🧨
                </div>
            </div>
        );
    }

    const team = teamSummaries?.find(t => t.id === Number(player.team_id));
    const teamName = team?.name || leadingTeam || "Unknown";
    const teamLogoId = team?.logo;

    return (
        customMessage ? (
            <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} text-5xl font-extrabold text-center px-10`}>
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

        ) : (
            <div className={`w-screen h-screen bg-gradient-to-br ${THEMES[theme].bg} ${THEMES[theme].text} overflow-hidden relative`}>

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
                    key={player.id} // forces re-render
                    className="flex h-[calc(100%-120px)] px-12 pt-6 pb-10 gap-6 animate-fade-in-up"
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
                            className="w-96 h-96 object-cover rounded-3xl border-4 border-white shadow-2xl"
                        />
                        <h1 className="text-2xl font-extrabold mt-6">{player.name}</h1>
                        <p className="text-xl font-bold mt-2">({player.nickname || "-"})</p>
                    </div>

                    <div className="w-1/3 flex flex-col justify-center items-center space-y-8">
                        <div>
                            {tournamentLogo && (
                                <img
                                    src={tournamentLogo}
                                    alt="Tournament Logo"
                                    className="w-64 h-64 object-contain animate-shake"
                                />
                            )}
                        </div>

                        <div className="bg-purple-800 rounded-xl shadow-lg uppercase w-full text-center text-yellow-200">
                            <p className="text-sm font-bold">Serial No: {player.auction_serial}</p>
                            <p className="text-sm font-bold">Role: {player.role}</p>
                            <p className="text-sm font-bold">Batting-hand: {player.batting_hand || "NA"}</p>
                            <p className="text-sm font-bold">Bowling-hand: {player.bowling_hand || "NA"}</p>
                            <p className="text-sm font-bold">District: {player.district || "-"}</p>


                        </div>
                        <div className="bg-purple-800 px-5 py-2 rounded-xl shadow-lg w-full text-center">
                            <p className="text-sm uppercase text-yeimallow-300">Base Price</p>
                            <p className="text-sm font-bold text-yellow-200">
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
                                <p className="text-xl font-bold text-center">{teamName}</p>
                                <div className="bg-green-700 px-6 py-3 rounded-lg shadow-lg text-center mt-2">
                                    <p className="text-xl font-bold text-white">
                                      🎉 Sold Amount: ₹{player.sold_price.toLocaleString()}
                                    </p>
                                {team?.bought_count !== undefined && team?.max_bid_allowed !== undefined && (
                                <div>
                                    <p className="text-xl font-bold text-white">
                                    🧑‍🤝‍🧑 Players Bought: {team.bought_count} / {CONFIG.PLAYERS_PER_TEAM || 14}
                                    </p>
                                    <p className="text-xl font-bold text-white">
                                    🚀 Max Bid Allowed: ₹{team.max_bid_allowed.toLocaleString()}
                                    </p>
                                </div>
                                )}
                                </div>
                            </div>
                        )}

                        {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) && (
                            <>
                                <div className="bg-purple-900 px-10 py-6 rounded-xl shadow-xl w-full text-center">
                                    <p className="text-lg uppercase text-green-300">Current Bid</p>
                                    <p className="text-4xl font-extrabold text-green-400">
                                        ₹{(highestBid || 0).toLocaleString()}
                                    </p>
                                </div>
                                {(() => {
                                    const leadingTeamObj = teamSummaries.find(t => t.name?.trim() === leadingTeam?.trim());
                                    const leadingTeamLogo = leadingTeamObj?.logo;
                                    return (
                                        <div className="bg-purple-900 px-10 py-6 rounded-xl shadow-xl w-full text-center">
                                        <p className="text-lg uppercase text-blue-300">Leading Team</p>
                                        {leadingTeamLogo && (
                                            <img
                                            src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${leadingTeamLogo}?tr=w-40,h-40`}
                                            alt={leadingTeamObj.name}
                                            className="mx-auto mb-2 rounded-full w-15 h-15 object-contain inline-block align-middle"
                                            />
                                        )}
                                        <span className="text-xl font-bold ml-2 align-middle inline-block">
                                            {leadingTeam || "—"}
                                        </span>
                                        </div>
                                    );
                                    })()}

                            </>
                        )}

                        {["FALSE", "false", false].includes(player?.sold_status) && unsoldClip && (
                            <div className="relative w-full px-4">
                                {unsoldClip.endsWith('.mp4') ? (
                                    <video
                                        src={unsoldClip}
                                        autoPlay
                                        muted
                                        playsInline
                                        loop
                                        className="w-full rounded-xl border-4 shadow-xl"
                                    />
                                ) : (
                                    <img
                                        src={unsoldClip}
                                        alt="UNSOLD Reaction"
                                        className="w-full rounded-xl shadow-xl object-cover"
                                    />
                                )}
                            </div>
                        )}

                    </div>
                </div>

                <footer className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                </footer>
            </div>
        ));
};

export default SpectatorLiveDisplay;