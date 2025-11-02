import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import { io } from "socket.io-client";
import PlayerCard from "../components/PlayerCard";



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
    // '/sounds/unsold.mp4',
    // '/sounds/unsold2.gif',
    '/sounds/unsold3.gif',
    '/sounds/unsold5.gif',
    '/sounds/unsold6.gif',
    '/sounds/unsold7.gif'
];

const unsoldAudio = new Audio('/sounds/unsold4.mp3');

const SpectatorLiveDisplay = () => {
    const [highestBid, setHighestBid] = useState(0);
    const [leadingTeam, setLeadingTeam] = useState("");
    const [player, setPlayer] = useState(null);
    const [teamSummaries, setTeamSummaries] = useState([]);
    const { width, height } = useWindowSize();
    const [customMessage, setCustomMessage] = useState(null);
    const [teamIdToShow, setTeamIdToShow] = useState(null);
    const [playerList, setPlayerList] = useState([]);
    const [unsoldClip, setUnsoldClip] = useState(null);
    const [customView, setCustomView] = useState(null);
    const [theme, setTheme] = useState('default');
    const [tournamentName, setTournamentName] = useState("Loading Tournament...");
    const [tournamentLogo, setTournamentLogo] = useState("");
    const [secretBidActive, setSecretBidActive] = useState(false);
    const { tournamentSlug } = useParams();
    const [cricheroesStats, setCricheroesStats] = useState(null);



    useEffect(() => {
        document.title = "Live2 | Auction Arena";
    }, []);

    useEffect(() => {
        fetch(`${API}/api/theme`)
            .then(res => res.json())
            .then(data => setTheme(data.theme || "default"));

        const socket = io(API);
        socket.on("themeUpdate", (newTheme) => setTheme(newTheme));
        return () => socket.disconnect();
    }, []);

    const [tournamentId, setTournamentId] = useState(null);

    useEffect(() => {
        const fetchTournamentId = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();
                if (res.ok && data?.id) {
                    setTournamentId(data.id);
                } else {
                    console.error("❌ Tournament not found for slug:", tournamentSlug);
                }
            } catch (err) {
                console.error("❌ Error fetching tournament by slug:", err);
            }
        };

        fetchTournamentId();
    }, [tournamentSlug]);


    const computeBasePrice = (player) => {
        if (player.base_price && player.base_price > 0) return player.base_price;
        const map = { A: 1700, B: 3000, C: 5000 };
        return map[player.base_category] || 0;
    };

    const triggerConfettiIfSold = (playerData) => {
        if (["TRUE", "true", true].includes(playerData?.sold_status)) {
            // if (currentSoldAudio) {
            //     currentSoldAudio.pause();
            //     currentSoldAudio.currentTime = 0;
            // }

            // const selectedSrc = getRandomSoldAudio();
            // currentSoldAudio = new Audio(selectedSrc);
            // currentSoldAudio.volume = 1.0;
            // currentSoldAudio.play().catch(err => console.warn("Autoplay prevented:", err));

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
            }, 100);
        }
    };

    const fetchPlayer = async () => {
        try {
            const teamsRes = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
            let teams = [];
            try {
                const text = await teamsRes.text();
                teams = JSON.parse(text);
                if (!Array.isArray(teams)) {
                    console.error("❌ Expected an array for teams, got:", teams);
                    teams = [];
                }
            } catch (e) {
                console.error("❌ Failed to parse teams JSON:", e);
                teams = [];
            }
            setTeamSummaries(teams);

            const playerRes = await fetch(`${API}/api/current-player?tournament_id=${tournamentId}`);
            const basic = await playerRes.json();

            if (!basic?.id) {
                setPlayer(null);
                setCricheroesStats(null);
                setUnsoldClip(null);
                return;
            }

            const fullRes = await fetch(`${API}/api/players/${basic.id}`);
            const fullPlayer = await fullRes.json();
            fullPlayer.base_price = computeBasePrice(fullPlayer);

            const team = teams.find(t => t.id === fullPlayer.team_id);
            if (team) {
                fullPlayer.team_name = team.name;
                fullPlayer.team_logo = team.logo;
            }

            setPlayer(fullPlayer);
            setSecretBidActive(fullPlayer?.secret_bidding_enabled === true);
            triggerConfettiIfSold(fullPlayer);

            // 🔹 Fetch Cricheroes stats if ID exists
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
            console.error("❌ Error in fetchPlayer", err);
            setPlayer(null);
            setCricheroesStats(null);
            setUnsoldClip(null);
        }
    };



    const fetchAllPlayers = async () => {
        try {
            const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const data = await res.json();
            setPlayerList(data);
        } catch { }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
            const data = await res.json();
            setTeamSummaries(data);
        } catch { }
    };

    const fetchTournament = async () => {
        try {
            const res = await fetch(`${API}/api/tournaments/${tournamentId}`);
            const data = await res.json();
            setTournamentName(data.title || "AUCTION ARENA LIVE");
            if (data.logo) {
                setTournamentLogo(`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${data.logo}?tr=h-300,w-300,fo-face,z-0.4`);
            }
        } catch {
            setTournamentName("AUCTION ARENA LIVE");
        }
    };


    useEffect(() => {
        if (!tournamentId) return;

        // Initial light fetches
        fetchPlayer();
        fetchTeams();
        fetchTournament();
        fetchAllPlayers();

        // One resilient, WebSocket-only connection (like Spectator4)
        const socket = io(API, {
            transports: ["websocket"],
            upgrade: false,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 500,
        });

        const fastRefresh = () => {
            // Only cheap aggregates; no need to block UI
            fetchAllPlayers();
            fetchTeams();
        };

        // 🔴 Live bid updates (optimistic)
        const onBidUpdated = ({ bid_amount, team_name }) => {
            setHighestBid(Number(bid_amount) || 0);
            setLeadingTeam(team_name || "");
        };
        socket.on("bidUpdated", onBidUpdated);

        // ✅ SOLD committed (optimistic apply to the *visible* player)
        const onSaleCommitted = (payload) => {
            const t = Array.isArray(teamSummaries)
                ? teamSummaries.find(x => Number(x.id) === Number(payload?.team_id))
                : null;

            const resolvedName =
                (payload?.team_name && payload.team_name.trim()) ||
                t?.name ||
                t?.display_name ||
                (t?.team_number ? `Team #${t.team_number}` : "");

            const resolvedLogo = t?.logo;

            setPlayer(prev =>
                prev && Number(prev.id) === Number(payload?.player_id)
                    ? {
                        ...prev,
                        sold_status: "TRUE",
                        sold_price: payload?.sold_price ?? prev.sold_price,
                        team_id: payload?.team_id ?? prev.team_id,
                        sold_pool: payload?.sold_pool ?? prev.sold_pool,
                        team_name: resolvedName,   // ← ensure SOLD badge shows correct name
                        team_logo: resolvedLogo,   // ← optional, helps PlayerCard logos
                    }
                    : prev
            );

            setHighestBid(Number(payload?.sold_price) || 0);
            setLeadingTeam(resolvedName || "");
            fastRefresh();
        };

        socket.on("saleCommitted", onSaleCommitted);

        // 🟠 If your Admin emits "playerSold" immediately (it does), mirror the same optimistic update
        const onPlayerSold = (payload) => onSaleCommitted(payload);
        socket.on("playerSold", onPlayerSold);

        // 🚫 UNSOLD (optimistic: clear team & sold_price locally)
        const onPlayerUnsold = ({ player_id, sold_pool }) => {
            setPlayer(prev =>
                prev && Number(prev.id) === Number(player_id)
                    ? { ...prev, sold_status: "FALSE", team_id: null, sold_price: 0, sold_pool: sold_pool ?? prev.sold_pool }
                    : prev
            );
            setHighestBid(0);
            setLeadingTeam("");
            fastRefresh();
        };
        socket.on("playerUnsold", onPlayerUnsold);

        // ⏭️ Next player / player change (paint first, then light refreshes)
        const onPlayerChanged = (payload) => {
            setPlayer(prev => ({ ...(prev || {}), ...payload }));
            setHighestBid(0);
            setLeadingTeam("");
            fastRefresh();
        };
        socket.on("playerChanged", onPlayerChanged);

        // Theme + custom message + secret-bid toggle
        socket.on("themeUpdate", (newTheme) => setTheme(newTheme || "default"));
        socket.on("customMessageUpdate", (msg) => setCustomMessage(msg));
        socket.on("secretBiddingToggled", () => {
            fetch(`${API}/api/current-player?tournament_id=${tournamentId}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data?.secret_bidding_enabled !== undefined) {
                        setSecretBidActive(data.secret_bidding_enabled === true);
                    }
                })
                .catch(() => { });
        });

        return () => {
            socket.off("bidUpdated", onBidUpdated);
            socket.off("saleCommitted", onSaleCommitted);
            socket.off("playerSold", onPlayerSold);
            socket.off("playerUnsold", onPlayerUnsold);
            socket.off("playerChanged", onPlayerChanged);
            socket.off("themeUpdate");
            socket.off("customMessageUpdate");
            socket.off("secretBiddingToggled");
            socket.disconnect();
        };
    }, [tournamentId]);


    const team = Array.isArray(teamSummaries)
        ? teamSummaries.find(t => t.id === Number(player?.team_id))
        : null;
    const isSold = ["TRUE", "true", true].includes(player?.sold_status);
    const isUnsold = ["FALSE", "false", false].includes(player?.sold_status);

    return (
        <div className="relative w-screen h-screen">
            {player && player.profile_image && (
                <PlayerCard
                    player={{
                        ...player,
                        team_name:
                            player?.team_name ||
                            team?.name ||
                            team?.display_name ||
                            (team?.team_number ? `Team #${team.team_number}` : ""),
                        team_logo: player?.team_logo || team?.logo,
                    }}
                    isSold={isSold}
                    isUnsold={isUnsold}
                    soldPrice={player?.sold_price}
                    currentBid={highestBid}
                    biddingTeam={leadingTeam}
                    biddingTeamLogo={
                        Array.isArray(teamSummaries)
                            ? teamSummaries.find(t => t.name?.trim() === leadingTeam?.trim())?.logo
                            : undefined
                    }
                    secretBidActive={secretBidActive}
                />
            )}


            {cricheroesStats && (
                <div style={{ position: "absolute", top: 20, right: 20, background: "#0008", padding: "10px", borderRadius: "8px", color: "#fff" }}>
                    <p>Matches: {cricheroesStats.matches}</p>
                    <p>Runs: {cricheroesStats.runs}</p>
                    <p>Wickets: {cricheroesStats.wickets}</p>
                </div>
            )}

        </div>
    );

};

export default SpectatorLiveDisplay;
