import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import { slugsMatch } from '../utils/slugUtils';
import { io } from "socket.io-client";
import PlayerCard3 from "../components/PlayerCard3";
import "../App.css";


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
const soldOverlayClip = "/balle2.gif";
const unsoldOverlayClip = "/kohliunsold.gif";

// Helper: format rupees into lakhs-friendly text for compact bidder info
const formatLakhs = (amt) => {
    const n = Number(amt) || 0;
    if (n === 0) return "0";
    if (n < 1000) return String(n);

    if (n >= 100000) {
        const lakhs = n / 100000;
        const str = (Number.isInteger(lakhs) ? lakhs.toFixed(0) : lakhs.toFixed(2)).replace(/\.0$/, "");
        return `${str} ${parseFloat(str) === 1 ? "lakh" : "lakhs"}`;
    }

    const thousands = n / 1000;
    const str = (Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(2)).replace(/\.0$/, "");
    return `${str}k`;
};

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
    const [totalPlayersToBuy, setTotalPlayersToBuy] = useState(0);
    const [showPurse, setShowPurse] = useState(false);
    const [showMaxBid, setShowMaxBid] = useState(false);
    const [showPlayersToBuy, setShowPlayersToBuy] = useState(false);
    const [showActiveBidders, setShowActiveBidders] = useState(false);
    const [activeBidders, setActiveBidders] = useState([]);
    const { tournamentSlug } = useParams();
    const [cricheroesStats, setCricheroesStats] = useState(null);
    const lastConfettiPlayerId = useRef(null);
    const [viewPlayer, setViewPlayer] = useState(null); // drives the visible card for animations
    const [animClass, setAnimClass] = useState("");     // 'pop-out' or 'pop-in'
    const [animTick, setAnimTick] = useState(0); // bumps to force remount+animation
    const confettiRafRef = useRef(null);
    const playerStatusRef = useRef(new Map()); // id -> "TRUE" | "FALSE"
    const confettiBlockRef = useRef(true); // when true, refuse to start confetti
    const [soldOverlayActive, setSoldOverlayActive] = useState(false);
    const soldOverlayTimerRef = useRef(null);
    const [unsoldOverlayActive, setUnsoldOverlayActive] = useState(false);
    const unsoldOverlayTimerRef = useRef(null);



    // Normalize SOLD/UNSOLD coming as "TRUE"/"true"/true/etc.
    const normSoldFlag = (v) => {
        if (typeof v === "string") return v.trim().toUpperCase();
        if (v === true) return "TRUE";
        if (v === false) return "FALSE";
        return "";
    };
    const isSoldFlag = (v) => normSoldFlag(v) === "TRUE";
    const isUnsoldFlag = (v) => normSoldFlag(v) === "FALSE";


    const marqueeItems = useMemo(() => {
        if (!Array.isArray(playerList) || !Array.isArray(teamSummaries)) return [];

        return playerList
            .filter(p => ["TRUE", "true", true, "FALSE", "false", false].includes(p?.sold_status))
            .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)) // latest first
            .map((p, idx) => {
                const t = teamSummaries.find(tt => Number(tt.id) === Number(p.team_id));
                const teamName =
                    p?.team_name ||
                    t?.name ||
                    t?.display_name ||
                    (t?.team_number ? `Team #${t.team_number}` : "");

                return {
                    id: Number(p.id),
                    serial: p.auction_serial,
                    name: p?.name || "-",
                    team: teamName || "-",
                    status: String(p?.sold_status).toUpperCase(), // "TRUE" | "FALSE"
                    sold_price: Number(p?.sold_price) || 0,
                    isLatest: idx === 0,
                };
            });
    }, [playerList, teamSummaries]);




    useEffect(() => {
        document.title = "Live5 | Auction Arena";
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const slugQuery = tournamentSlug ? `?slug=${encodeURIComponent(tournamentSlug)}` : "";
        const applyTheme = (value) => {
            if (typeof value === "string") {
                const trimmed = value.trim();
                if (trimmed.length > 0) {
                    setTheme(trimmed);
                    return;
                }
            }
            setTheme("default");
        };

        fetch(`${API}/api/theme${slugQuery}`, { signal: controller.signal })
            .then(res => res.json())
            .then(data => applyTheme(data?.theme))
            .catch(() => { });

        return () => controller.abort();
    }, [tournamentSlug]);


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

    const animatePlayerSwap = (next) => {
        // Helper: reliably restart "pop-in"
        const playPopIn = () => {
            setAnimClass("");                 // clear current class
            requestAnimationFrame(() => {     // next frame: add it back
                setAnimClass("pop-in");
                setAnimTick((t) => t + 1);      // force a remount so CSS replays
            });
        };

        // First render
        if (!viewPlayer) {
            setViewPlayer(next);
            playPopIn();
            return;
        }

        // Same id arriving again → still show a pop-in
        if (Number(viewPlayer?.id) === Number(next?.id)) {
            setViewPlayer(next);
            playPopIn();
            return;
        }

        // Different player → pop-out old, then pop-in new
        setAnimClass("pop-out");
        setTimeout(() => {
            setViewPlayer(next);
            playPopIn();
        }, 900);
    };



    const MIN_BASE_PRICE = 1700;
    const computeBasePrice = (player) => {
        if (player.base_price && player.base_price > 0) return player.base_price;
        const map = { A: 1700, B: 3000, C: 5000 };
        return map[player.base_category] || 0;
    };

    const computeTeamFinancials = (teamObj) => {
        if (!teamObj) return null;
        const teamPlayers = (playerList || []).filter(
            (p) =>
                Number(p.team_id) === Number(teamObj.id) &&
                (p.sold_status === true || p.sold_status === "TRUE")
        );
        const spent = teamPlayers.reduce((sum, p) => sum + (Number(p.sold_price) || 0), 0);
        const purse = Math.max(Number(teamObj.budget || 0) - spent, 0);
        const playersBought = Number(teamObj.bought_count || 0);
        const slotsTotal = Number(totalPlayersToBuy) || Number(teamObj.team_squad) || playersBought || 0;
        const playersToBuy = Math.max(slotsTotal - playersBought, 0);
        const computedMax = purse - Math.max(playersToBuy - 1, 0) * MIN_BASE_PRICE;
        const maxBidAllowed = Math.max(
            Number.isFinite(Number(teamObj.max_bid_allowed)) ? Number(teamObj.max_bid_allowed) : computedMax,
            0
        );
        return { purse, playersBought, playersToBuy, maxBidAllowed };
    };

    const triggerConfettiIfSold = (playerData) => {
        const id = Number(playerData?.id);
        const statusNow = normSoldFlag(playerData?.sold_status);

        // Hard block (raised briefly on UNSOLD)
        if (confettiBlockRef.current) return;

        // Only start if SOLD right now
        if (statusNow !== "TRUE") return;

        // If we’ve already marked this player UNSOLD, never start
        if (normSoldFlag(playerStatusRef.current.get(id)) === "FALSE") return;

        // Prevent duplicates
        if (lastConfettiPlayerId.current === id) return;
        lastConfettiPlayerId.current = id;

        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
            // Abort immediately if status flips or a block is raised
            if (confettiBlockRef.current || normSoldFlag(playerStatusRef.current.get(id)) !== "TRUE") {
                if (confettiRafRef.current) {
                    cancelAnimationFrame(confettiRafRef.current);
                    confettiRafRef.current = null;
                }
                return;
            }

            confetti({ particleCount: 12, angle: 60, spread: 100, origin: { x: 0 } });
            confetti({ particleCount: 12, angle: 120, spread: 100, origin: { x: 1 } });
            confetti({ particleCount: 10, angle: 270, spread: 100, origin: { y: 0 } });
            confetti({ particleCount: 10, angle: 90, spread: 100, origin: { y: 1 } });

            if (Date.now() < end) confettiRafRef.current = requestAnimationFrame(frame);
        };

        confettiRafRef.current = requestAnimationFrame(frame);
    };

    const isValidSoldPayload = (payload) => {
        const statusOk = isSoldFlag(payload?.sold_status);
        const priceOk = Number(payload?.sold_price) > 0;
        const teamOk = payload?.team_id != null && String(payload?.team_id).length > 0;
        return statusOk || (priceOk && teamOk);
    };

    const triggerSoldOverlay = (payload) => {
        if (!isValidSoldPayload(payload)) return;
        if (confettiBlockRef.current) return;
        const payloadId = Number(payload?.player_id);
        if (payloadId && normSoldFlag(playerStatusRef.current.get(payloadId)) === "FALSE") return;
        if (!soldOverlayClip) return;
        if (soldOverlayTimerRef.current) {
            clearTimeout(soldOverlayTimerRef.current);
            soldOverlayTimerRef.current = null;
        }
        setSoldOverlayActive(true);
        soldOverlayTimerRef.current = setTimeout(() => {
            setSoldOverlayActive(false);
        }, 5000);
    };

    const triggerUnsoldOverlay = () => {
        if (!unsoldOverlayClip) return;
        if (unsoldOverlayTimerRef.current) {
            clearTimeout(unsoldOverlayTimerRef.current);
            unsoldOverlayTimerRef.current = null;
        }
        setUnsoldOverlayActive(true);
        unsoldOverlayTimerRef.current = setTimeout(() => {
            setUnsoldOverlayActive(false);
        }, 3500);
    };


    // 😞 Disappointment Emoji Rain (slower, more emojis)
    const triggerUnsoldEmojiRain = () => {
        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.pointerEvents = "none";
        container.style.zIndex = "9999";
        document.body.appendChild(container);

        const emojis = ["😞", "😔", "😢"];

        for (let i = 0; i < 50; i++) {  // ⬅️ doubled the count
            const emoji = document.createElement("div");
            emoji.innerText = emojis[Math.floor(Math.random() * emojis.length)];
            emoji.style.position = "absolute";
            emoji.style.left = Math.random() * 100 + "vw";
            emoji.style.fontSize = Math.random() * 30 + 25 + "px"; // medium size
            emoji.style.top = "-60px";
            emoji.style.opacity = "0.9";

            // Slow the fall: 5–7 seconds instead of 3–5
            emoji.style.animation = `fall ${5 + Math.random() * 2}s linear forwards`;

            container.appendChild(emoji);
        }

        // cleanup after 8s
        setTimeout(() => {
            document.body.removeChild(container);
        }, 8000);
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
            playerStatusRef.current.set(Number(fullPlayer.id), normSoldFlag(fullPlayer.sold_status));
            animatePlayerSwap(fullPlayer);
            setSecretBidActive(fullPlayer?.secret_bidding_enabled === true);

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
            setTotalPlayersToBuy(data.players_per_team || 0);
            if (data.logo) {
                setTournamentLogo(`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${data.logo}?tr=w-300,q-95,e-sharpen`);
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

        // Require tournament-scoped events; ignore others
        const matchesTournament = (payload) => {
            if (!payload) return false;
            const tid = payload.tournament_id;
            const slug = payload.tournament_slug;
            if (tid != null && tournamentId != null && Number(tid) !== Number(tournamentId)) return false;
            if (slug != null && tournamentSlug != null && String(slug) !== String(tournamentSlug)) return false;
            return tid != null || slug != null; // require a tournament tag
        };

        // 🔴 Live bid updates (optimistic)
        const onBidUpdated = ({ bid_amount, team_name }) => {
            const amount = Number(bid_amount) || 0;
            const cleanedTeam = String(team_name || "").trim();
            setHighestBid(amount);
            setLeadingTeam(cleanedTeam);
            if (cleanedTeam) {
                setActiveBidders((prev) => {
                    const now = Date.now();
                    const existing = prev.find((t) => t.teamName === cleanedTeam);
                    const updatedEntry = { teamName: cleanedTeam, lastBid: amount, updatedAt: now };
                    if (existing) {
                        return prev.map((t) => (t.teamName === cleanedTeam ? { ...t, ...updatedEntry } : t));
                    }
                    return [...prev, updatedEntry];
                });
            }
        };
        socket.on("bidUpdated", (payload) => { if (!matchesTournament(payload)) return; onBidUpdated(payload); });

        // ✅ SOLD committed (optimistic apply to the *visible* player)
        const onSaleCommitted = (payload) => {
            if (!matchesTournament(payload)) return;
            if (!isValidSoldPayload(payload)) return;
            if (unsoldOverlayTimerRef.current) {
                clearTimeout(unsoldOverlayTimerRef.current);
                unsoldOverlayTimerRef.current = null;
            }
            setUnsoldOverlayActive(false);
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



            playerStatusRef.current.set(Number(payload?.player_id), "TRUE");
            confettiBlockRef.current = false; // clear any leftover block
            triggerConfettiIfSold({ id: payload?.player_id, sold_status: "TRUE" });
            triggerSoldOverlay(payload);


            setHighestBid(Number(payload?.sold_price) || 0);
            setLeadingTeam(resolvedName || "");
            fastRefresh();
        };

        socket.on("saleCommitted", onSaleCommitted);

        // 🟠 If your Admin emits "playerSold" immediately (it does), mirror the same optimistic update
        const onPlayerSold = (payload) => {
            if (!matchesTournament(payload)) return;
            if (!isValidSoldPayload(payload)) return;
            onSaleCommitted(payload);
        };
        socket.on("playerSold", onPlayerSold);

        // 🚫 UNSOLD (optimistic: clear team & sold_price locally)
        const onPlayerUnsold = ({ player_id, sold_pool, tournament_id, tournament_slug }) => {
        if (!matchesTournament({ tournament_id, tournament_slug })) return;
        if (soldOverlayTimerRef.current) {
            clearTimeout(soldOverlayTimerRef.current);
            soldOverlayTimerRef.current = null;
        }
        setSoldOverlayActive(false);
        triggerUnsoldOverlay();
        // Stop any ongoing confetti immediately
        if (confettiRafRef.current) {
            cancelAnimationFrame(confettiRafRef.current);
            confettiRafRef.current = null;
        }
        // Best-effort hard stop for any active canvas-confetti animations
        try { if (typeof confetti?.reset === "function") confetti.reset(); } catch (_) { }
        // Keep duplicate guard set to this player to avoid late SOLD re-triggers for same id
        lastConfettiPlayerId.current = Number(player_id);

        // Mark UNSOLD + maintain a block window to reject late SOLD races
        playerStatusRef.current.set(Number(player_id), "FALSE");
        confettiBlockRef.current = true;
        // Match/confidence window slightly longer than confetti duration (3s)
        setTimeout(() => { confettiBlockRef.current = false; }, 3800);

            triggerUnsoldEmojiRain();

            setPlayer(prev =>
                prev && Number(prev.id) === Number(player_id)
                    ? { ...prev, sold_status: "FALSE", team_id: null, sold_price: 0, sold_pool: sold_pool ?? prev.sold_pool }
                    : prev
            );


            setHighestBid(0);
            setLeadingTeam("");

            // cheap refreshes (your existing helpers)
            fetchAllPlayers?.();
            fetchTeams?.();
        };



        socket.on("playerUnsold", onPlayerUnsold);

        // ⏭️ Next player / player change (paint first, then light refreshes)
        const onPlayerChanged = (payload) => {
            if (!matchesTournament(payload)) return;
            setPlayer((prev) => {
                const merged = { ...(prev || {}), ...payload };
                setHighestBid(0);
                setLeadingTeam("");
                animatePlayerSwap(merged);
                return merged;
            });
            fastRefresh();
        };


        socket.on("playerChanged", onPlayerChanged);

        // Theme + custom message + secret-bid toggle
        const handleSocketThemeUpdate = (payload) => {
            const incoming = typeof payload === "string"
                ? { theme: payload, slug: null }
                : (payload || {});
            if (!slugsMatch(incoming.slug, tournamentSlug)) return;
            const nextTheme = typeof incoming.theme === "string" ? incoming.theme.trim() : "";
            setTheme(nextTheme.length ? nextTheme : "default");
        };
        socket.on("themeUpdate", handleSocketThemeUpdate);
        socket.on("customMessageUpdate", (payload) => {
            // Structured admin controls for Active Bidders
            let activeEnvelope = null;
            if (typeof payload === "object") {
                if (payload?.activeBidderDisplay) {
                    activeEnvelope = payload;
                } else if (payload?.message && typeof payload.message === "object" && payload.message?.activeBidderDisplay) {
                    activeEnvelope = payload.message;
                }
            }

            if (activeEnvelope?.activeBidderDisplay) {
                const scopedOk = (!activeEnvelope.tournament_id && !activeEnvelope.slug) || matchesTournament(activeEnvelope);
                if (scopedOk) {
                    const cfg = activeEnvelope.activeBidderDisplay || {};
                    const parseBool = (v) => {
                        if (v === undefined) return undefined;
                        if (typeof v === "string") return v.trim().toLowerCase() === "true";
                        return !!v;
                    };
                    const active = parseBool(cfg.showActiveBidders);
                    const purse = parseBool(cfg.showPurse);
                    const maxBid = parseBool(cfg.showMaxBid);
                    const players = parseBool(cfg.showPlayersToBuy);
                    if (active !== undefined) setShowActiveBidders(active);
                    if (purse !== undefined) setShowPurse(purse);
                    if (maxBid !== undefined) setShowMaxBid(maxBid);
                    if (players !== undefined) setShowPlayersToBuy(players);
                    return;
                }
            }

            if (typeof payload === "object" && !matchesTournament(payload)) return;

            const msg = typeof payload === "string" ? payload : payload?.message;

            if (msg === "__SHOW_BIDDER_PURSE_ON__") { setShowPurse(true); return; }
            if (msg === "__SHOW_BIDDER_PURSE_OFF__") { setShowPurse(false); return; }
            if (msg === "__SHOW_BIDDER_PLAYERS_ON__") { setShowPlayersToBuy(true); return; }
            if (msg === "__SHOW_BIDDER_PLAYERS_OFF__") { setShowPlayersToBuy(false); return; }
            if (msg === "__SHOW_BIDDER_MAXBID_ON__") { setShowMaxBid(true); return; }
            if (msg === "__SHOW_BIDDER_MAXBID_OFF__") { setShowMaxBid(false); return; }
            if (msg === "__SHOW_ACTIVE_BIDDERS_ON__") { setShowActiveBidders(true); return; }
            if (msg === "__SHOW_ACTIVE_BIDDERS_OFF__") { setShowActiveBidders(false); return; }

            if (typeof msg === "string" && msg.length > 0) {
                setCustomMessage(msg);
            } else {
                setCustomMessage(null);
            }
        });
        socket.on("secretBiddingToggled", (payload) => {
            if (!matchesTournament(payload)) return;
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
            socket.off("themeUpdate", handleSocketThemeUpdate);
            socket.off("customMessageUpdate");
            socket.off("secretBiddingToggled");
            socket.disconnect();
            if (soldOverlayTimerRef.current) {
                clearTimeout(soldOverlayTimerRef.current);
                soldOverlayTimerRef.current = null;
            }
            if (unsoldOverlayTimerRef.current) {
                clearTimeout(unsoldOverlayTimerRef.current);
                unsoldOverlayTimerRef.current = null;
            }
        };
    }, [tournamentId]);

    const vis = viewPlayer || player;

    console.log("VIS PLAYER:", vis);

    useEffect(() => {
        setActiveBidders([]);
    }, [player?.id]);

    const activeBidderDetails = useMemo(() => {
        if (!Array.isArray(activeBidders) || activeBidders.length === 0) return [];
        return activeBidders
            .map((entry) => {
                const teamObj = teamSummaries.find(
                    (t) => (t?.name || "").trim().toLowerCase() === (entry.teamName || "").trim().toLowerCase()
                );
                if (!teamObj) return null;
                const fin = computeTeamFinancials(teamObj);
                if (!fin) return null;
                return {
                    ...entry,
                    purse: fin.purse,
                    maxBidAllowed: fin.maxBidAllowed,
                    playersToBuy: fin.playersToBuy,
                    logo: teamObj.logo,
                    id: teamObj.id,
                };
            })
            .filter(Boolean)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }, [activeBidders, teamSummaries, playerList, totalPlayersToBuy]);

    const visibleActiveBidders = useMemo(
        () => activeBidderDetails.slice(0, 4),
        [activeBidderDetails]
    );

    const activeBidderDisplayEnabled = showActiveBidders && (showPurse || showMaxBid || showPlayersToBuy);
    const bidderGridTemplate = useMemo(() => {
        const cols = ["1fr"]; // teams column
        if (showPurse) cols.push("minmax(86px,92px)");
        if (showMaxBid) cols.push("minmax(86px,92px)");
        if (showPlayersToBuy) cols.push("minmax(68px,78px)");
        return cols.join(" ");
    }, [showPurse, showMaxBid, showPlayersToBuy]);

    const { min: squadSizeMin, max: squadSizeMax } = useMemo(() => {
        const sizes = Array.isArray(teamSummaries)
            ? teamSummaries
                .map((team) => Number(team?.team_squad))
                .filter((n) => Number.isFinite(n) && n > 0)
            : [];
        if (sizes.length > 0) {
            return { min: Math.min(...sizes), max: Math.max(...sizes) };
        }
        const fallback = Number(totalPlayersToBuy);
        const safeFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : null;
        return { min: safeFallback, max: safeFallback };
    }, [teamSummaries, totalPlayersToBuy]);


    const team = Array.isArray(teamSummaries)
        ? teamSummaries.find(t => t.id === Number(vis?.team_id))
        : null;
    const isSold = isSoldFlag(vis?.sold_status);
    const isUnsold = isUnsoldFlag(vis?.sold_status);
    const showActivePanel =
        activeBidderDisplayEnabled &&
        visibleActiveBidders.length > 0 &&
        !isSold &&
        !isUnsold;


    return (
        <div className="relative w-screen h-screen">
            {soldOverlayActive && (
                <div
                    className="absolute z-40 pointer-events-none"
                    style={{ left: "52%", top: "66%", transform: "translate(0, -50%)" }}
                >
                    <img
                        src={soldOverlayClip}
                        alt="Sold celebration"
                        className="w-[22vw] max-w-sm h-auto drop-shadow-2xl"
                    />
                </div>
            )}
            {unsoldOverlayActive && (
                <div
                    className="absolute z-40 pointer-events-none"
                    style={{ left: "52%", top: "66%", transform: "translate(0, -50%)" }}
                >
                    <img
                        src={unsoldOverlayClip}
                        alt="Unsold reaction"
                        className="w-[22vw] max-w-sm h-auto drop-shadow-2xl"
                    />
                </div>
            )}
            {showActivePanel && (
                <div className="absolute bottom-52 left-[70%] -translate-x-1/2 w-[78vw] max-w-lg md:max-w-md z-20">
                    <div className="rounded-xl border border-white/20 bg-black/80 backdrop-blur shadow-[0_14px_36px_rgba(0,0,0,0.45)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 text-white/80 text-[11px] uppercase tracking-[0.16em] bg-white/5 border-b border-white/10">
                            <span className="text-sm font-extrabold text-white">Active Bidders</span>
                            <span className="text-[10px] text-white/70">{visibleActiveBidders.length} shown</span>
                        </div>
                        <div
                            className="grid items-center text-[9px] md:text-[10px] uppercase tracking-[0.14em] text-white/70 bg-white/5 border-b border-white/10"
                            style={{ gridTemplateColumns: bidderGridTemplate }}
                        >
                            <div className="px-3 py-1.5">Teams</div>
                            {showPurse && (
                                <div className="px-2.5 py-1.5 text-right justify-self-end">Purse</div>
                            )}
                            {showMaxBid && (
                                <div className="px-2.5 py-1.5 text-right justify-self-end">Max Bid</div>
                            )}
                            {showPlayersToBuy && (
                                <div className="px-2.5 py-1.5 text-right justify-self-end">To Buy</div>
                            )}
                        </div>
                        <div className="divide-y divide-white/10">
                            {visibleActiveBidders.map((bidder, idx) => {
                                const isLatest = idx === 0;
                                return (
                                    <div
                                        key={bidder.id || bidder.teamName || idx}
                                        className={`grid items-center bg-white/[0.04] ${isLatest ? "ring-2 ring-amber-400/70 animate-pulse" : ""}`}
                                        style={{ gridTemplateColumns: bidderGridTemplate }}
                                    >
                                        <div className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                                            <div className="w-10 h-10 rounded-md bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
                                                {bidder.logo ? (
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${bidder.logo}?tr=w-140,h-140,q-95`}
                                                        alt={bidder.teamName}
                                                        className="w-full h-full object-contain"
                                                    />
                                                ) : (
                                                    <span className="text-[9px] text-white/60 text-center px-1">No Logo</span>
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-base font-extrabold text-white uppercase truncate max-w-[10rem] md:max-w-[13rem]">
                                                    {bidder.teamName}
                                                </span>
                                            </div>
                                        </div>
                                        {showPurse && (
                                            <div className="px-2.5 py-2 text-right justify-self-end">
                                                <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-300 text-black font-black text-sm tabular-nums shadow-[0_3px_12px_rgba(251,191,36,0.35)]">
                                                    {formatLakhs(bidder.purse)}
                                                </span>
                                            </div>
                                        )}
                                        {showMaxBid && (
                                            <div className="px-2.5 py-2 text-right justify-self-end">
                                                <span className={`text-sm font-bold tabular-nums ${isLatest ? "text-amber-300 animate-pulse" : "text-white"}`}>
                                                    {formatLakhs(bidder.maxBidAllowed)}
                                                </span>
                                            </div>
                                        )}
                                        {showPlayersToBuy && (
                                            <div className="px-2.5 py-2 text-right justify-self-end">
                                                <span className="text-sm font-bold text-white tabular-nums">
                                                    {Number.isFinite(Number(bidder.playersToBuy)) ? bidder.playersToBuy : "-"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-[9px] uppercase tracking-[0.14em] bg-black/85 border-t border-white/10 text-white/70">
                            <span>Squad Size</span>
                            <div className="flex items-center gap-3">
                                <span>Min: <span className="text-amber-200 font-semibold">{squadSizeMin ?? "-"}</span></span>
                                <span>Max: <span className="text-amber-200 font-semibold">{squadSizeMax ?? "-"}</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {vis && (
                <div
                    key={`${vis?.id}-${animTick}`}
                    className="relative w-full h-full"
                    style={
                        animClass === "pop-out"
                            ? { animation: "aa-slide-out-left 1400ms ease both" }
                            : animClass === "pop-in"
                                ? { animation: "aa-slide-in-right 1400ms ease both" }
                                : undefined
                    }
                >
                    <style>{`
  @keyframes aa-slide-out-left {
    0%   { opacity: 1; transform: translateX(0) scale(1); }
    70%  { opacity: 0.6; transform: translateX(-60px) scale(0.99); }
    100% { opacity: 0; transform: translateX(-140px) scale(0.98); }
  }
  @keyframes aa-slide-in-right {
    0%   { opacity: 0; transform: translateX(140px) scale(0.98); }
    60%  { opacity: 1; transform: translateX(0) scale(1.01); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }
`}</style>
                    <PlayerCard3
                        player={{
                            ...vis,
                            team_name:
                                vis?.team_name ||
                                team?.name ||
                                team?.display_name ||
                                (team?.team_number ? `Team #${team.team_number}` : ""),
                            team_logo: vis?.team_logo || team?.logo,
                        }}
                        isSold={isSold}
                        isUnsold={isUnsold}
                        soldPrice={vis?.sold_price}
                        currentBid={highestBid}
                        biddingTeam={leadingTeam}
                        biddingTeamLogo={
                            Array.isArray(teamSummaries)
                                ? teamSummaries.find((t) => t.name?.trim() === leadingTeam?.trim())?.logo
                                : undefined
                        }
                        secretBidActive={secretBidActive}
                        tournamentLogo={tournamentLogo}
                        brandLogo="/AuctionArena2.png"
                        brandText="AUCTION ARENA LIVE"
                        soldMarqueeItems={marqueeItems}
                    />
                </div>
            )}
        </div>
    );


};

export default SpectatorLiveDisplay;
