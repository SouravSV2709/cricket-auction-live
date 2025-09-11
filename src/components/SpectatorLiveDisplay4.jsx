import React, { useEffect, useState, useRef, useMemo } from "react";
import confetti from "canvas-confetti";
import { useParams } from "react-router-dom";
import useWindowSize from "react-use/lib/useWindowSize";
import CONFIG from '../components/config';
import THEMES, { DEFAULT_THEME_KEY } from '../components/themes';
import PlayerTransitionLoader from "../components/PlayerTransitionLoader";
import { io } from "socket.io-client";
import BackgroundEffect from "../components/BackgroundEffect";
import { DateTime } from "luxon";
import { KCPL_RULES } from '../kcplRules';

const PUB = process.env.PUBLIC_URL || '';
const FLAG = (file) => `${PUB}/${file}`;
const TEAM_FLAG_MAP = {
    Badgers: FLAG('badgers-flag.png'),
    Blasters: FLAG('blasters-flag.png'),
    Fighters: FLAG('fighters-flag.png'),
    Kings: FLAG('kings-flag.png'),
    Knights: FLAG('knights-flag.png'),
    Lions: FLAG('lions-flag.png'),
    Royals: FLAG('royals-flag.png'),
    Titans: FLAG('titans-flag.png'),
};

// Light tints to blend with each flag
const TEAM_BG_MAP = {
    "Badgers": "#F2E2C7", // warm tan
    "Blasters": "#D9ECFF",      // light royal blue
    "Fighters": "#EAD9FF",      // light purple
    "Kings": "#FFEEB3",         // light gold
    "Knights United": "#EFE4C8",// soft parchment
    "Lions": "#FFE1BF",         // light orange
    "Royals": "#FFD6EA",        // pink/magenta tint
    "Titans": "#D8F0FF",        // ice blue
};

// Helper: format rupees to lakhs (e.g., 2000000 -> "20 lakhs", 2050000 -> "20.5 lakhs").
const formatLakhs = (amt) => {
    const n = Number(amt) || 0;

    if (n === 0) return "0";

    // Lakhs
    if (n >= 100000) {
        const lakhs = n / 100000;
        const str = (Number.isInteger(lakhs) ? lakhs.toFixed(0) : lakhs.toFixed(2)).replace(/\.0$/, "");
        return `${str} ${parseFloat(str) === 1 ? "lakh" : "lakhs"}`;
    }

    // Thousands → k format
    const thousands = n / 1000;
    const str = (Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(2)).replace(/\.0$/, "");
    return `${str}k`;
};

const BannerSlide = ({ icon, title, subtitle }) => (
    <div className="mx-16 md:mx-24">
        <div className="flex items-center gap-4 px-6 py-3 rounded-full
                    bg-gradient-to-r from-fuchsia-600/25 via-purple-600/20 to-indigo-600/25
                    border border-white/15 shadow-[0_0_20px_rgba(168,85,247,0.25)]
                    backdrop-blur">
            <span className="text-2xl md:text-3xl">{icon}</span>
            <div className="flex flex-col">
                <span className="text-amber-300 font-extrabold uppercase tracking-widest
                         text-lg md:text-2xl leading-none">
                    {title}
                </span>
                {subtitle && (
                    <span className="text-[10px] md:text-xs text-white/70 tracking-wide">
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    </div>
);


// ===== Bottom marquee (Top-5 SOLD players) + unified footer =====
const BottomMarquee = ({
    items,
    teamPurseChunks = [],
    teamSummaries = [],
    playerList = [],
    formatLakhs,
}) => {
    // Phase 0 = Expensive Players segment, Phase 1 = Team Purse segment
    const [phase, setPhase] = React.useState(0);
    const [runId, setRunId] = React.useState(0); // force re-measure/re-anim
    const viewportRef = React.useRef(null);
    const trackRef = React.useRef(null);

    const SPEED_PX_PER_SEC = 150; // adjust speed
    const GAP_PX = 1;           // spacer on both ends

    // Build segment A: Most Expensive players (banner + player pills)
    const expensiveNodes = React.useMemo(() => {
        if (!Array.isArray(items) || items.length === 0) return [];
        const banner = (
            <div className="mx-16 md:mx-24 inline-block">
                <div className="flex items-center gap-4 px-6 py-3 rounded-full
                        bg-gradient-to-r from-fuchsia-600/25 via-purple-600/20 to-indigo-600/25
                        border border-white/15 shadow-[0_0_20px_rgba(168,85,247,0.25)]
                        backdrop-blur">
                    <span className="text-2xl md:text-3xl">🏆</span>
                    <div className="flex flex-col">
                        <span className="text-amber-300 font-extrabold uppercase tracking-widest text-lg md:text-2xl leading-none">
                            Top 5 Most Expensive Players
                        </span>
                        <span className="text-[10px] md:text-xs text-white/70 tracking-wide">
                            Highest sold prices this auction
                        </span>
                    </div>
                </div>
            </div>
        );

        const pills = items.map((it, idx) => (
            <div
                key={`pl-${it.id ?? idx}`}
                className="mx-12 inline-flex items-center gap-4 px-6 py-3 bg-white/10 rounded-3xl shadow-xl min-w-[480px]"
            >
                <img
                    src={it.image_url}
                    alt={it.name}
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/no-image-found.png"; }}
                    className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-4 border-white/60 shadow-2xl flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-2xl md:text-3xl text-yellow-200 leading-tight truncate">
                        {it.name}
                    </div>
                    <div className="text-base md:text-lg text-white/70 uppercase tracking-wider truncate">
                        {it.teamName}
                    </div>
                </div>
                <div className="ml-2 flex-shrink-0 whitespace-nowrap tabular-nums text-green-300 font-black text-3xl md:text-4xl drop-shadow-lg">
                    {it.priceText}
                </div>
            </div>
        ));

        return [banner, ...pills];
    }, [items]);

    // Build segment B: Team purse (banner + chunk pills)
    const teamNodes = React.useMemo(() => {
        if (!Array.isArray(teamPurseChunks) || teamPurseChunks.length === 0) return [];

        // 1) Banner
        const banner = (
            <div className="mx-16 md:mx-24 inline-block">
                <div className="flex items-center gap-4 px-6 py-3 rounded-full
                      bg-gradient-to-r from-fuchsia-600/25 via-purple-600/20 to-indigo-600/25
                      border border-white/15 shadow-[0_0_20px_rgba(168,85,247,0.25)]
                      backdrop-blur">
                    <span className="text-2xl md:text-3xl">💰</span>
                    <div className="flex flex-col">
                        <span className="text-amber-300 font-extrabold uppercase tracking-widest text-lg md:text-2xl leading-none">
                            Team Purse Remaining
                        </span>
                        <span className="text-[10px] md:text-xs text-white/70 tracking-wide">
                            Sorted high → low
                        </span>
                    </div>
                </div>
            </div>
        );

        // 2) Flatten any incoming structure to a flat team list
        const flatTeams = teamPurseChunks.flatMap((c) =>
            Array.isArray(c) ? c : [c]
        );

        // 3) Chunk into groups of exactly 4 per pill
        const groupsOf4 = [];
        for (let i = 0; i < flatTeams.length; i += 4) {
            groupsOf4.push(flatTeams.slice(i, i + 4));
        }

        // 4) Render each group as a single "pill" with 4 teams side-by-side
        const pills = groupsOf4.map((group, i) => (
            <div
                key={`tpill-${i}`}
                className="mx-12 inline-flex items-stretch gap-6 px-8 py-4 bg-white/10 rounded-3xl shadow-xl"
                style={{ minWidth: "960px" }} // ensures pill is wide enough for 4 items
            >
                {group.map((t, j) => (
                    <div
                        key={j}
                        className="flex items-center gap-3 px-2"
                        style={{ width: "220px" }} // ~4 * 220 + gaps ≈ 960px
                    >
                        {/* Team name */}
                        <span className="min-w-0 flex-1 truncate text-white/90 text-lg font-semibold">
                            {t?.name ?? "Unknown"}
                        </span>

                        {/* Purse */}
                        <span className="ml-2 flex-none whitespace-nowrap tabular-nums text-emerald-300 font-extrabold text-2xl">
                            {typeof formatLakhs === "function" ? formatLakhs(t?.purse ?? 0) : (t?.purse ?? 0)}
                        </span>

                        {/* Divider between team cells */}
                        {j < group.length - 1 && <span className="mx-3 h-6 w-px bg-white/20" />}
                    </div>
                ))}
            </div>
        ));

        return [banner, ...pills];
    }, [teamPurseChunks]);

    // Keep player image selection consistent with the rest of the app
    const resolvePlayerImg = (p, size = 200) => {
        if (p?.profile_image) {
            return String(p.profile_image).startsWith("http")
                ? p.profile_image
                : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${p.profile_image}?tr=w-${size},h-${size},fo-face,z-0.4,q-95,e-sharpen`;
        }
        if (p?.image_url) return p.image_url;
        if (p?.photo_url) return p.photo_url;
        return "/no-image-found.png";
    };


    // Build segments C...Z: Team Squads (one team per segment in the marquee)
    const squadSegments = React.useMemo(() => {
        if (!Array.isArray(teamSummaries) || teamSummaries.length === 0) return [];

        const getTeamPlayers = (teamId) =>
            (playerList || [])
                .filter(
                    (p) =>
                        Number(p.team_id) === Number(teamId) &&
                        (p.sold_status === true || p.sold_status === "TRUE")
                )
                .sort(
                    (a, b) =>
                        // Order by role then name for stable reading; tweak if you prefer price
                        String(a.role || a.base_category || "").localeCompare(
                            String(b.role || b.base_category || "")
                        ) ||
                        String(a.fullname || a.name || "").localeCompare(
                            String(b.fullname || b.name || "")
                        )
                );

        const MAX_PLAYERS_PER_TEAM = 24; // safeguard to keep the pill length manageable

        return teamSummaries.map((team) => {
            const players = getTeamPlayers(team.id).slice(0, MAX_PLAYERS_PER_TEAM);

            // Banner chip for the team
            const banner = (
                <div className="mx-16 md:mx-24 inline-block" key={`squad-banner-${team.id}`}>
                    <div className="flex items-center gap-4 px-6 py-3 rounded-full
                        bg-gradient-to-r from-sky-600/25 via-cyan-600/20 to-emerald-600/25
                        border border-white/15 shadow-[0_0_20px_rgba(34,197,94,0.25)]
                        backdrop-blur">
                        <img
                            src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
                            alt={team.name}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-full object-contain bg-white/90 border border-white/40"
                        />
                        <div className="flex flex-col">
                            <span className="text-emerald-200 font-extrabold uppercase tracking-widest text-lg md:text-2xl leading-none">
                                Team Squad: {team.name}
                            </span>
                            <span className="text-[10px] md:text-xs text-white/70 tracking-wide">
                                Bought players (role • name • price)
                            </span>
                        </div>
                    </div>
                </div>
            );

            // Player chips for this team
            const chips = players.map((p, idx) => {
                const img = resolvePlayerImg(p, 90);
                const role = String(p.role || p.base_category || "PL").toUpperCase();
                const price = Number(p.sold_price || 0);
                return (
                    <span
                        key={`squad-${team.id}-${p.id ?? idx}`}
                        className="mx-12 inline-flex items-center gap-4 px-6 py-3 bg-white/10 rounded-3xl shadow-xl min-w-[480px] border border-white/10"
                    >
                        <img
                            src={img}
                            alt={p.fullname || p.name}
                            onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = "/no-image-found.png";
                            }}
                            className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-4 border-white/60 shadow-2xl flex-shrink-0"
                        />
                        <span className="text-xs md:text-sm px-2 py-0.5 rounded bg-black/40 border border-white/10 tracking-wider">
                            {role}
                        </span>
                        <span className="font-semibold text-base md:text-lg truncate max-w-[220px] md:max-w-[320px]">
                            {p.fullname || p.name}
                        </span>
                        <span className="opacity-80">•</span>
                        <span className="tabular-nums text-emerald-300 font-bold text-lg md:text-xl">
                            {typeof formatLakhs === "function" ? formatLakhs(price) : price}
                        </span>
                    </span>
                );
            });

            // Each team forms ONE marquee segment (banner + chips)
            return (
                <div
                    key={`squad-seg-${team.id}`}
                    className="inline-flex items-center gap-8 text-white/95 text-lg md:text-2xl"
                >
                    {banner}
                    {chips.length ? chips : (
                        <span className="mx-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10">
                            <span className="text-white/80">No players bought yet</span>
                        </span>
                    )}
                </div>
            );
        });
    }, [teamSummaries, playerList, formatLakhs]);



    // Decide which segment to render now
    const segmentList = React.useMemo(() => {
        const list = [];
        if (expensiveNodes.length) list.push(expensiveNodes); // Segment 1
        if (teamNodes.length) list.push(teamNodes);           // Segment 2

        // Segments 3..N: one squad segment per team
        if (squadSegments.length) {
            squadSegments.forEach((node) => list.push([node]));
        }

        return list.length ? list : [[]];
    }, [expensiveNodes, teamNodes, squadSegments]);


    const currentNodes = segmentList[phase % segmentList.length];

    // Measure and compute animation duration based on content + viewport widths
    const [animVars, setAnimVars] = React.useState({ from: "0px", to: "0px", duration: 30 });

    const measure = React.useCallback(() => {
        const vw = viewportRef.current?.offsetWidth || 0;
        const cw = trackRef.current?.scrollWidth || 0;
        const distance = vw + cw + GAP_PX * 2;
        const dur = Math.max(10, distance / SPEED_PX_PER_SEC); // never too short
        setAnimVars({ from: `${vw + GAP_PX}px`, to: `-${cw + GAP_PX}px`, duration: dur });
    }, []);

    // Remeasure on phase/runId and when DOM paints
    React.useEffect(() => {
        const id = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(id);
    }, [phase, runId, measure, currentNodes]);

    // Respond to resizes
    React.useEffect(() => {
        const ro = new ResizeObserver(() => setRunId(r => r + 1));
        if (viewportRef.current) ro.observe(viewportRef.current);
        return () => ro.disconnect();
    }, []);

    const handleEnd = React.useCallback(() => {
        // Advance to next segment; loop
        setTimeout(() => {
            setPhase(p => (p + 1) % segmentList.length);
            setRunId(r => r + 1);
        }, 600); // small pause between segments
    }, [segmentList.length]);

    if (!currentNodes.length) return null;

    return (
        <div
            ref={viewportRef}
            className="relative overflow-hidden w-full h-40 bg-gradient-to-r from-black via-gray-900 to-black backdrop-blur-sm border-t-4 border-purple-600 shadow-inner"
        >
            {/* Scrolling track for CURRENT segment only */}
            <div
                key={`phase-${phase}-${runId}`}
                ref={trackRef}
                className="absolute inset-x-0 top-0 bottom-10 whitespace-nowrap will-change-transform flex items-center"
                style={{
                    animation: `aa-marquee-seq ${animVars.duration}s linear 0s 1 both`,
                    "--from": animVars.from,
                    "--to": animVars.to,
                }}
                onAnimationEnd={handleEnd}
            >
                {/* Head gap */}
                <span style={{ display: "inline-block", width: GAP_PX }} />
                {currentNodes}
                {/* Tail gap */}
                <span style={{ display: "inline-block", width: GAP_PX }} />
            </div>

            {/* Copyright inside */}
            <div className="absolute bottom-2 right-4 pointer-events-none">
                <div className="px-4 py-1.5 rounded-full bg-black/40 border border-white/10 text-xs md:text-sm text-white/80 tracking-wider">
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                </div>
            </div>

            {/* KEYFRAMES */}
            <style>{`
        @keyframes aa-marquee-seq {
          0%   { transform: translateX(var(--from)); }
          100% { transform: translateX(var(--to)); }
        }
      `}</style>
        </div>
    );
};


// ===== End marquee/footer helpers =====


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
    const [kcplTeamStates, setKcplTeamStates] = useState([]);
    const [activePool, setActivePool] = useState(""); // optional: keep in sync with Admin
    const [theme, setTheme] = useState(DEFAULT_THEME_KEY);
    const activeTheme =
        (THEMES && THEMES[theme]) ||
        (THEMES && THEMES[DEFAULT_THEME_KEY]) ||
        { bg: "from-[#0F2A5A] via-[#1F3E73] to-[#0F2A5A]", text: "text-yellow-50" };
    const [unsoldOverlayActive, setUnsoldOverlayActive] = useState(false);
    const unsoldOverlayTimerRef = useRef(null);
    const [marqueeEnabled, setMarqueeEnabled] = useState(true);
    // guards for UNSOLD transition
    const unsoldLockRef = useRef(false);
    const unsoldLockTimerRef = useRef(null);
    const lastUnsoldAtRef = useRef(0);
    const lastUnsoldPlayerIdRef = useRef(null);


    // put this inside SpectatorLiveDisplay component, after the useState hooks
    const renderFooter = (items, teamPurseChunks) => (
        <div className="fixed bottom-0 left-0 w-full z-[60]">
            <BottomMarquee
                items={items}
                teamPurseChunks={teamPurseChunks}
                teamSummaries={teamSummaries}
                playerList={playerList}
                formatLakhs={formatLakhs}
            />
        </div>
    );



    useEffect(() => {
        document.title = "Live4 | EA ARENA";
    }, []);

    // Preload UNSOLD GIFs so they render instantly
    useEffect(() => {
        unsoldMedia.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, []);


    useEffect(() => {
        fetch(`${API}/api/theme`)
            .then(res => res.json())
            .then(data => {
                const key = data?.theme;
                setTheme(key && THEMES[key] ? key : DEFAULT_THEME_KEY);
            });

        const socket = io(API, {
            transports: ["websocket"],
            upgrade: false,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 500,
        });

        socket.on("themeUpdate", (newTheme) => {
            setTheme(newTheme && THEMES[newTheme] ? newTheme : DEFAULT_THEME_KEY);
        });
        return () => socket.disconnect();
    }, []);

    const fetchKcplTeamStates = async () => {
        if (!tournamentId) return;
        try {
            const res = await fetch(`${API}/api/kcpl/team-states/${tournamentId}?activePool=${activePool}`);
            const data = await res.json();
            setKcplTeamStates(data || []);
        } catch (e) {
            console.error("Failed to fetch KCPL team states", e);
        }
    };


    const computeBasePrice = (player) => {
        if (player.base_price && player.base_price > 0) return player.base_price;
        const map = { A: 1700, B: 3000, C: 5000 };
        return map[player.base_category] || 0;
    };

    // When auctioning a player from a different pool, show the Base Price of the *active* pool.
    const getDisplayBasePrice = (player, activePool) => {
        // If KCPL team-state is present and a pool base is defined, prefer it
        const poolBase = KCPL_RULES?.pools?.[activePool]?.base;
        if (Array.isArray(kcplTeamStates) && kcplTeamStates.length > 0 && poolBase != null) {
            return Number(poolBase) || 0;
        }

        // Fallbacks for non-KCPL or when rules aren't available:
        if (player?.base_price && Number(player.base_price) > 0) return Number(player.base_price);
        return computeBasePrice(player) || 0;
    };


    const triggerConfettiIfSold = (playerData) => {
        // do not confetti while UNSOLD is transitioning
        if (unsoldLockRef.current) return;

        if (!isLoading && ["TRUE", "true", true].includes(playerData?.sold_status)) {
            // stop any prior SOLD audio
            if (currentSoldAudio) {
                currentSoldAudio.pause();
                currentSoldAudio.currentTime = 0;
            }
            const selectedSrc = getRandomSoldAudio();
            currentSoldAudio = new Audio(selectedSrc);
            currentSoldAudio.volume = 1.0;
            currentSoldAudio.play().catch(() => { });

            // confetti burst (unchanged)
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
            }, 100);
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

    // Derive pool and team flag for the current player (safe when player is null)
    const poolCode = String((player?.sold_pool ?? player?.base_category ?? "") || "").toUpperCase();

    const hasTeamId = player?.team_id != null && player?.team_id !== "";
    const isLinkedToTeam =
        hasTeamId && (["TRUE", "true", true].includes(player?.sold_status) || poolCode === "X");

    const playerTeam =
        hasTeamId && Array.isArray(teamSummaries)
            ? teamSummaries.find(t => Number(t?.id) === Number(player?.team_id))
            : null;

    const teamFlagSrc = playerTeam?.name ? TEAM_FLAG_MAP[playerTeam.name.trim()] ?? null : null;
    const cardBgColor =
        (playerTeam?.name && TEAM_BG_MAP[playerTeam.name.trim()]) || "#FFFFFF"; // fallback white


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

    const top5SoldPlayers = useMemo(() => {
        // pick SOLD only, order by sold_price desc, keep top 5
        const sold = (playerList || [])
            .filter(p => p?.sold_status === true || p?.sold_status === "TRUE")
            .sort((a, b) => (Number(b.sold_price) || 0) - (Number(a.sold_price) || 0))
            .slice(0, 5);

        return sold.map(p => {
            const team = Array.isArray(teamSummaries)
                ? teamSummaries.find(t => Number(t.id) === Number(p.team_id))
                : null;

            // Build a safe image URL:
            // - If profile_image is absolute (starts with http), use as-is
            // - Else, use ImageKit path with light face crop + sharpen
            const img =
                p?.profile_image
                    ? (String(p.profile_image).startsWith("http")
                        ? p.profile_image
                        : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${p.profile_image}?tr=w-90,h-90,fo-face,z-0.4,q-95,e-sharpen`)
                    : "/no-image-found.png";

            return {
                id: p.id,
                name: p.name,
                priceText: formatLakhs(p.sold_price),
                teamName: team?.name || "Unknown",
                image_url: img,
            };
        });
    }, [playerList, teamSummaries]);

    const totalPurseRemaining = useMemo(() => {
        if (!Array.isArray(teamSummaries)) return 0;
        return teamSummaries.reduce(
            (sum, t) => sum + (Number(t.remaining_purse) || 0),
            0
        );
    }, [teamSummaries]);

    const teamPurseChunks = useMemo(() => {
        if (!Array.isArray(teamSummaries) || !Array.isArray(playerList)) return [];

        const arr = teamSummaries.map((team) => {
            const teamPlayers = playerList.filter(
                (p) =>
                    Number(p.team_id) === Number(team.id) &&
                    (p.sold_status === true || p.sold_status === "TRUE")
            );

            const spent = teamPlayers.reduce((sum, p) => {
                const price = Number(p.sold_price);
                return sum + (isNaN(price) ? 0 : price);
            }, 0);

            const purse = Math.max(Number(team.budget || 0) - spent, 0);

            return {
                name: team?.name ?? "Unknown",
                purse,
            };
        });

        // Sort high → low
        arr.sort((a, b) => b.purse - a.purse);

        // Break into chunks (3 teams per pill)
        const size = 3;
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }, [teamSummaries, playerList]);


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
                        ? `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${data.logo}?tr=w-300,h-600,q-95,e-sharpen`
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
                setPlayerList(playerData);
            } catch (err) {
                console.error("❌ Failed to load tournament data:", err);
            }
        };
        fetchTournament(); // 🟢 This was missing!
    }, [tournamentSlug]);


    useEffect(() => {
        if (!player || !["TRUE", "true", true].includes(player.sold_status)) return;

        // ⛔ ignore SOLD flashes for the same player right after UNSOLD
        if (
            unsoldLockRef.current &&
            Number(player.id) === Number(lastUnsoldPlayerIdRef.current) &&
            Date.now() - lastUnsoldAtRef.current < 3000
        ) {
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

        // Initial fetches
        fetchPlayer();
        fetchTeams();
        fetchAllPlayers();
        fetchKcplTeamStates();

        // Ensure a single socket instance
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        // Create one WebSocket-only connection
        const socket = io(API, {
            transports: ["websocket"],
            upgrade: false,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 500,
        });
        socketRef.current = socket;

        // Small helper
        const fastRefresh = () => {
            fetchPlayer();
            fetchAllPlayers();
            fetchTeams();
            fetchKcplTeamStates();
        };

        // 🔴 LIVE: update bid instantly on every increment
        const onBidUpdated = ({ bid_amount, team_name }) => {
            if (unsoldOverlayActive && Number(bid_amount) === 0 && (!team_name || team_name === "")) return;
            setHighestBid(Number(bid_amount) || 0);
            setLeadingTeam(team_name || "");
            if (Number(bid_amount) === 0 && (!team_name || team_name === "")) fastRefresh();
        };

        socket.on("bidUpdated", onBidUpdated); // was split across two sockets before

        socket.on("saleCommitted", (payload) => {
            // ① update the visible player instantly (no network)
            setPlayer(prev =>
                prev && Number(prev.id) === Number(payload?.player_id)
                    ? {
                        ...prev,
                        sold_status: "TRUE",
                        sold_price: payload?.sold_price ?? prev.sold_price,
                        team_id: payload?.team_id ?? prev.team_id,
                        sold_pool: payload?.sold_pool ?? prev.sold_pool,
                    }
                    : prev
            );
            // keep the banner in sync so "Waiting for Bid" never shows
            setHighestBid(Number(payload?.sold_price) || 0);

            // ② refresh only aggregates; don't refetch the player yet
            fetchAllPlayers();
            fetchTeams();
            fetchKcplTeamStates();
        });

        // optimistic UNSOLD — immediately reflect UNSOLD on the card
        // UNSOLD: show overlay + audio, but DO NOT mutate local player/bid.
        // Let DB/Admin own the truth; we’ll refresh after overlay completes.
        const onPlayerUnsold = ({ player_id }) => {
            // start a short guard window to block any late SOLD effects
            if (unsoldLockTimerRef.current) clearTimeout(unsoldLockTimerRef.current);
            unsoldLockRef.current = true;
            lastUnsoldAtRef.current = Date.now();
            lastUnsoldPlayerIdRef.current = Number(player_id);

            // overlay + audio
            setUnsoldOverlayActive(true);
            setUnsoldClip(unsoldMedia[Math.floor(Math.random() * unsoldMedia.length)]);
            try {
                if (currentSoldAudio) {
                    currentSoldAudio.pause();
                    currentSoldAudio.currentTime = 0;
                }
                unsoldAudio.currentTime = 0;
                unsoldAudio.play();
            } catch { }

            // ⛔️ DO NOT do any of these on spectator:
            // setPlayer(... sold_status: "FALSE", team_id: null, sold_price: 0 ...)
            // setHighestBid(0);
            // setLeadingTeam("");

            // after overlay, refetch fresh state from server
            unsoldLockTimerRef.current = setTimeout(() => {
                setUnsoldOverlayActive(false);
                // fetchAllPlayers();     // your existing light refresh
                // release guard a moment later
                setTimeout(() => { unsoldLockRef.current = false; }, 300);
            }, 1200);
        };




        socket.on("playerUnsold", onPlayerUnsold);


        socket.on("playerChanged", (payload) => {
            const samePlayer =
                payload?.id != null && player?.id != null &&
                Number(payload.id) === Number(player.id);

            // If this is the SAME player and we just handled UNSOLD,
            // treat it as a soft refresh (no transition loader / no reset).
            if (
                samePlayer &&
                unsoldLockRef.current // set by onPlayerUnsold
            ) {
                setPlayer(prev => ({ ...(prev || {}), ...(payload || {}) }));
                // keep current highestBid/leadingTeam; do not set isLoading
                return;
            }

            // Normal path for actual player switches:
            setIsLoading(true);
            setPlayer(prev => ({ ...(prev || {}), ...(payload || {}) }));
            setHighestBid(0);
            setLeadingTeam("");

            // light aggregates
            fetchAllPlayers();
            fetchKcplTeamStates();

            if ((!teamSummaries || teamSummaries.length === 0) && payload?.tournament_id) {
                fetchTeams();
            }

            if (payload?.cricheroes_id) {
                fetch(`${API}/api/cricheroes-stats/${payload.cricheroes_id}`)
                    .then(r => r.json())
                    .then(setCricheroesStats)
                    .catch(() => setCricheroesStats(null));
            }

            setTimeout(() => setIsLoading(false), 150);
        });


        socket.on("secretBiddingToggled", fastRefresh);

        // Theme + custom message + reveal flow — move onto THIS socket
        socket.on("themeUpdate", (newTheme) => {
            setTheme(newTheme && THEMES[newTheme] ? newTheme : DEFAULT_THEME_KEY);
        });

        socket.on("customMessageUpdate", (msg) => {
            if (!msg || typeof msg !== "string") return;

            if (msg === "__SHOW_TEAM_STATS__") {
                setCustomView("team-stats"); setCustomMessage(null);
            } else if (msg === "__SHOW_NO_PLAYERS__") {
                setCustomView("no-players"); setCustomMessage(null);
            } else if (msg === "__CLEAR_CUSTOM_VIEW__") {
                setIsLoading(false); setCustomView(null); setCustomMessage(null);
                setCountdownTime(null);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                fetchPlayer();
            } else if (msg === "__RESET_AUCTION__") {
                fetchAllPlayers(); fetchTeams();
                setCustomView("no-players"); setCustomMessage(null);
                setCountdownTime(null);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            } else if (msg.startsWith("__START_COUNTDOWN__")) {
                const seconds = parseInt(msg.replace("__START_COUNTDOWN__", ""), 10) || 0;
                setCustomMessage(null);
                setCountdownTime(seconds);
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = setInterval(() => {
                    setCountdownTime(prev => (prev <= 1 ? (clearInterval(countdownIntervalRef.current), 0) : prev - 1));
                }, 1000);
            } else if (msg === "__SHOW_TOP_10_EXPENSIVE__") {
                setCustomView("top-10-expensive"); setCustomMessage(null);
            } else if (msg === "__MARQUEE_OFF__") {
                setMarqueeEnabled(false);
            } else if (msg === "__MARQUEE_ON__") {
                setMarqueeEnabled(true);
            } else {
                setCustomMessage(msg); setCustomView(null);
            }
        });

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
                setTeamIdToShow(null); setCustomMessage(null); setCustomView("live");
            } else {
                setTeamIdToShow(payload.team_id);
                if (payload.empty) {
                    setCustomMessage("No players yet for this team.");
                    setCustomView("noPlayers");
                } else {
                    setCustomMessage(null); setCustomView("team"); fetchAllPlayers();
                }
            }
        });

        socket.on("kcplPoolChanged", (pool) => setActivePool(pool));

        // Cleanup: unregister listeners and close the one socket
        return () => {
            socket.off("bidUpdated", onBidUpdated);
            socket.off("saleCommitted");
            socket.off("playerUnsold", onPlayerUnsold);
            socket.off("playerChanged", fastRefresh);
            socket.off("secretBiddingToggled", fastRefresh);
            socket.off("themeUpdate");
            socket.off("customMessageUpdate");
            socket.off("revealSecretBids");
            socket.off("secretBidWinnerAssigned");
            socket.off("showTeam");
            socket.off("kcplPoolChanged");
            socket.disconnect();
            socketRef.current = null;
        };
    }, [tournamentId]);



    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/api/kcpl/active-pool`);
                const { pool } = await res.json();
                if (pool) setActivePool(pool);
            } catch (e) {
                console.warn("Could not fetch initial active pool; defaulting to A");
            }
        })();
    }, []);

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
                                : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-300,h-400,fo-face,z-0.4,q-95,e-sharpen`
                        }
                        alt={player.name}
                        className="w-[30rem] h-[36rem] object-cover rounded-xl border-2 border-white shadow-lg mb-4"
                    />

                    <div className="text-center space-y-2">
                        <h1 className="text-3xl ">{player.name}</h1>
                        <p className="text-sm italic text-yellow-200">
                            {player.role} | {player.district || "NA"}
                        </p>
                        <p className="text-sm uppercase">BASE PRICE</p>
                        <p className="text-xl font-extrabold text-green-400">
                            {formatLakhs(getDisplayBasePrice(player, activePool))}
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
                                    <thead className="bg-white/10 text-yellow-300 text-xl uppercase text-center">
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
                                                        src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${bid.logo}`}
                                                        alt={bid.team_name}
                                                        className="w-8 h-8 rounded-full object-contain border border-white/30"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">{bid.team_name}</td>
                                                <td className="px-4 py-2 text-right text-green-300">
                                                    {formatLakhs(bid.bid_amount)}
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
                                        <thead className="bg-white/10 text-yellow-300 text-xl uppercase text-center">
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
                                                            src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${bid.logo}`}
                                                            alt={bid.team_name}
                                                            className="w-8 h-8 rounded-full object-contain border border-white/30"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">{bid.team_name}</td>
                                                    <td className="px-3 py-2 text-right text-green-300">
                                                        {formatLakhs(bid.bid_amount)}
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
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
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
            ? `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`
            : null;


        return (
            <div className={`w-screen h-screen bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} overflow-hidden relative`}>

                <div className="w-screen h-screen relative overflow-hidden">
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

                        <h1 className="text-3xl font-extrabold text-center mb-4">{team?.name || "Team Not Found"}</h1>


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
                            🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                        </footer>
                    </div>
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
        const totalSlots = Number(team?.team_squad) || 17;

        // Fill placeholders to match totalSlots - 1 (excluding topPlayer)
        const restWithPlaceholders = [
            ...restPlayers,
            ...Array(Math.max(0, totalSlots - 1 - restPlayers.length)).fill(null)
        ];


        return (
            <div className="w-screen h-screen relative overflow-hidden">
                {/* Background – Team Flag (KCPL only, animated) */}
                {tournamentSlug?.toLowerCase().includes("kcpl") &&
                    team?.name &&
                    TEAM_FLAG_MAP[team.name.trim()] && (
                        <img
                            src={TEAM_FLAG_MAP[team.name.trim()]}
                            alt={`${team.name} flag`}
                            className="absolute inset-0 z-0 w-full h-full object-cover opacity-30 pointer-events-none
                   animate-[kenburns-slow_45s_ease-in-out_infinite_alternate]"
                        />
                    )}

                {/* Subtle dark tint for readability */}
                <div className="absolute inset-0 bg-black/40" />

                <div className="relative w-screen h-screen flex flex-row items-center">
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
                    <div className="w-1/3 h-full flex flex-col items-center justify-center p-6">
                        <h3 className="text-3xl text-yellow-300 mb-3">#1 Most Valuable Player</h3>
                        <div className="text-center mb-4">
                            <h1 className="text-3xl font-extrabold">{topPlayer?.name || "No Player"}</h1>
                            <p className="text-yellow-200 text-sm">{topPlayer?.role || "Not Assigned"}</p>
                            <p className="text-3xl text-green-400 mt-2">{formatLakhs(topPlayer?.sold_price)}</p>
                        </div>
                        <img
                            src={
                                topPlayer?.profile_image
                                    ? `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4,q-95,e-sharpen`
                                    : "/no-image-found.png"
                            }
                            alt={topPlayer?.name || "No Player"}
                            className="w-full max-w-[48rem] h-auto max-h-[56rem] object-contain rounded-2xl shadow-2xl drop-shadow-[0_10px_40px_rgba(0,0,0,0.35)] animate-[kenburns_6s_ease-in-out_infinite] bg-white/40"
                        />
                    </div>

                    {/* Right Panel – Rest of Players (Stacked 2 Columns) */}
                    <div className="w-2/3 h-full flex flex-col justify-center p-6 space-y-4">
                        {/* Team Header – Full Width at Top */}
                        <div className="w-full flex flex-row items-center justify-center bg-black/30 rounded-2xl py-6 mb-6">
                            {team?.logo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
                                    alt={team.name}
                                    className="w-40 h-40 object-contain mb-4 animate-pulse"
                                />
                            )}
                            <h2 className="text-6xl font-extrabold text-yellow-300 uppercase tracking-wide">
                                {team.name} Squad
                            </h2>
                        </div>

                        <div className="flex flex-row justify-between gap-4">
                            {[0, 1].map((groupIdx) => {
                                const playerGroup = restWithPlaceholders.length
                                    ? restWithPlaceholders.slice(groupIdx * 8, groupIdx * 8 + 8)
                                    : Array(8).fill(null);

                                return (
                                    <div key={groupIdx} className="flex-1 flex flex-col space-y-4">
                                        {playerGroup.map((player, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between bg-white/10 border-l-4 pl-4 pr-6 py-3 rounded-xl shadow-lg backdrop-blur-sm border-white/20"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="text-3xl text-yellow-300 w-8">#{groupIdx * 8 + idx + 2}</div>
                                                    <img
                                                        src={
                                                            player?.profile_image
                                                                ? `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-80,h-80,fo-face,z-0.4,q-95,e-sharpen`
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
                                                        <div className="text-white text-3xl">{player?.name || "No Player"}</div>
                                                        <div className="text-xl text-yellow-100">{player?.role || "Not Assigned"}</div>
                                                    </div>
                                                </div>
                                                <div className="text-3xl text-green-400">
                                                    {formatLakhs(player?.sold_price || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <footer className="fixed bottom-0 left-0 w-full text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                        🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                    </footer>
                </div>
                {/* Ken Burns keyframes (scoped to this component) */}
                <style>{`
    @keyframes kenburns-slow {
      0%   { transform: scale(1.05) translate3d(0, 0, 0); }
      50%  { transform: scale(1.12) translate3d(-1.5%, -1.5%, 0); }
      100% { transform: scale(1.18) translate3d(1.5%, 1.5%, 0); }
    }
  `}</style>
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
            <div className={`w-screen h-screen bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} overflow-hidden relative`}>

                <div className="w-screen h-screen flex flex-row relative">
                    {/* <BackgroundEffect theme={theme} /> */}

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
                                {tournamentName || "EA ARENA"} <br />
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
                                                    <div className={`text-3xl  w-8 ${getRankText(rank)}`}>#{rank}</div>
                                                    <img
                                                        src={player.profile_image
                                                            ? `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-90,h-90,fo-face,z-0.4,q-95,e-sharpen`
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
                                                    {formatLakhs(player.sold_price)}
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
                        <h3 className="text-3xl  text-yellow-300 mb-3">🏅 Highest Bidded Player</h3>
                        <div className="text-center mb-4">
                            <h1 className="text-3xl font-extrabold">{topPlayer.name}</h1>
                            <p className="text-yellow-200 text-sm">{topTeam?.name}</p>
                            <p className="text-3xl text-green-400  mt-2">{formatLakhs(topPlayer.sold_price)}</p>
                        </div>
                        <img
                            src={
                                topPlayer.profile_image
                                    ? `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${topPlayer.profile_image}?tr=w-400,h-500,fo-face,z-0.4,q-95,e-sharpen`
                                    : "/no-image-found.png"
                            }
                            onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                            alt={topPlayer.name}
                            className="w-[36rem] h-[36rem] object-cover rounded-2xl shadow-xl transform transition-all hover:scale-105 hover:shadow-3xl drop-shadow-[0_10px_40px_rgba(0,0,0,0.35)]
                 animate-[kenburns_6s_ease-in-out_infinite]"
                        />
                    </div>
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                </footer>
            </div>
        );
    }



    // Show Team Stats

    if (customView === "team-stats") {
        // One block if <=8 teams; otherwise split into two
        const MAX_PER_BLOCK = 8;
        const groups =
            teamSummaries.length > MAX_PER_BLOCK
                ? [teamSummaries.slice(0, MAX_PER_BLOCK), teamSummaries.slice(MAX_PER_BLOCK)]
                : [teamSummaries];

        const getTeamPlayers = (teamId) =>
            playerList.filter(
                (p) =>
                    Number(p.team_id) === Number(teamId) &&
                    (p.sold_status === true || p.sold_status === "TRUE")
            );

        const formatCurrency = (amt) => formatLakhs(amt);

        // Determine a sensible minimum base price:
        // 1) If KCPL rules define pool bases, use the smallest pool base
        // 2) Else default to ₹1700
        const poolBases = KCPL_RULES?.pools
            ? Object.values(KCPL_RULES.pools)
                .map((p) => Number(p?.base) || Infinity)
                .filter((n) => Number.isFinite(n))
            : [];
        const MIN_BASE_PRICE = poolBases.length > 0 ? Math.min(...poolBases) : 1700;

        return (
            <div
                className={`w-screen h-screen bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} overflow-hidden relative`}
            >
                {/* <BackgroundEffect theme={theme} /> */}

                <div className="flex flex-row items-center justify-center mt-2 mb-4">
                    {tournamentLogo && (
                        <img
                            src={tournamentLogo}
                            alt="Tournament Logo"
                            className="w-36 h-36 object-contain animate-pulse"
                        />
                    )}
                    <h1 className="text-3xl text-center mt-2">{tournamentName}</h1>
                </div>

                <h2 className="text-3xl text-center py-5 text-white">📊 Team Statistics</h2>

                <div className="flex gap-3 items-start justify-center px-2">
                    {groups.map((grp, grpIdx) => (
                        <div
                            key={grpIdx}
                            className={`flex flex-col ${groups.length === 1 ? "w-[88%] max-w-[1200px]" : "w-auto max-w-[48%]"
                                } overflow-hidden bg-white/10 border border-white/10 rounded-2xl px-6 md:px-10 py-6 backdrop-blur-sm shadow-2xl`}
                        >
                            {/* Header (TEAM | PURSE | MAX BID | SLOTS LEFT) */}
                            <div className="grid grid-cols-4 gap-2 md:gap-4 px-3 py-3 text-base md:text-xl bg-white/10 rounded-xl text-white/90 border border-white/10">
                                <div className="tracking-wider">TEAM NAME</div>
                                <div className="text-center tracking-wider">PURSE REMAINING</div>
                                <div className="text-center tracking-wider">MAX BID ALLOWED</div>
                                <div className="text-center tracking-wider">SLOTS LEFT</div>
                            </div>

                            {/* Rows */}
                            <div className="overflow-y-auto max-h-[calc(100vh-300px)] mt-3 space-y-2 pr-1">
                                {grp.map((team, idx) => {
                                    const teamPlayers = getTeamPlayers(team.id);

                                    const spent = teamPlayers.reduce((sum, p) => {
                                        const price = Number(p.sold_price);
                                        return sum + (isNaN(price) ? 0 : price);
                                    }, 0);

                                    const purse = Math.max(Number(team.budget || 0) - spent, 0);
                                    const leftSlots = Math.max(
                                        (totalPlayersToBuy || 14) - (team.bought_count || 0),
                                        0
                                    );

                                    // Prefer backend-provided max if available; else compute via rule
                                    const computedMax =
                                        purse - Math.max(leftSlots - 1, 0) * MIN_BASE_PRICE;
                                    const maxBidAllowed = Math.max(
                                        Number.isFinite(Number(team.max_bid_allowed))
                                            ? Number(team.max_bid_allowed)
                                            : computedMax,
                                        0
                                    );

                                    return (
                                        <div
                                            key={team.id}
                                            className={`grid grid-cols-4 gap-2 md:gap-4 items-center px-3 py-3 rounded-xl 
                                bg-gradient-to-r from-slate-900/70 to-indigo-900/50 text-2xl md:text-3xl font-semibold 
                                border border-white/10 shadow-sm hover:shadow-xl transition-shadow ${idx % 2 ? "backdrop-blur-[2px]" : "backdrop-blur-sm"
                                                }`}
                                        >
                                            {/* Team */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
                                                    alt={team.name}
                                                    className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-white/50 bg-white/80 object-contain"
                                                />
                                                <span className="truncate text-white">{team.name}</span>
                                            </div>

                                            {/* Purse */}
                                            <div className="text-center">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-600/25 border border-emerald-300/30 text-emerald-200 tabular-nums">
                                                    {formatCurrency(purse)}
                                                </span>
                                            </div>

                                            {/* Max Bid Allowed */}
                                            <div className="text-center">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-600/25 border border-amber-300/30 text-amber-200 tabular-nums">
                                                    {formatCurrency(maxBidAllowed)}
                                                </span>
                                            </div>

                                            {/* Slots Left */}
                                            <div className="text-center">
                                                <span className="inline-flex items-center px-3 py-1 rounded-full bg-cyan-600/25 border border-cyan-300/30 text-cyan-200 tabular-nums">
                                                    {leftSlots}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                </footer>
            </div>
        );
    }




    if (customMessage && customView !== "team-stats") {
        return (
            <div className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} text-5xl font-extrabold text-center px-10`}>
                <div className="w-screen h-screen relative overflow-hidden">
                    {/* <BackgroundEffect theme={theme} /> */}

                    <div className="absolute inset-0 flex flex-row items-center justify-center h-screen px-6">

                        {/* Left Branding Panel */}
                        <div className="flex flex-col items-center justify-center text-left pr-10 gap-4 min-w-[420px] max-w-[440px]">
                            <img
                                src="/AuctionArena2.png"
                                alt="EA ARENA"
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
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                </footer>
            </div>
        );
    }

    if (!player && tournamentSlug?.toLowerCase() === "kcpl") {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-black">
                <img
                    src="/KCPL cover.jpg"
                    alt="KCPL Cover"
                    className="w-full h-full object-cover"
                />
            </div>
        );
    }


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
                <div className={`w-screen h-screen bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} overflow-hidden relative`}>
                    <div className="absolute inset-0 z-10 flex items-center justify-between px-2 py-4">


                        {/* Background particles */}
                        {/* <BackgroundEffect theme={theme} /> */}
                        {/* Left Logos: 3-3-2 */}
                        <div className="flex flex-col gap-6 items-center pl-2">
                            {leftGrid.map((row, i) => (
                                <div key={i} className="flex justify-center gap-2">
                                    {row.map(team => (
                                        <div key={team.id} className="w-48 h-48 m-3">
                                            <img
                                                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
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
                            {/* <p
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
                        </p> */}

                            <div className="flex items-center justify-center gap-4 mb-6">
                                <div className="bg-red-600 text-white text-sm  px-4 py-2 rounded-full animate-pulse">
                                    🔴 LIVE STREAMING
                                </div>
                                <img src="/hammer.png" alt="Gavel" className="w-10 h-10 object-contain" />
                                <img src="/AuctionArena2.png" alt="EA ARENA" className="w-20 h-20 object-contain" />
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
                                                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
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
                </div>

                {/* Footer */}
                <footer className="absolute bottom-0 left-0 w-full text-center text-white text-sm bg-black/80 border-t border-purple-600 animate-pulse z-50 py-2">
                    🔴 All rights reserved | Powered by EA ARENA | +91-9547652702 🧨
                </footer>
            </div>

        );
    }





    // Show Broadcast message

    const team = Array.isArray(teamSummaries)
        ? teamSummaries.find(t => Number(t.id) === Number(player.team_id))
        : null;
    const teamName = team?.name || leadingTeam || "-";
    const teamLogoId = team?.logo;

    // Pick the LIVE leading team object (prefer socket leadingTeam, else fall back to player's team)
    const leadingTeamObj =
        (leadingTeam
            ? teamSummaries.find(t => (t?.name || "").trim() === (leadingTeam || "").trim())
            : null) || team || null;

    // Values from Teams table (no recompute)
    const playersInTeamCount = leadingTeamObj?.bought_count ?? 0;
    const leadingTeamMaxBid = Number(leadingTeamObj?.max_bid_allowed || 0);
    const leadingTeamId = leadingTeamObj?.id ? Number(leadingTeamObj.id) : null;

    const spentByLeadingTeam =
        leadingTeamId !== null
            ? playerList.reduce((sum, p) => {
                const sameTeam = Number(p.team_id) === leadingTeamId;
                const isSold = p.sold_status === true || p.sold_status === "TRUE";
                return sum + (sameTeam && isSold ? Number(p.sold_price) || 0 : 0);
            }, 0)
            : 0;

    const availablePurse = Math.max(Number(leadingTeamObj?.budget || 0) - spentByLeadingTeam, 0);



    const isWaitingForBid =
        !["TRUE", "true", true].includes(player?.sold_status) &&
        (!highestBid || Number(highestBid) === 0) &&
        !player?.secret_bidding_enabled;





    // Live Auction view

    <style>{`
  @keyframes flagfloat {
    0%,100% { transform: translateY(0) scale(1.1); }
    50%     { transform: translateY(-6px) scale(1.12); }
  }
`}</style>

    return (
        <div className={`w-screen h-screen bg-gradient-to-br ${activeTheme.bg} ${activeTheme.text} overflow-hidden relative`}>
            {/* <div className="w-screen h-screen relative overflow-hidden bg-black text-white"> */}
            {/* Background Layer – Particle Animation */}
            {/* <BackgroundEffect theme={theme} /> */}

            <div className="flex items-center justify-between px-6 py-4">
                {/* Left: EA ARENA Logo */}
                <img
                    src="/AuctionArena2.png"
                    alt="EA ARENA"
                    className="w-20 h-20 object-contain animate-pulse"
                />
                <h1 className="text-4xl font-extrabold tracking-wide text-center flex-1 animate-pulse">
                    {tournamentName?.toUpperCase() || "EA ARENA LIVE"}-AUCTION <span animate-pulse>🔴 LIVE</span>
                </h1>
                {tournamentLogo && (
                    <img
                        src="/AuctionArena2.png"
                        alt="EA ARENA"
                        className="w-20 h-20 object-contain ml-4 animate-pulse"
                    />
                )}
            </div>


            <div
                key={player.id}
                className={`flex h-[calc(100%-120px)] px-12 pt-6 pb-10 gap-2 transition-opacity duration-700 ${!isLoading ? 'opacity-100 animate-fade-in' : 'opacity-0'}`}
            >
                {/* one-time tiny keyframes for fade-in */}
                <style>{`
  @keyframes aa-fade-in {
    from { opacity: 0; transform: translateY(-6px) scale(.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`}</style>

                {/* Glow wrapper */}
                <div className="relative">


                    {/* Card */}
                    <div
                        className="relative w-[48rem] h-[56rem] rounded-[32px] overflow-hidden shadow-2xl border border-gray-300 mt-4"
                        style={{ backgroundColor: cardBgColor }}
                    >
                        {/* FLAG WATERMARK — boosted visibility */}
                        {isLinkedToTeam && teamFlagSrc && (
                            <div className="absolute inset-0 z-[5] overflow-hidden pointer-events-none">
                                {/* Dark parts pop */}
                                <img
                                    src={teamFlagSrc}
                                    alt={`${playerTeam?.name || "Team"} flag`}
                                    className="absolute inset-0 w-full h-full object-cover
                 opacity-45 mix-blend-multiply
                 [filter:contrast(1.25)_saturate(1.2)_brightness(1.05)]
                 scale-[1.15]"
                                    style={{ transformOrigin: "50% 55%" }}
                                />
                                {/* Light parts pop */}
                                <img
                                    src={teamFlagSrc}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-cover
                 opacity-20 mix-blend-screen scale-[1.15]"
                                    style={{ transformOrigin: "50% 55%" }}
                                />
                            </div>
                        )}


                        {/* Moving sheen across the white background */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden z-[6]">
                            <div className="absolute -left-1/2 top-0 h-full w-[200%]
                  bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.25),transparent)]
                  translate-x-[-100%] animate-[sheen_6s_ease-in-out_infinite]"></div>
                            {/* Soften the global white veil */}
                            <div className="absolute inset-0"
                                style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.18) 60%, rgba(255,255,255,0.06))" }} />
                        </div>


                        {/* Player Image with gentle Ken Burns */}
                        <img
                            src={player.profile_image}
                            alt={player.name}
                            onError={(e) => { e.target.onerror = null; e.target.src = "/no-image-found.png"; }}
                            className="relative z-10 w-full h-full object-contain
        drop-shadow-[0_10px_40px_rgba(0,0,0,0.35)]
        animate-[kenburns_6s_ease-in-out_infinite]"
                        />

                        {/* Serial No – Top Left (with SOLD/UNSOLD image below) */}
                        <div className="absolute top-4 left-4 z-30 flex flex-col items-start gap-2">
                            <div className="relative inline-flex items-center px-5 py-1.5 rounded-full">
                                {/* Inner Chip */}
                                <span className="relative bg-black/80 text-white text-3xl font-extrabold rounded-full px-4 py-1">
                                    #{player.auction_serial}
                                </span>
                            </div>

                            {/* SOLD image (only if NOT Pool X) */}
                            {["TRUE", "true", true].includes(player?.sold_status) && poolCode !== "X" && (
                                <div className="opacity-0 animate-[aa-fade-in_500ms_ease-out_forwards]">
                                    <img src="/SOLD.png" alt="SOLD" className="w-28 h-auto drop-shadow-xl animate-pulse" />
                                </div>
                            )}

                            {/* UNSOLD image (only if NOT Pool X) */}
                            {["FALSE", "false", false].includes(player?.sold_status) && poolCode !== "X" && (
                                <div className="opacity-0 animate-[aa-fade-in_500ms_ease-out_forwards]">
                                    <img
                                        src={"/UNSOLD.png"}
                                        alt="UNSOLD"
                                        className="w-32 h-auto drop-shadow-xl"
                                        loading="eager"
                                    />
                                </div>
                            )}

                        </div>

                        {/* Pool Category – Top Right (with Owner/Icon override for Pool X) */}
                        {(() => {
                            const poolCode = String(player?.sold_pool || player?.base_category || "")
                                .toUpperCase();
                            const soldAmt = Number(player?.sold_price) || 0;

                            if (!poolCode) return null; // ⬅️ Don’t render if no pool

                            let poolLabel = `Pool ${poolCode}`;

                            if (poolCode === "X") {
                                if (soldAmt === 400000) poolLabel = "Owner";
                                else if (soldAmt === 1000000) poolLabel = "ICON";
                            }

                            return (
                                <div className="absolute top-4 right-4 z-30">
                                    <div className="relative inline-flex items-center px-5 py-1.5 rounded-full">
                                        {/* Inner Chip */}
                                        <span className="relative bg-black/80 text-white text-3xl font-bold rounded-full px-4 py-1">
                                            {poolLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}


                    </div>
                </div>






                <div className="w-1/3 flex flex-col justify-items-center-safe space-y-8 mt-10">

                    {/* Player header — always visible */}
                    <div className="w-full max-w-md mx-auto text-center -mt-1">
                        <div className="inline-block rounded-2xl px-5 py-2 bg-black/55 backdrop-blur-sm shadow-lg">
                            <h2
                                className="text-5xl font-black tracking-wide uppercase text-white drop-shadow"
                                style={{ WebkitTextStroke: "1px rgba(0,0,0,0.35)" }}
                            >
                                {player?.name || "Player"}
                            </h2>
                        </div>
                        <p className="mt-2 text-xl text-yellow-300 uppercase tracking-wide">
                            {player?.role || "Role"}
                        </p>
                    </div>

                    {["TRUE", "true", true].includes(player?.sold_status) && (() => {
                        const poolCode = String(player?.sold_pool ?? player?.base_category ?? "").toUpperCase();
                        const isPoolX = poolCode === "X";
                        const soldAmt = Number(player?.sold_price) || 0;
                        const xLabel = isPoolX
                            ? (soldAmt === 400000 ? "Owner" : soldAmt === 1000000 ? "ICON" : "Pool X")
                            : null;

                        return (
                            <div className="bg-black/60 backdrop-blur-lg shadow-xl rounded-2xl w-full max-w-md mx-auto">
                                {/* Team Logo */}
                                <div className="flex justify-center">
                                    <img
                                        src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${teamLogoId}?`}
                                        alt={teamName}
                                        className="w-[20rem] h-[20rem] object-contain animate-bounce-in drop-shadow-lg"
                                    />
                                </div>

                                {/* Team Name */}
                                <p className="text-3xl text-center mt-2 text-white uppercase tracking-wide">
                                    {teamName}
                                </p>

                                {/* Sold Amount — HIDE when Pool X */}
                                {!isPoolX && (
                                    <div className="bg-green-500/20 border border-yellow-400/30 rounded-xl px-4 py-2 text-center mt-4 animate-pulse">
                                        <p className="text-lg uppercase tracking-wider text-white drop-shadow-sm">
                                            🎉 Sold Amount: {formatLakhs(player?.sold_price || 0)}
                                        </p>
                                    </div>
                                )}

                                {/* Players Bought & Base Price / Owner / ICON */}
                                {team?.bought_count !== undefined && team?.max_bid_allowed !== undefined && (
                                    <div className="grid grid-cols-2 divide-x divide-white/20 rounded-xl border border-white/20 overflow-hidden mt-4">
                                        <div className="flex flex-col items-center py-3 bg-black/40">
                                            <p className="text-xl text-yellow-400 uppercase tracking-wider">Players Bought</p>
                                            <p className="text-xl text-white">
                                                🧑‍🤝‍🧑 {team.bought_count} / {totalPlayersToBuy || 17}
                                            </p>
                                        </div>

                                        <div className="flex flex-col items-center py-3 bg-black/40">
                                            {isPoolX ? (
                                                <>
                                                    <p className="text-xl text-yellow-400 uppercase tracking-wider">Category</p>
                                                    <p className="text-xl text-white tracking-wider uppercase">
                                                        {xLabel}
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-xl text-yellow-400 uppercase tracking-wider">Base Price</p>
                                                    <p className="tracking-wider uppercase">
                                                        {formatLakhs(getDisplayBasePrice(player, activePool))}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}



                    {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) && (
                        isWaitingForBid ? (
                            <div className="text-center items-center justify-center">
                                <img
                                    src="/bidding.gif"
                                    alt="Waiting for a Bid"
                                    className="w-[20rem] h-[20rem] object-contain mx-auto mb-4 mt-20"
                                />
                                <p className="text-3xl text-yellow-300  animate-pulse">
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
                                        <div className="bg-white-600/60 rounded-xl px-6 py-4 text-center justify-center">
                                            {/* <p className="text-3xl mb-4 uppercase tracking-wider  drop-shadow-sm">Leading Team</p> */}

                                            {leadingTeamLogo && (
                                                <img
                                                    src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${leadingTeamLogo}?tr=q-95,e-sharpen`}
                                                    alt={leadingTeamName}
                                                    className="rounded-sm w-[20rem] h-[30rem] object-contain inline-block align-middle"
                                                />
                                            )}

                                            {/* <div className="text-4xl uppercase text-green-bold">
                                                {leadingTeamName || "—"}
                                            </div> */}

                                        </div>
                                    );
                                })()}

                                {!unsoldOverlayActive && (
                                    <div className="rounded-xl px-6 py-4 text-center justify-center flex flex-row gap-4">
                                        <div className="items-center py-3 px-3 bg-black/40">
                                            <p className="text-lg uppercase text-green-bold">Base Price</p>

                                            <p className="text-4xl tracking-wider uppercase">{formatLakhs(getDisplayBasePrice(player, activePool))}</p>                                    </div>
                                        <div className="items-center py-3 px-3 bg-black/40 animate-pulse">
                                            <p className="text-lg uppercase text-green-bold">Current Bid</p>
                                            <p className="text-4xl uppercase text-green-bold">
                                                {formatLakhs(highestBid)}
                                            </p>
                                        </div>
                                    </div>
                                )}


                                <div>
                                    {/* 👇 Secret Bidding Flag Message */}
                                    {!["TRUE", "true", true, "FALSE", "false", false].includes(player?.sold_status) &&
                                        player?.secret_bidding_enabled && (
                                            <p className="text-3xl mt-4 text-yellow-300  animate-pulse">
                                                Secret Bidding In Progress...
                                            </p>
                                        )}
                                </div>

                            </>
                        )
                    )}


                    {(unsoldOverlayActive || ["FALSE", "false", false].includes(player?.sold_status)) && unsoldClip && (
                        <div className="relative w-full max-w-[24rem] mx-auto">
                            {/* Media wrapper: same size for video/img */}
                            <div className="relative rounded-xl overflow-hidden border-4 shadow-xl bg-black/30 aspect-video">
                                {String(unsoldClip).toLowerCase().endsWith(".mp4") ? (
                                    <video
                                        src={unsoldClip}
                                        autoPlay
                                        muted
                                        playsInline
                                        loop
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <img
                                        src={unsoldClip}
                                        alt="UNSOLD Reaction"
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.currentTarget.style.objectFit = 'contain'; }}
                                    />
                                )}
                            </div>

                            {/* Label */}
                            <div className="bg-red-500/20 border border-yellow-400/30 rounded-xl px-4 py-2 text-center mt-3 animate-pulse">
                                <p className="text-lg uppercase tracking-wider text-white drop-shadow-sm">
                                    UNSOLD
                                </p>
                            </div>
                        </div>
                    )}



                </div>

                <div className="w-1/3 flex flex-col space-y-6 mt-10">
                    {/* ——— Player Info ——— */}
                    <div
                        className="relative rounded-[32px] shadow-lg overflow-hidden border border-white/20 text-3xl
               bg-white/5 backdrop-blur-md"
                    >
                        <div className="relative p-6 md:p-8 font-orbitron">
                            <div
                                className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full
                   bg-gradient-to-r from-amber-400/30 to-rose-500/30 text-white/90
                   text-xl tracking-widest uppercase">
                                Player Info
                            </div>

                            <div className="grid grid-cols-2 divide-x divide-y divide-white/15 text-3xl">
                                <div className="px-3 py-2 tracking-wider uppercase">Nickname</div>
                                <div className="px-3 py-2">{player?.nickname || "-"}</div>

                                <div className="px-3 py-2 tracking-wider uppercase">Role</div>
                                <div className="px-3 py-2 uppercase">{player?.role || "-"}</div>

                                <div className="px-3 py-2 tracking-wider uppercase">Batting Type</div>
                                <div className="px-3 py-2 uppercase">{player?.batting_hand || "-"}</div>

                                <div className="px-3 py-2 tracking-wider uppercase">Bowling Type</div>
                                <div className="px-3 py-2 uppercase">{player?.bowling_hand || "-"}</div>

                                {player?.location && (
                                    <>
                                        <div className="px-3 py-2 tracking-wider uppercase">Location</div>
                                        <div className="px-3 py-2">{player.location}</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ——— Auction Snapshot (fills the blank area neatly) ——— */}
                    <div className="relative rounded-[32px] shadow-lg overflow-hidden border border-white/20 bg-white/5 backdrop-blur-md">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {/* Base Price */}
                            <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center">
                                <div className="text-xl tracking-widest text-white/70 uppercase">Base Price</div>
                                <div className="text-3xl font-extrabold text-green-300 mt-1">
                                    {formatLakhs(getDisplayBasePrice(player, activePool))}
                                </div>
                            </div>

                            {/* Current Bid / Sold / Unsold */}
                            <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center">
                                {["FALSE", "false", false].includes(player?.sold_status) ? (
                                    <>
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Status</div>
                                        <div className="text-3xl font-extrabold text-red-400 mt-1">Unsold</div>
                                    </>




                                ) : ["TRUE", "true", true].includes(player?.sold_status) ? (
                                    <>
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Sold Amount</div>
                                        <div className="text-3xl font-extrabold text-green-300 mt-1">
                                            {formatLakhs(player?.sold_price || 0)}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Current Bid</div>
                                        <div className="text-3xl font-extrabold text-yellow-300 mt-1">
                                            {formatLakhs(highestBid || 0)}
                                        </div>
                                    </>
                                )}
                            </div>


                            {/* Leading Team */}
                            {!["FALSE", "false", false].includes(player?.sold_status) && (
                                <>
                                    {/* Leading Team */}
                                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center col-span-2 md:col-span-1">
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Leading Team</div>
                                        <div className="text-xl font-bold text-white mt-1 truncate">
                                            {leadingTeamObj?.name || teamName}
                                        </div>
                                    </div>

                                    {/* Players in Team */}
                                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center">
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Players in Team</div>
                                        <div className="text-3xl font-extrabold text-white mt-1">{playersInTeamCount}</div>
                                    </div>

                                    {/* Available Purse */}
                                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center">
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Available Purse</div>
                                        <div className="text-3xl font-extrabold text-blue-300 mt-1">
                                            {formatLakhs(availablePurse)}
                                        </div>
                                    </div>


                                    {/* Leading Team Max Bid */}
                                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-4 text-center">
                                        <div className="text-xl tracking-widest text-white/70 uppercase">Team Max Bid</div>
                                        <div className="text-3xl font-extrabold text-green-300 mt-1">
                                            {formatLakhs(leadingTeamMaxBid)}
                                        </div>
                                    </div>
                                </>
                            )}


                        </div>

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


            {marqueeEnabled && renderFooter(top5SoldPlayers, teamPurseChunks)}

        </div>

    );
};

export default SpectatorLiveDisplay;