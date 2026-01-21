import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useRef } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti"; // 🎆 Confetti library
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import BACKGROUND_VIDEOS from '../components/backgroundVideos';
import './ThemePreview.css';
import { KCPL_RULES } from '../kcplRules';


const API = CONFIG.API_BASE_URL;

const computeBasePrice = (player) => {
    if (player?.base_price && Number(player.base_price) > 0) return Number(player.base_price);
    const map = { A: 1700, B: 3000, C: 5000 };
    const comp = String(player?.component || '').toUpperCase();
    return map[comp] || 0;
};

const AdminPanel = () => {
    const [players, setPlayers] = useState([]);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState('');
    const [bidAmount, setBidAmount] = useState(0);
    const [teams, setTeams] = useState([]);
    const [searchId, setSearchId] = useState('');
    const [undoStack, setUndoStack] = useState([]);
    const [customMessage, setCustomMessage] = useState('');
    const [showBidderPurse, setShowBidderPurse] = useState(false);
    const [showBidderMaxBid, setShowBidderMaxBid] = useState(false);
    const [showBidderPlayersToBuy, setShowBidderPlayersToBuy] = useState(false);
    const [showBidderPanel, setShowBidderPanel] = useState(false);
    const [tournamentTitle, setTournamentTitle] = useState('Tournament');
    const [showCustomMessagePanel, setShowCustomMessagePanel] = useState(false);
    const [resetInProgress, setResetInProgress] = useState(false);
    const [resetUnsoldInProgress, setResetUnsoldInProgress] = useState(false);
    const [resetMaxBidInProgress, setResetMaxBidInProgress] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState("fireflies");
    const [isTeamViewActive, setIsTeamViewActive] = useState(false);
    const [isTeamLoopActive, setIsTeamLoopActive] = useState(false);
    const [bidIncrements, setBidIncrements] = useState([]);
    const [showBidConfig, setShowBidConfig] = useState(false);
    const [showThemeSelector, setShowThemeSelector] = useState(false);
    const [showVideoSelector, setShowVideoSelector] = useState(false);
    const [isLiveAuctionActive, setIsLiveAuctionActive] = useState(true);
    const [countdownDuration, setCountdownDuration] = useState(0);
    const { tournamentSlug } = useParams();
    const [tournamentId, setTournamentId] = useState(null);
    const [isSecretBiddingActive, setIsSecretBiddingActive] = useState(false);
    const [secretBids, setSecretBids] = useState([]);
    const [showSecretBids, setShowSecretBids] = useState(false);
    const [showSecretBiddingControls, setShowSecretBiddingControls] = useState(false);
    const [isBidManual, setIsBidManual] = useState(false);
    const [showAuctionControls, setShowAuctionControls] = useState(true);
    const [showResetPanel, setShowResetPanel] = useState(false);
    const [kcplMode, setKcplMode] = useState(false);  // flip off if not KCPL
    const [activePool, setActivePool] = useState("");
    const [teamPoolState, setTeamPoolState] = useState(null);
    const [kcplTeamStates, setKcplTeamStates] = useState([]);
    const [playerStats, setPlayerStats] = useState(null);
    const [isMarqueeOn, setIsMarqueeOn] = useState(false);
    const [markSoldInProgress, setMarkSoldInProgress] = useState(false);
    const [markUnsoldInProgress, setMarkUnsoldInProgress] = useState(false);

    // Prevent accidental player switches while an active bid is in progress
    const isBiddingLocked = React.useMemo(() => {
        if (!currentPlayer) return false;
        const st = currentPlayer.sold_status;
        const isSold = st === true || String(st).toUpperCase() === "TRUE";
        const isUnsold = st === false || String(st).toUpperCase() === "FALSE";
        if (isSold || isUnsold) return false;
        const hasBid = Number(bidAmount) > 0;
        return hasBid || isSecretBiddingActive;
    }, [currentPlayer, bidAmount, isSecretBiddingActive]);


    useEffect(() => {
        document.title = "Admin Panel | Auction Arena";
    }, []);


    // --- Quick-pick: Paid players (payment_success=true AND not deleted) ---
    // ===== Quick-Pick UX: filter + search =====
    const [serialView, setSerialView] = React.useState("na"); // 'paid' | 'unpaid' | 'all' | 'sold' | 'unsold' | 'na'
    const [serialQuery, setSerialQuery] = React.useState("");
    const [roleFilter, setRoleFilter] = React.useState("all");
    const [categoryFilter, setCategoryFilter] = React.useState("all");


    // helpers
    const isTrueish = (v) => v === true || String(v).toLowerCase() === "true";
    const isFalseish = (v) => v === false || String(v).toLowerCase() === "false";
    const notDeleted = (v) => v == null; // null or undefined

    // map: serial -> player (for name/role lookups and status)
    const serialToPlayer = React.useMemo(() => {
        const m = new Map();
        for (const p of players || []) {
            const s = Number(p?.auction_serial);
            if (Number.isFinite(s) && s >= 1) m.set(s, p);
        }
        return m;
    }, [players]);

    // unique list of roles from players for role filter dropdown
    const availableRoles = React.useMemo(() => {
        const set = new Set();
        for (const p of players || []) {
            const r = String(p?.role || '').trim();
            if (r) set.add(r);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [players]);

    const availableCategories = React.useMemo(() => {
        const set = new Set();
        for (const p of players || []) {
            const c = String(p?.age_category || '').trim();
            if (c) set.add(c);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [players]);

    // build three lists (counts shown on tabs)
    const paidSerials = React.useMemo(() => {
        if (!Array.isArray(players)) return [];
        return players
            .filter(p => isTrueish(p?.payment_success) && notDeleted(p?.deleted_at))
            .map(p => Number(p?.auction_serial))
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
    }, [players]);


    const allSerials = React.useMemo(() => {
        if (!Array.isArray(players)) return [];
        return players
            .filter(p => notDeleted(p?.deleted_at))
            .map(p => Number(p?.auction_serial))
            .filter(s => Number.isFinite(s) && s >= 1)
            .sort((a, b) => a - b);
    }, [players]);

    const soldSerials = React.useMemo(() => {
        if (!Array.isArray(players)) return [];
        return players
            .filter(p => p?.sold_status === true && notDeleted(p?.deleted_at))
            .map(p => Number(p?.auction_serial))
            .filter(s => Number.isFinite(s) && s >= 1)
            .sort((a, b) => a - b);
    }, [players]);

    const unsoldSerials = React.useMemo(() => {
        if (!Array.isArray(players)) return [];
        return players
            .filter(p => p?.sold_status === false && notDeleted(p?.deleted_at))
            .map(p => Number(p?.auction_serial))
            .filter(s => Number.isFinite(s) && s >= 1)
            .sort((a, b) => a - b);
    }, [players]);

    const notAuctionedSerials = React.useMemo(() => {
        if (!Array.isArray(players)) return [];
        return players
            .filter(p => (p?.sold_status == null) && notDeleted(p?.deleted_at))
            .map(p => Number(p?.auction_serial))
            .filter(s => Number.isFinite(s) && s >= 1)
            .sort((a, b) => a - b);
    }, [players]);

    const quickMessageOptions = [
        { label: "Welcome", text: `Welcome to ${tournamentTitle}!` },
        { label: "Lunch Break", text: "Lunch break in progress. Auction resumes shortly." },
        { label: "We're Back", text: "Auction resuming now. Please take your seats." },
        { label: "Congrats", text: `Congratulations to all teams at ${tournamentTitle}!` },
    ];



    // choose base list by tab
    const serialsByView = React.useMemo(() => {
        switch (serialView) {
            case "sold": return soldSerials;
            case "unsold": return unsoldSerials;
            case "na": return notAuctionedSerials;
            default: return allSerials;
        }
    }, [serialView, soldSerials, unsoldSerials, notAuctionedSerials, allSerials]);


    // apply search (by serial or name/nickname) and role filter
    const filteredSerials = React.useMemo(() => {
        const q = serialQuery.trim().toLowerCase();
        return serialsByView.filter((s) => {
            const p = serialToPlayer.get(s);
            // Role filter (exact match) if selected
            if (roleFilter !== 'all') {
                const r = String(p?.role || '').toLowerCase();
                if (r !== String(roleFilter).toLowerCase()) return false;
            }
            // Category filter (exact match) if selected
            if (categoryFilter !== 'all') {
                const c = String(p?.age_category || '').toLowerCase();
                if (c !== String(categoryFilter).toLowerCase()) return false;
            }
            // If no text query, role/category filters alone may apply
            if (!q) return true;
            // Text query can match serial, name, or nickname
            if (String(s).includes(q)) return true;
            const name = String(p?.name || "").toLowerCase();
            const nick = String(p?.nickname || "").toLowerCase();
            return name.includes(q) || nick.includes(q);
        });
    }, [serialsByView, serialQuery, serialToPlayer, roleFilter, categoryFilter]);

    // generic color helper (Sold=Green, Unsold=Red, Ongoing=Yellow, Default=Gray)
    const getSerialChipClass = (serial) => {
        const base = "text-xs px-2 py-1 rounded-md transition-colors duration-150 border";
        const isOngoing = Number(currentPlayer?.auction_serial) === Number(serial);
        if (isOngoing) return `${base} bg-yellow-600/80 border-yellow-400 text-black font-semibold`;

        const p = serialToPlayer.get(Number(serial));
        const st = p?.sold_status;
        if (st === true || String(st).toUpperCase() === "TRUE")
            return `${base} bg-green-700/80 border-green-500 text-white`;   // SOLD
        if (st === false || String(st).toUpperCase() === "FALSE")
            return `${base} bg-red-700/80 border-red-500 text-white`;       // UNSOLD

        return `${base} bg-gray-700/70 border-gray-600 text-white hover:bg-indigo-600 hover:border-indigo-400`; // default
    };

    // smooth scroll to current chip
    const scrollToCurrentSerial = () => {
        const s = Number(currentPlayer?.auction_serial);
        if (!s) return;
        const el = document.getElementById(`serial-chip-${s}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    };

    // -- Helpers for smart, range-aware quick suggestions --

    // ===== SMART SUGGESTIONS (increment + "nice" boundary aware) =====

    const getPoolBaseForCurrent = React.useCallback(() => {
        const base =
            kcplMode && activePool
                ? (KCPL_RULES.pools?.[activePool]?.base ??
                    currentPlayer?.base_price ??
                    computeBasePrice(currentPlayer))
                : (currentPlayer?.base_price ?? computeBasePrice(currentPlayer));
        return Number(base) || 0;
    }, [kcplMode, activePool, currentPlayer]);

    // is value aligned to increment grid starting at min
    const isAligned = (value, inc, min = 0) => {
        if (!inc || inc <= 0) return true;
        const diff = value - (min ?? 0);
        return diff % inc === 0;
    };

    // next aligned value >= value
    const nextAlignedUp = (value, inc, min = 0) => {
        if (!inc || inc <= 0) return value;
        const diff = value - (min ?? 0);
        const steps = Math.ceil(diff / inc);
        return (min ?? 0) + Math.max(0, steps) * inc;
    };

    // choose a "nice" boundary to jump to (for human-friendly chips)
    // - for small steps (<=200), prefer 500-multiples
    // - for mid steps (250–600), prefer 1000-multiples
    // - else: stick to aligned-up
    const niceBoundaryUp = (value, inc) => {
        const toMultiple = (v, m) => Math.ceil(v / m) * m;
        if (inc <= 200) return toMultiple(value, 500);
        if (inc <= 600) return toMultiple(value, 1000);
        return value;
    };

    const normalizeRanges = (ranges = []) =>
        [...ranges]
            .filter(r => Number.isFinite(r?.min_value) || r?.min_value === 0)
            .sort((a, b) => (a.min_value ?? 0) - (b.min_value ?? 0));

    const findRangeIndex = (ranges, amount) =>
        ranges.findIndex(r => {
            const min = r.min_value ?? 0;
            const max = r.max_value; // null => ∞
            if (max == null) return amount >= min;
            return amount >= min && amount <= max; // inclusive
        });

    /**
     * Build ~N intelligent suggestions considering:
     *   • Current amount may be off-grid (e.g., 2300 in +200 range)
     *   • Jump first to a "nice" boundary (e.g., 2500), then step coarsely
     *   • Step multiplier: for small increments we skip every other step for speed
     *   • Cross into next ranges and continue
     */

    const computeSmartSuggestions = (currentBid, base, ranges, maxCount = 10) => {
    const rs = normalizeRanges(ranges);
    if (rs.length === 0) return [];

    // Find the increment that applies to a given amount
    const getIncrementFor = (amount) => {
        for (const r of rs) {
            const min = r.min_value ?? 0;
            const max = r.max_value; // null => ∞
            if (max == null && amount >= min) return Math.max(1, Number(r.increment) || 1);
            if (max != null && amount >= min && amount < max) return Math.max(1, Number(r.increment) || 1);
        }
        // Fallback: use the first range's increment
        return Math.max(1, Number(rs[0].increment) || 1);
    };

    const seen = new Set();
    const out = [];

    const pushVal = (v) => {
        const x = Math.max(Number(v) || 0, base); // never below base
        if (!Number.isFinite(x)) return;
        if (x < base) return;
        if (seen.has(x)) return;
        seen.add(x);
        out.push(x);
    };

    // Start around current bid (or base if bid is lower/zero)
    const start = Math.max(Number(currentBid) || 0, base);
    pushVal(start);

    let up = start;
    let down = start;
    let canStepDown = true;

    // Alternate: one step up, one step down (but don't go < base)
    while (out.length < maxCount) {
        let progressed = false;

        // Step UP
        const incUp = getIncrementFor(up);
        const nextUp = up + incUp;
        if (Number.isFinite(nextUp)) {
            pushVal(nextUp);
            up = nextUp;
            progressed = true;
        }
        if (out.length >= maxCount) break;

        // Step DOWN
        // Use amount just below current to pick correct slab,
        // but clamp final value so it never goes below base.
        if (canStepDown) {
            const incDown = getIncrementFor(Math.max(down - 1, base));
            const nextDown = down - incDown;
            if (nextDown < base) {
                canStepDown = false; // don't attempt any more downward steps
            } else {
                pushVal(nextDown);
                down = nextDown;
                progressed = true;
            }
        }

        if (!progressed) break;
    }

    // Show chips in ascending order
    out.sort((a, b) => a - b);
    return out;
};







    useEffect(() => {
        const fetchTournamentId = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();

                if (res.ok && data.id) {
                    setTournamentId(data.id);
                    setTournamentTitle(data.title || 'Tournament');
                } else {
                    console.error("❌ Tournament not found for slug:", tournamentSlug);
                }
            } catch (err) {
                console.error("❌ Error fetching tournament by slug:", err);
            }
        };

        fetchTournamentId();
    }, [tournamentSlug]);

    useEffect(() => {
        if (kcplMode && tournamentId && activePool) {
            fetch(`${API}/api/kcpl/team-states/${tournamentId}?activePool=${activePool}`)
                .then(res => res.json())
                .then(data => {
                    const transformed = data.map(team => ({
                        ...team,
                        remainingByPool: KCPL_RULES.order.reduce((acc, p) => {
                            const limit = Number(team.limitByPool?.[p] ?? 0);
                            const spent = Number(team.spentByPool?.[p] ?? 0);
                            acc[p] = Math.max(0, limit - spent);
                            return acc;
                        }, {}),
                        // DO NOT override maxBidByPool, just take from backend
                    }));
                    setKcplTeamStates(transformed);
                })


                .catch(err => console.error("Failed to fetch KCPL team states:", err));
        }
    }, [kcplMode, tournamentId, activePool]);




    useEffect(() => {
        fetch(`${API}/api/custom-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: isSecretBiddingActive ? "__SECRET_BIDDING_ACTIVE__" : "__CLEAR_CUSTOM_VIEW__",
                tournament_id: tournamentId,
                slug: tournamentSlug,
            })
        });
    }, [isSecretBiddingActive]);

    useEffect(() => {
        if (!tournamentSlug) return;

        const fetchBidIncrements = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/${tournamentSlug}/bid-increments`);
                if (!res.ok) throw new Error("Failed to fetch bid increments");

                const data = await res.json();
                setBidIncrements(data);
            } catch (err) {
                console.error("❌ Error fetching bid increments:", err);
            }
        };

        fetchBidIncrements();
    }, [tournamentSlug]);



    useEffect(() => {
        if (!tournamentId) return;

        fetchPlayers();
        fetchTeams(tournamentId);
        fetchCurrentPlayer();
    }, [tournamentId, kcplMode, activePool]);

    // useEffect(() => {
    //     if (!tournamentId || !kcplMode) return;
    //     (async () => {
    //         await fetch(`${API}/api/kcpl/initialize`, {
    //             method: "POST",
    //             headers: { "Content-Type": "application/json" },
    //             body: JSON.stringify({ tournament_id: tournamentId })
    //         });
    //         await fetch(`${API}/api/kcpl/active-pool`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pool: "" }) });
    //         setActivePool("");
    //     })();
    // }, [tournamentId, kcplMode]);

    // useEffect(() => {
    //     if (!tournamentId) return;

    //     const initKCPL = async () => {
    //         try {
    //             await fetch(`${API}/api/kcpl/initialize`, {
    //                 method: "POST",
    //                 headers: { "Content-Type": "application/json" },
    //                 body: JSON.stringify({ tournament_id: tournamentId })
    //             });
    //             console.log("✅ KCPL caps initialized from DB");
    //         } catch (err) {
    //             console.error("❌ Error initializing KCPL caps:", err);
    //         }
    //     };

    //     initKCPL();
    // }, [tournamentId]);

    useEffect(() => {
        if (currentPlayer?.cricheroes_id) {
            fetch(`${API}/api/cricheroes-stats/${currentPlayer.cricheroes_id}`)
                .then(res => res.json())
                .then(data => setPlayerStats(data))
                .catch(err => console.error("Error fetching Cricheroes stats:", err));
        } else {
            setPlayerStats(null);
        }
    }, [currentPlayer]);




    // Auto reset team view when new player selected

    useEffect(() => {
        const resetTeamView = async () => {
            try {
                // Only emit if a team view was active
                if (isTeamViewActive) {
                    await fetch(`${API}/api/show-team`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            team_id: null,
                            tournament_id: tournamentId,
                            tournament_slug: tournamentSlug,
                        }),
                    });
                    setIsTeamViewActive(false);
                }
            } catch (err) {
                console.error("❌ Failed to reset team view:", err);
            }
        };

        resetTeamView();
    }, [currentPlayer?.id]);

    // Auto reset team loop when new player is selected

    useEffect(() => {
        const stopTeamLoop = async () => {
            if (isTeamLoopActive) {
                await fetch(`${API}/api/stop-team-loop`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        slug: tournamentSlug,
                        tournament_id: tournamentId,
                    }),
                });
                setIsTeamLoopActive(false);
            }
        };

        stopTeamLoop();
    }, [currentPlayer?.id]);


    useEffect(() => {
        const fetchBidIncrements = async () => {
            try {
                const res = await fetch(`/api/bid-increments?tournament_id=${tournamentId}`);
                const data = await res.json();
                setBidIncrements(data.length > 0 ? data : [
                    { min_value: 0, max_value: 3000, increment: 100 },
                    { min_value: 3000, max_value: 5000, increment: 500 },
                    { min_value: 5000, max_value: null, increment: 1000 }
                ]);
            } catch (err) {
                console.error("❌ Failed to fetch bid increments:", err);
            }
        };

        fetchBidIncrements();
    }, []);

    // ✅ Socket listeners: recolour chips on all Admin screens (safe placement after refreshKcplTeamStates)
    useEffect(() => {
        if (!socketRef.current) return;

        const onPlayerSold = (payload = {}) => {
            const { player_id, team_id, sold_price, sold_pool } = payload;

            // 1) Update local players[] -> triggers chip colour recompute
            setPlayers(prev =>
                Array.isArray(prev)
                    ? prev.map(p =>
                        Number(p.id) === Number(player_id)
                            ? { ...p, sold_status: true, team_id, sold_price, sold_pool }
                            : p
                    )
                    : prev
            );

            // 2) Keep current player in sync if it's the same one
            setCurrentPlayer(prev =>
                prev && Number(prev.id) === Number(player_id)
                    ? { ...prev, sold_status: true, team_id, sold_price, sold_pool }
                    : prev
            );

            // Keep cached detail data in sync for future selections
            upsertDetailCache({
                id: player_id,
                sold_status: true,
                team_id,
                sold_price,
                sold_pool,
            });

            // 3) (optional) KCPL summary refresh
            refreshKcplTeamStates?.();

            // 4) Non-KCPL: refresh teams to update max_bid_allowed/bought_count
            fetchTeams?.(tournamentId);
        };

        const onPlayerUnsold = (payload = {}) => {
            const { player_id, sold_pool } = payload;

            setPlayers(prev =>
                Array.isArray(prev)
                    ? prev.map(p =>
                        Number(p.id) === Number(player_id)
                            ? { ...p, sold_status: false, team_id: null, sold_price: 0, sold_pool }
                            : p
                    )
                    : prev
            );

            setCurrentPlayer(prev =>
                prev && Number(prev.id) === Number(player_id)
                    ? { ...prev, sold_status: false, team_id: null, sold_price: 0, sold_pool }
                    : prev
            );

            // Keep cached detail data in sync for future selections
            upsertDetailCache({
                id: player_id,
                sold_status: false,
                team_id: null,
                sold_price: 0,
                sold_pool,
            });

            refreshKcplTeamStates?.();

            // Non-KCPL: refresh teams to update max_bid_allowed/bought_count
            fetchTeams?.(tournamentId);
        };

        socketRef.current.on("playerSold", onPlayerSold);
        socketRef.current.on("playerUnsold", onPlayerUnsold);

        return () => {
            socketRef.current?.off("playerSold", onPlayerSold);
            socketRef.current?.off("playerUnsold", onPlayerUnsold);
        };
    }, [kcplMode, tournamentId, activePool]); // note: not capturing refreshKcplTeamStates to avoid TDZ




    // Function to update theme

    const updateTheme = async () => {
        const payload = { theme: selectedTheme };
        if (tournamentSlug) {
            payload.slug = tournamentSlug;
        }

        await fetch(`${API}/api/theme`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const scope = tournamentSlug ? ` for ${tournamentSlug}` : "";
        alert(`🎨 Theme updated${scope} to: ${selectedTheme}`);
    };

    // Function to update increment

    const getDynamicBidIncrement = (bid) => {
        // Loop through all bid rules
        for (let rule of bidIncrements) {
            const min = rule.min_value ?? 0;
            const max = rule.max_value;

            // If max is null, it means open-ended range
            if (max === null && bid >= min) return rule.increment;

            // If within range
            if (bid >= min && bid < max) return rule.increment;
        }

        return 100; // fallback if nothing matches
    };

    // Next bid amount to test team eligibility (KCPL-aware base/increments)
    const getNextBidAmountForEligibility = React.useCallback(() => {
        const base = Number(getPoolBaseForCurrent?.() ?? 0) || 0;
        const current = typeof bidAmount === "number" ? bidAmount : (parseInt(bidAmount, 10) || 0);
        const normalized = Number.isFinite(current) ? current : 0;

        if (isBidManual) {
            return Math.max(normalized, base);
        }

        if (normalized <= 0) return base;
        const inc = Number(getDynamicBidIncrement(normalized)) || 0;
        return normalized + inc;
    }, [bidAmount, getPoolBaseForCurrent, isBidManual]);

    // Determine if a team can legally bid the next amount, and why/why not
    const getTeamEligibility = React.useCallback((team) => {
        const nextBid = getNextBidAmountForEligibility();
        if (!Number.isFinite(nextBid) || nextBid <= 0) return { eligible: true, reason: "" };

        if (kcplMode) {
            const st = kcplTeamStates?.find?.(t => Number(t.teamId) === Number(team.id));
            const poolStats = st?.poolStats?.[activePool] || {};
            const maxAllowed = Number(poolStats?.maxBid);
            const maxPlayers = Number(poolStats?.maxPlayers);

            // Global squad-size guard: deactivate when total slots are full
            const totalBought = Object.values(st?.boughtByPool || {}).reduce((sum, v) => sum + Number(v || 0), 0);
            if (Number.isFinite(KCPL_RULES.totalSquadSize) && totalBought >= KCPL_RULES.totalSquadSize) {
                return { eligible: false, reason: "Squad full" };
            }

            // Pool-specific slots left
            if (Number.isFinite(maxPlayers) && maxPlayers <= 0) {
                return { eligible: false, reason: "No slots left" };
            }
            if (Number.isFinite(maxAllowed) && nextBid > maxAllowed) {
                return { eligible: false, reason: "Exceeds max bid" };
            }
            return { eligible: true, reason: "" };
        }

        // Non-KCPL
        const maxAllowed = team?.max_bid_allowed;
        if (maxAllowed != null && Number.isFinite(Number(maxAllowed))) {
            if (nextBid > Number(maxAllowed)) {
                return { eligible: false, reason: "Exceeds max bid" };
            }
            return { eligible: true, reason: "" };
        }

        // Fallback: purse check (budget - spent >= nextBid)
        const spent = Array.isArray(team?.players)
            ? team.players.reduce((sum, p) => sum + (Number(p?.sold_price) || 0), 0)
            : 0;
        const purse = Math.max(Number(team?.budget || 0) - spent, 0);
        if (purse < nextBid) return { eligible: false, reason: "Insufficient purse" };
        return { eligible: true, reason: "" };
    }, [kcplMode, kcplTeamStates, activePool, getNextBidAmountForEligibility]);

    // Determine if a team can legally bid the next amount
    const canTeamBid = React.useCallback((team) => {
        try {
            const nextBid = getNextBidAmountForEligibility();
            if (!Number.isFinite(nextBid) || nextBid <= 0) return true;

            if (kcplMode) {
                const st = kcplTeamStates?.find?.(t => Number(t.teamId) === Number(team.id));
                const poolStats = st?.poolStats?.[activePool] || {};
                const maxAllowed = poolStats?.maxBid;
                const maxPlayers = poolStats?.maxPlayers;

                // Global squad-size guard
                const totalBought = Object.values(st?.boughtByPool || {}).reduce((sum, v) => sum + Number(v || 0), 0);
                if (Number.isFinite(KCPL_RULES.totalSquadSize) && totalBought >= KCPL_RULES.totalSquadSize) return false;

                // Pool slots guard
                if (Number.isFinite(maxPlayers) && Number(maxPlayers) <= 0) return false;
                if (Number.isFinite(maxAllowed) && nextBid > Number(maxAllowed)) return false;
                return true;
            }

            // Non-KCPL
            const maxAllowed = team?.max_bid_allowed;
            if (maxAllowed != null && Number.isFinite(Number(maxAllowed))) {
                if (nextBid > Number(maxAllowed)) return false;
                return true;
            }

            // Fallback: basic purse check (budget - spent >= nextBid)
            const spent = Array.isArray(team?.players)
                ? team.players.reduce((sum, p) => sum + (Number(p?.sold_price) || 0), 0)
                : 0;
            const purse = Math.max(Number(team?.budget || 0) - spent, 0);
            return purse >= nextBid;
        } catch (e) {
            console.warn("Eligibility check failed for team", team?.id, e);
            return true; // fail-open
        }
    }, [kcplMode, kcplTeamStates, activePool, getNextBidAmountForEligibility]);

    // Function to updated team secret code

    const handleGenerateCodes = async () => {
        if (!tournamentSlug) return alert("Tournament slug is missing");

        // Step 1: Check if any team already has a secret_code
        const existingRes = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
        const existingTeams = await existingRes.json();

        const hasExistingCodes = existingTeams.some(team => team.secret_code !== null);

        // Step 2: First confirmation
        const confirm1 = window.confirm("Are you sure you want to generate secret codes?");
        if (!confirm1) return;

        // Step 3: Second confirmation if codes already exist
        if (hasExistingCodes) {
            const confirm2 = window.prompt(
                "⚠️ Some teams already have secret codes.\n\nThis will overwrite existing codes.\n\nTo confirm, type YES in capital letters:"
            );
            if (confirm2 !== "YES") {
                alert("❌ Cancelled. You did not type YES.");
                return;
            }
        }

        // Step 4: Proceed with generation
        try {
            const res = await fetch(`${API}/api/teams/generate-secret-codes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: tournamentSlug }),
            });

            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchTeams(tournamentId); // Refresh team list
            } else {
                alert(data.error || "Something went wrong");
            }
        } catch (error) {
            console.error(error);
            alert("❌ Error generating codes");
        }
    };


    const fetchPlayers = async () => {
        if (!tournamentId) return;

        let url = `${API}/api/players?tournament_id=${tournamentId}&slug=${tournamentSlug}`;

        // KCPL-specific: append pool filter only if KCPL mode is active
        if (kcplMode && activePool) {
            url += `&pool=${activePool}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        setPlayers(data);
    };

    const broadcastActiveBidderDisplay = async (opts) => {
        try {
            await fetch(`${API}/api/custom-message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: {
                        activeBidderDisplay: opts,
                        tournament_id: tournamentId,
                        tournament_slug: tournamentSlug,
                    },
                    tournament_id: tournamentId,
                    slug: tournamentSlug,
                }),
            });
        } catch (err) {
            console.error("Failed to update active bidder display prefs", err);
        }
    };




    const fetchTeams = async (tournamentId) => {
        try {
            const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);

            if (!res.ok) {
                console.error("❌ Failed to fetch teams. Status:", res.status);
                setTeams([]);
                return;
            }

            const text = await res.text();
            if (!text) {
                console.warn("⚠️ Empty response from /api/teams");
                setTeams([]);
                return;
            }

            const data = JSON.parse(text);
            if (!Array.isArray(data)) {
                console.error("❌ Expected an array, got:", data);
                setTeams([]);
                return;
            }

            setTeams(data.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))));
        } catch (error) {
            console.error("❌ Failed to fetch teams:", error);
            setTeams([]);
        }
    };



    const fetchCurrentPlayer = async () => {
        try {
            const res = await fetch(`${API}/api/current-player?tournament_id=${tournamentId}`);
            if (!res.ok) {
                console.warn("No current player available yet.");
                setCurrentPlayer(null);
                return;
            }

            const data = await res.json();

            // Defensive: Make sure it's a valid player
            if (!data || !data.id || typeof data.id !== "number") {
                console.warn("Invalid current player object:", data);
                setCurrentPlayer(null);
                return;
            }

            if (res.status === 204) {
                console.log("No current player found after reset");
                setCurrentPlayer(null);
                return;
            }

            setCurrentPlayer(data);
            setIsSecretBiddingActive(Boolean(data.secret_bidding_enabled));
        } catch (err) {
            console.error("🔥 Error fetching current player:", err);
            setCurrentPlayer(null);
        }
    };


    const updateCurrentBid = async () => {
        try {
            if (!selectedTeam) {
                alert("Please select a team first.");
                return;
            }

            const amt = typeof bidAmount === "number" ? bidAmount : parseInt(bidAmount, 10) || 0;

            // Non-KCPL guard against team's max bid (when available)
            if (!kcplMode && selectedTeam?.id) {
                try {
                    const teamData = await fetch(`${API}/api/teams/${selectedTeam.id}`).then(r => r.json());
                    if (teamData?.max_bid_allowed != null && amt > teamData.max_bid_allowed) {
                        alert(
                            `❌ Bid blocked: Cannot bid ₹${amt.toLocaleString()} as it exceeds the max allowed of ₹${teamData.max_bid_allowed.toLocaleString()}`
                        );
                        return;
                    }
                } catch (e) {
                    console.warn("Max bid validation (non-KCPL) skipped due to fetch error:", e);
                }
            }

            // 1) Spectators first
            socketRef.current?.emit("bidUpdated", {
                bid_amount: amt,
                team_name: selectedTeam,
                active_pool: activePool || null,
                tournament_id: tournamentId,
                tournament_slug: tournamentSlug,
            });

            // 2) Then persist
            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: amt,
                    team_name: selectedTeam,
                    active_pool: activePool || null,
                    tournament_id: tournamentId,
                })
            });

            // keep local state clean
            setBidAmount(amt);
            setIsBidManual(true);
        } catch (err) {
            console.error("❌ updateCurrentBid failed:", err);
            alert("Failed to update bid. Please try again.");
        }
    };


    const refreshKcplTeamStates = async () => {
        if (!kcplMode || !tournamentId) return;
        try {
            const res = await fetch(`${API}/api/kcpl/team-states/${tournamentId}?activePool=${activePool}`);
            const data = await res.json();
            const transformed = data.map(team => ({
                ...team,
                remainingByPool: KCPL_RULES.order.reduce((acc, p) => {
                    const limit = Number(team.limitByPool?.[p] ?? 0);
                    const spent = Number(team.spentByPool?.[p] ?? 0);
                    acc[p] = Math.max(0, limit - spent);
                    return acc;
                }, {}),
            }));
            setKcplTeamStates(transformed);
        } catch (e) {
            console.error("Failed to refresh KCPL team states", e);
        }
    };


    const markAsSold = async () => {
        if (markSoldInProgress) return;
        if (!selectedTeam || bidAmount === 0) {
            alert("Cannot mark as sold without a valid bid and team.");
            return;
        }
        const poolBase = kcplMode && activePool
            ? (KCPL_RULES.pools?.[activePool]?.base
                ?? currentPlayer?.base_price
                ?? computeBasePrice(currentPlayer))
            : (currentPlayer?.base_price ?? computeBasePrice(currentPlayer));

        if (bidAmount < poolBase) {
            alert(`❌ Sold price must be at least ₹${poolBase}`);
            return;
        }

        const team = teams.find(t => t.name === selectedTeam);
        if (!team) {
            alert("Team not found!");
            return;
        }

        const teamId = team.id;
        setMarkSoldInProgress(true);

        // Save undo
        setUndoStack(prev => [...prev, {
            type: "sold",
            player: currentPlayer,
            teamName: selectedTeam,
            bidAmount,
        }]);

        // Prepare data
        const updatedPlayer = {
            ...currentPlayer,
            sold_status: "TRUE",
            team_id: teamId,
            sold_price: bidAmount,
            base_price: currentPlayer.base_price || computeBasePrice(currentPlayer)
        };

        const newPlayer = {
            id: currentPlayer.id,
            name: currentPlayer.name,
            role: currentPlayer.role,
            base_price: currentPlayer.base_price,
            profile_image: currentPlayer.profile_image,
            sold_price: bidAmount,
            sold_status: "TRUE"
        };

        const updatedTeam = {
            ...team,
            players: [...(team.players || []), newPlayer],
            budget: team.budget - bidAmount
        };

        // 🔊 Broadcast immediately (optimistic), then persist in DB.
        socketRef.current?.emit("bidUpdated", {
            bid_amount: bidAmount,
            team_name: selectedTeam,
            active_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        });
        socketRef.current?.emit("playerSold", {
            player_id: currentPlayer.id,
            team_id: teamId,
            sold_price: bidAmount,
            sold_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        });

        // ✅ Perform critical updates in parallel (skip bid reset here)
        try {
            await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...updatedPlayer, tournament_id: tournamentId })
            }),
            fetch(`${API}/api/players/${currentPlayer.id}?slug=${tournamentSlug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sold_status: "TRUE",
                    team_id: teamId,
                    sold_price: bidAmount,
                    sold_pool: activePool,
                    active_pool: activePool
                })
            }),
            fetch(`${API}/api/teams/${team.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedTeam)
            })
            ]);
        } catch (err) {
            console.error("Failed to mark player as sold:", err);
            setMarkSoldInProgress(false);
            return;
        }

        // Refresh teams so non-KCPL max_bid_allowed and bought_count reflect instantly
        try { await fetchTeams(tournamentId); } catch {}

        // Notify immediately with correct bid and team
        // socketRef.current?.emit("bidUpdated", {
        //     bid_amount: bidAmount,
        //     team_name: selectedTeam
        // });

        // socketRef.current?.emit("playerSold", {
        //     player_id: currentPlayer.id,
        //     team_id: teamId,
        //     sold_price: bidAmount,
        //     sold_pool: activePool
        // });

        // Fire notifications (non-blocking)
        fetch(`${API}/api/notify-sold`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer),
        });

        fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...updatedPlayer, tournament_id: tournamentId, tournament_slug: tournamentSlug }),
        });

        // 🎉 Confetti
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 },
            colors: ['#ff0', '#f00', '#fff', '#0f0', '#00f']
        });

        // ✅ Non-blocking toast (optional). Replace with your toast lib or remove.
        if (window?.toast) {
            window.toast.success("🎉 Player SOLD and team updated!");
        }

        // ✅ Optimistic UI update (no heavy refetches)
        setCurrentPlayer(prev =>
            prev
                ? {
                    ...prev,
                    sold_status: "TRUE",
                    team_id: teamId,
                    sold_price: bidAmount,
                    sold_pool: activePool,
                }
                : prev
        );
        setBidAmount(0);
        setSelectedTeam("");

        // 🔄 Keep local players[] in sync so quick-pick chip colours update instantly
        setPlayers(prev =>
            Array.isArray(prev)
                ? prev.map(p =>
                    Number(p.id) === Number(currentPlayer.id)
                        ? {
                            ...p,
                            // we normalize to boolean locally (colour logic accepts both)
                            sold_status: true,
                            team_id: teamId,
                            sold_price: bidAmount,
                            sold_pool: activePool,
                        }
                        : p
                )
                : prev
        );

        // Keep cached detail copy aligned so revisits show the latest status
        upsertDetailCache({
            ...currentPlayer,
            sold_status: "TRUE",
            team_id: teamId,
            sold_price: bidAmount,
            sold_pool: activePool,
        });


        // ✅ Immediately reset the bid on server & broadcast (no 3s delay)
        fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId }),
        });
        socketRef.current?.emit("bidUpdated", {
            bid_amount: 0,
            team_name: "",
            active_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        });

        // 🔎 (Optional) Refresh only the affected team's lightweight KCPL snapshot,
        // not the entire teams/players lists. Enable the endpoint if you haven't.
        try {
            const snap = await fetch(`${API}/api/kcpl/team-state/${teamId}`).then(r => r.json());
            setTeamPoolState(snap);
        } catch (e) {
            console.warn("❌ Failed to fetch team snapshot:", e);
        }

        try {
            const [snap] = await Promise.all([
                fetch(`${API}/api/kcpl/team-state/${teamId}`).then(r => r.json()),
                refreshKcplTeamStates(), // ✅ ← add it here
            ]);
            setTeamPoolState(snap);
        } catch (e) {
            console.warn("❌ Snapshot refresh error:", e);
        }

        setMarkSoldInProgress(false);
    };


    const markAsUnsold = async () => {
        if (markUnsoldInProgress) return;
        setMarkUnsoldInProgress(true);
        try {
        // Save undo
        setUndoStack(prev => [...prev, { type: "unsold", player: currentPlayer }]);

        // Prepare updated player (DB truth)
        const updatedPlayer = {
            ...currentPlayer,
            sold_status: "FALSE",
            team_id: null,
            sold_price: 0,
            sold_pool: activePool,
        };

        // Tell spectators to show the UNSOLD overlay (socket)
        socketRef.current?.emit("playerUnsold", {
            player_id: currentPlayer.id,
            sold_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        });

        // Persist to DB (current-player + players)
        await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...updatedPlayer, tournament_id: tournamentId }),
            }),
            fetch(`${API}/api/players/${currentPlayer.id}?slug=${tournamentSlug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPlayer),
            }),
        ]);

        // Notify spectators with a MINIMAL payload (prevents 0/null flicker)
        const minimalUnsold = {
            id: currentPlayer.id,
            sold_status: "FALSE",
            sold_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        };
        fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(minimalUnsold),
        });

        // Optimistic Admin UI
        if (window?.toast) window.toast.info("Player marked as UNSOLD.");
        setCurrentPlayer(updatedPlayer);
        setBidAmount(0);
        setSelectedTeam("");

        // 🔄 Keep local players[] in sync so quick-pick chip colours update instantly
        setPlayers(prev =>
            Array.isArray(prev)
                ? prev.map(p =>
                    Number(p.id) === Number(currentPlayer.id)
                        ? {
                            ...p,
                            sold_status: false,
                            team_id: null,
                            sold_price: 0,
                            sold_pool: activePool,
                        }
                        : p
                )
                : prev
        );

        // Refresh cached detail so re-selecting the player keeps UNSOLD status
        upsertDetailCache({
            ...currentPlayer,
            sold_status: "FALSE",
            team_id: null,
            sold_price: 0,
            sold_pool: activePool,
        });


        // Reset current bid immediately + broadcast
        // Reset current bid on the server silently (no broadcast)
        // Optional: delay to let spectators finish the UNSOLD overlay
        setTimeout(() => {
            fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId }),
            });
        }, 1200);


        // Fast KCPL summary refresh (optional)
        try {
            await refreshKcplTeamStates();
        } catch (e) {
            console.warn("KCPL table refresh failed:", e);
        }

        // Non-KCPL: refresh teams to update max_bid_allowed/bought_count
        try { await fetchTeams(tournamentId); } catch {}
        } finally {
            setMarkUnsoldInProgress(false);
        }
    };



    const handleNextPlayer = async () => {
        try {
            if (isBiddingLocked) {
                alert("Bidding is in progress for the current player. Finish or clear it before moving to the next player.");
                return;
            }
            // 1. Get all players once
            const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const allPlayers = await res.json();

            // 2. KCPL-specific filtering
            let unprocessedPlayers = [];
            if (kcplMode && activePool) {
                const prevPools =
                    activePool === "B" ? ["A"] :
                        activePool === "C" ? ["A", "B"] :
                            activePool === "D" ? ["A", "B", "C"] : [];

                unprocessedPlayers = allPlayers.filter(p => {
                    const isUnprocessed = (p.sold_status === null || p.sold_status === undefined) && !p.deleted_at;
                    const isPrevPoolUnprocessed = prevPools.includes(p.base_category) && isUnprocessed;
                    const isPrevPoolUnsold = prevPools.includes(p.base_category) &&
                        (p.sold_status === false || p.sold_status === "FALSE");
                    const isCurrentPoolUnprocessed = p.base_category === activePool && isUnprocessed;
                    const isCurrentPoolUnsold = p.base_category === activePool &&
                        (p.sold_status === false || p.sold_status === "FALSE");

                    // Block unsold from the current pool unless reopened manually
                    return (
                        isCurrentPoolUnprocessed ||
                        (isPrevPoolUnprocessed && p.sold_pool !== activePool) ||
                        isPrevPoolUnsold
                    ) && !(isCurrentPoolUnsold && p.sold_pool === activePool);
                });

                // 3. Override base price for migrated unsold players from previous pools
                unprocessedPlayers = unprocessedPlayers.map(p => {
                    if (prevPools.includes(p.base_category) &&
                        (p.sold_status === null || p.sold_status === false || p.sold_status === "FALSE")) {
                        return {
                            ...p,
                            base_price: KCPL_RULES.pools[activePool]?.base || p.base_price
                        };
                    }
                    return p;
                });

            } else {
                // Non-KCPL: pick from ANY unprocessed player (no pool filter)
                unprocessedPlayers = allPlayers.filter(
                    (p) =>
                        (p.sold_status === null || p.sold_status === undefined) &&
                        !p.deleted_at
                );
            }

            if (unprocessedPlayers.length === 0) {
                alert("✅ All players have been auctioned.");
                return;
            }

            // 4. Pick a random player
            const nextBasic = unprocessedPlayers[Math.floor(Math.random() * unprocessedPlayers.length)];

            // 5. Fetch full details
            const detailUrl = kcplMode && activePool
                ? `${API}/api/players/${nextBasic.id}?slug=${tournamentSlug}&active_pool=${activePool}`
                : `${API}/api/players/${nextBasic.id}?slug=${tournamentSlug}`;

            const detailedRes = await fetch(detailUrl);
            const nextPlayer = await detailedRes.json();

            // 6. Save undo state
            setUndoStack(prev => [...prev, { type: "next", player: currentPlayer }]);

            // 7. Update current player & bid in parallel
            await Promise.all([
                fetch(`${API}/api/current-player`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...nextPlayer, tournament_id: tournamentId })
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId })
                })
            ]);

            // 8. Notify spectators (non-blocking)
            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...nextPlayer, tournament_id: tournamentId, tournament_slug: tournamentSlug }),
            });

            // 9. Update admin UI
            setPlayers(allPlayers);
            setCurrentPlayer(nextPlayer);
            setBidAmount(0);
            setSelectedTeam('');

        } catch (err) {
            console.error("❌ Error in handleNextPlayer:", err);
            alert("❌ Could not load next player.");
        }
    };

// put near other refs
const detailCacheRef = useRef(new Map()); // key: playerId, value: detailed player

// Keep the local detail cache in sync when a player's status changes
const upsertDetailCache = React.useCallback((player) => {
    if (!player?.id) return;
    const prev = detailCacheRef.current.get(player.id) || {};
    detailCacheRef.current.set(player.id, { ...prev, ...player });
}, []);

const getDetailedPlayer = async (basic) => {
  if (!basic?.id) return basic;
  const cached = detailCacheRef.current.get(basic.id);
  if (cached) return cached;

  const detailUrl =
    kcplMode && activePool
      ? `${API}/api/players/${basic.id}?slug=${tournamentSlug}&active_pool=${activePool}`
      : `${API}/api/players/${basic.id}?slug=${tournamentSlug}`;

  const res = await fetch(detailUrl);
  if (!res.ok) return basic;
  const detailed = await res.json();
  detailCacheRef.current.set(basic.id, detailed);
  return detailed;
};

const prefetchBySerial = async (serial) => {
  const p = serialToPlayer.get(Number(serial));
  if (!p?.id || detailCacheRef.current.has(p.id)) return;
  try { await getDetailedPlayer(p); } catch { /* ignore */ }
};


    // ---- Full replacement: resilient search by serial ----
    // ---- Full replacement: ultra-fast selection by serial (optimistic + cached) ----
const handleSearchById = async (idOverride) => {
  try {
    if (isBiddingLocked) {
      alert("Bidding is in progress for the current player. Finish or clear it before switching.");
      return;
    }
    // take from pill if provided, otherwise from the input
    const raw = idOverride ?? searchId;
    const idToFind = raw != null ? String(raw).trim() : "";
    if (!idToFind) {
      alert("Please enter or select a player serial.");
      return;
    }

    // normalize to number when possible (handles "007", "  15 " etc.)
    const n = Number(idToFind);
    const serialParam = Number.isFinite(n) ? String(n) : idToFind;

    // ---- 0) Try in-memory map first (instant UX) ----
    let basic = serialToPlayer.get(Number(serialParam));

    // Fallback: hit by-serial endpoint only if not in memory
    if (!basic) {
      const res = await fetch(
        `${API}/api/players/by-serial/${encodeURIComponent(serialParam)}?slug=${tournamentSlug}`
      );
      if (!res.ok) {
        alert("❌ Player not found.");
        return;
      }
      basic = await res.json();
      if (Number(basic.tournament_id) !== Number(tournamentId)) {
        alert("❌ Player not found in this tournament.");
        return;
      }
    }

    // ---- 1) Optimistic UI now (feels instant) ----
    setCurrentPlayer((prev) => ({
      ...prev,
      ...basic,
      sold_status: basic.sold_status ?? null,
      sold_price: basic.sold_price ?? null,
      team_id: basic.team_id ?? null,
      sold_pool: basic.sold_pool ?? null,
    }));
    setBidAmount(0);
    setSelectedTeam("");
    setSearchId(serialParam);

    // ---- 2) Fetch detailed (from cache or network) in parallel with PUTs ----
    const detailedPromise = getDetailedPlayer(basic);

    // Persist current-player + reset bid together
  const persistPromise = Promise.all([
      fetch(`${API}/api/current-player`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basic, tournament_id: tournamentId }), // will replace with detailed when it resolves below
      }),
      fetch(`${API}/api/current-bid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId }),
      }),
    ]);

    // When detailed arrives, update UI & overwrite server current-player (quick follow-up)
  detailedPromise.then(async (detailed) => {
      // update UI only if we are still looking at the same player
      setCurrentPlayer((prev) => (prev && prev.id === detailed.id ? { ...prev, ...detailed } : prev));
      // refresh server copy with detailed (non-blocking best-effort)
      fetch(`${API}/api/current-player`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...detailed, tournament_id: tournamentId }),
        keepalive: true,
      });
      // notify spectators (same as your existing flow)
      fetch(`${API}/api/notify-player-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...detailed, tournament_id: tournamentId, tournament_slug: tournamentSlug }),
        keepalive: true,
      });
    });

    // don’t block the UI on notifications
    persistPromise.catch(() => { /* surface errors only if needed */ });

  } catch (err) {
    console.error("❌ Error in handleSearchById:", err);
    alert("❌ Failed to find player. Please try again.");
  }
};




    const socketRef = useRef(null);

    // Debounce the snapshot fetch used for the side panel

    const teamSnapTimerRef = useRef(null);
    const queueLightweightTeamSnapshot = (teamId) => {
        if (teamSnapTimerRef.current) clearTimeout(teamSnapTimerRef.current);
        teamSnapTimerRef.current = setTimeout(async () => {
            try {
                const snap = await fetch(`${API}/api/kcpl/team-state/${teamId}`).then(r => r.json());
                setTeamPoolState(snap);
            } catch {
                /* ignore errors silently */
            }
        }, 250); // run only after the user pauses clicking for 250ms
    };

    // Inside useEffect, connect only once
    useEffect(() => {
        socketRef.current = io(API, {
            transports: ["websocket"],   // only WebSocket
            upgrade: false,              // skip HTTP long-polling fallback
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 500,
        });

        window.socket = socketRef.current;

        return () => {
            socketRef.current.disconnect();

        };
    }, []);


    const handleTeamClick = async (team) => {
        // Squad view: unchanged
        if (isTeamViewActive) {
            setSelectedTeam(team.name);

            await fetch(`${API}/api/show-team`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    team_id: team.id,
                    tournament_id: tournamentId,
                    tournament_slug: tournamentSlug,
                }),
            });

            socketRef.current?.emit("showTeam", {
                team_id: team.id,
                empty: team.players?.length === 0,
                tournament_id: tournamentId,
                tournament_slug: tournamentSlug,
            });

            return;
        }

        // Live auction guard
        if (!isLiveAuctionActive || !currentPlayer) return;

        setSelectedTeam(team.name);

        const currentBid =
            typeof bidAmount === "number" ? bidAmount : (parseInt(bidAmount, 10) || 0);

        // --- MANUAL MODE: lock for this click only, then revert to auto ---
        if (isBidManual) {
            const amt = currentBid;

            // Validate against max-allowed
            if (kcplMode) {
                const st = kcplTeamStates.find((t) => Number(t.teamId) === Number(team.id));
                const maxAllowed = st?.poolStats?.[activePool]?.maxBid ?? Infinity;
                if (Number.isFinite(maxAllowed) && amt > maxAllowed) {
                    alert(`❌ Bid blocked. Max allowed is ₹${maxAllowed.toLocaleString()}`);
                    return;
                }
                queueLightweightTeamSnapshot(team.id);
            } else {
                try {
                    const teamData = await fetch(`${API}/api/teams/${team.id}`).then((r) => r.json());
                    if (teamData?.max_bid_allowed != null && amt > teamData.max_bid_allowed) {
                        alert(
                            `❌ Bid blocked: Cannot bid ₹${amt.toLocaleString()} as it exceeds the max allowed of ₹${teamData.max_bid_allowed.toLocaleString()}`
                        );
                        return;
                    }
                } catch (e) {
                    console.error("Max bid validation failed", e);
                    alert("❌ Could not validate max bid. Try again.");
                    return;
                }
            }

            // Broadcast & persist without changing amount
            socketRef.current?.emit("bidUpdated", {
                bid_amount: amt,
                team_name: team.name,
                active_pool: activePool,
                tournament_id: tournamentId,
                tournament_slug: tournamentSlug,
            });

            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: amt,
                    team_name: team.name,
                    active_pool: activePool,
                    tournament_id: tournamentId,
                }),
            });

            // 🔁 IMPORTANT: consume manual mode so the NEXT click auto-flows
            setIsBidManual(false);
            return;
        }

        // --- AUTO MODE ---
        setIsBidManual(false); // keep auto mode

        // Compute base (KCPL-aware if on)
        const poolBase =
            kcplMode && activePool
                ? KCPL_RULES.pools?.[activePool]?.base ??
                currentPlayer?.base_price ??
                computeBasePrice(currentPlayer)
                : currentPlayer?.base_price ?? computeBasePrice(currentPlayer);

        const base = Number(poolBase) || 0;
        const newBid =
            currentBid <= 0 ? base : currentBid + getDynamicBidIncrement(currentBid);

        // Validate newBid
        if (kcplMode) {
            const st = kcplTeamStates.find((t) => Number(t.teamId) === Number(team.id));
            const maxAllowed = st?.poolStats?.[activePool]?.maxBid ?? Infinity;
            if (Number.isFinite(maxAllowed) && newBid > maxAllowed) {
                alert(`❌ Bid blocked. Max allowed is ₹${maxAllowed.toLocaleString()}`);
                return;
            }
            queueLightweightTeamSnapshot(team.id);
        } else {
            try {
                const teamData = await fetch(`${API}/api/teams/${team.id}`).then((r) => r.json());
                if (teamData?.max_bid_allowed != null && newBid > teamData.max_bid_allowed) {
                    alert(
                        `❌ Bid blocked: Cannot bid ₹${newBid.toLocaleString()} as it exceeds the max allowed of ₹${teamData.max_bid_allowed.toLocaleString()}`
                    );
                    return;
                }
            } catch (e) {
                console.error("Max bid validation failed", e);
                alert("❌ Could not validate max bid. Try again.");
                return;
            }
        }

        setBidAmount(newBid);

        socketRef.current?.emit("bidUpdated", {
            bid_amount: newBid,
            team_name: team.name,
            active_pool: activePool,
            tournament_id: tournamentId,
            tournament_slug: tournamentSlug,
        });

        await fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: newBid,
                team_name: team.name,
                active_pool: activePool,
                tournament_id: tournamentId,
            }),
        });
    };








    const resetAuction = async () => {
        try {
            await fetch(`${API}/api/reset-auction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tournament_id: tournamentId })
            });


            // alert("✅ Auction has been fully reset.");
            fetchPlayers(); // Refresh player list
            fetchTeams(tournamentId); // Optional
            fetchCurrentPlayer(); // Optional
            setBidAmount(0);
            setSelectedTeam('');
        } catch (err) {
            console.error("❌ Failed to reset auction:", err);
            alert("❌ Error occurred while resetting the auction.");
        }
    };




    const resetMaxBid = async () => {
        try {
            if (!tournamentId) {
                alert("Tournament not loaded yet.");
                return;
            }

            setResetMaxBidInProgress(true);
            const res = await fetch(`${API}/api/reset-max-bid`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tournament_id: tournamentId })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to reset max bid.");
            }

            await fetchTeams(tournamentId);
            alert("✅ Max bid recalculated for all teams.");
        } catch (err) {
            console.error("❌ Failed to reset max bid:", err);
            alert("❌ Error occurred while resetting max bid.");
        } finally {
            setResetMaxBidInProgress(false);
        }
    };

    const resetUnsoldPlayers = async () => {
        try {
            setResetUnsoldInProgress(true);
            const res = await fetch(`${API}/api/reset-unsold`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tournament_id: tournamentId, slug: tournamentSlug })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || "Failed to reset unsold players.");
            }

            const count = Number(data?.resetCount || 0);
            alert(count > 0 ? `Reset ${count} unsold player${count === 1 ? "" : "s"}.` : "No unsold players found.");
            fetchPlayers();
        } catch (err) {
            console.error("Error resetting unsold players:", err);
            alert("Failed to reset unsold players.");
        } finally {
            setResetUnsoldInProgress(false);
        }
    };


    const undoLastAction = async () => {
        if (undoStack.length === 0) return;

        const lastAction = undoStack[undoStack.length - 1];
        setUndoStack(undoStack.slice(0, -1));

        const { type, player, teamName, bidAmount, previousBid, previousTeam } = lastAction;

        // Restore current-player
        await fetch(`${API}/api/current-player`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(player)
        });

        // Restore current-bid
        await fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: type === "sold" ? bidAmount : 0,
                team_name: type === "sold" ? teamName : "",
                tournament_id: tournamentId,
            })
        });

        if (type === "sold") {
            const team = teams.find(t => t.name === teamName);
            const updatedPlayers = [...team.players, {
                id: player.id,
                name: player.name,
                role: player.role,
                base_price: player.base_price,
                profile_image: player.profile_image,
                sold_price: bidAmount,
                sold_status: "TRUE"
            }];

            const updatedBudget = team.budget - bidAmount;

            // Re-add player to team
            await fetch(`${API}/api/teams/${team.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...team,
                    players: updatedPlayers,
                    budget: updatedBudget
                })
            });

            // Restore player's status
            await fetch(`${API}/api/players/${player.id}?slug=${tournamentSlug}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sold_status: "TRUE",
                    team_id: teamName,
                    sold_price: bidAmount
                })
            });
        }


        if (type === "bid") {
            setSelectedTeam(previousTeam);
            setBidAmount(previousBid);

            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: previousBid,
                    team_name: previousTeam,
                    tournament_id: tournamentId,
                })
            });

            return; // early return as no current-player/team changes
        }


        if (type === "unsold") {
            await fetch(`${API}/api/players/${player.id}?slug=${tournamentSlug}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sold_status: null,
                    team_id: null,
                    sold_price: null
                })
            });

        }

        setBidAmount(type === "sold" ? bidAmount : 0);
        setSelectedTeam(type === "sold" ? teamName : '');
        fetchTeams(tournamentId);
        fetchCurrentPlayer();
    };

    const handleReopenPlayer = async () => {
        if (
            !currentPlayer ||
            !["TRUE", "FALSE", true, false, "true", "false"].includes(currentPlayer.sold_status)
        ) return;

        // Save undo
        setUndoStack(prev => [
            ...prev,
            {
                type: currentPlayer.sold_status,
                player: currentPlayer,
                teamName: currentPlayer.team_id,
                bidAmount: currentPlayer.sold_price,
            }
        ]);

        // Refund if previously SOLD
        if (currentPlayer.sold_status === "TRUE" || currentPlayer.sold_status === true) {
            const team = teams.find(t => t.id === currentPlayer.team_id || t.name === currentPlayer.team_id);
            if (team) {
                await fetch(`${API}/api/players/${currentPlayer.id}/reopen`, { method: "POST" });
            }
        }

        // Prepare reopened player object (auction-ready)
        const reopenedPlayer = {
            ...currentPlayer,
            sold_status: null,
            team_id: null,
            sold_price: null, // ✅ reset to null, not 0
            base_price: currentPlayer.base_price || computeBasePrice(currentPlayer),
            sold_pool: null,  // ✅ so filter logic allows re-selection
            active_pool: activePool // ✅ for spectator context
        };

        // Sync cache so revisiting the player shows the Reopen state immediately
        upsertDetailCache(reopenedPlayer);

        // Update DB: current_player & players & current_bid
        await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reopenedPlayer),
            }),
            fetch(`${API}/api/players/${currentPlayer.id}?slug=${tournamentSlug}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(reopenedPlayer),
            }),
            fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId })
            })
        ]);

        // Notify spectators (same as Next Player)
        await fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...reopenedPlayer, tournament_id: tournamentId, tournament_slug: tournamentSlug }),
        });

        // Update local state
        setCurrentPlayer(reopenedPlayer);
        setBidAmount(0);
        setSelectedTeam('');

        // Keep local list in sync so serial chip colour clears immediately
        setPlayers(prev =>
            Array.isArray(prev)
                ? prev.map(p =>
                    Number(p.id) === Number(currentPlayer.id)
                        ? {
                            ...p,
                            sold_status: null,
                            team_id: null,
                            sold_price: null,
                            sold_pool: null,
                        }
                        : p
                )
                : prev
        );

        fetchTeams(tournamentId);
    };


    // Clear current player from db

    const clearCurrentPlayer = async () => {
        try {
            // 1. Clear current player
            await fetch(`${API}/api/current-player/reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tournament_id: tournamentId })
            });

            // 2. Clear current bid
            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bid_amount: 0, team_name: "", tournament_id: tournamentId })
            });

            // 3. Notify spectators
            await fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: null }),
            });

            // 4. Update spectator UI
            await fetch(`${API}/api/custom-message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "__SHOW_NO_PLAYERS__", tournament_id: tournamentId, slug: tournamentSlug }),
            });

            // Broadcast the change via socket (scoped)
            socketRef.current?.emit("playerChanged", { tournament_id: tournamentId, tournament_slug: tournamentSlug });

            alert("✅ Current player cleared.");
            setCurrentPlayer(null);
            setBidAmount(0);
            setSelectedTeam('');
        } catch (err) {
            console.error("Failed to clear current player:", err);
            alert("❌ Failed to clear current player.");
        }
    };


    return (
        <div className="p-6 bg-gray-900 min-h-screen text-white">
            <h2 className="text-2xl font-bold mb-4">🔧 Admin Auction Panel</h2>

            {isTeamViewActive && (
                <div className="mb-4 p-3 bg-yellow-200 border-l-4 border-yellow-600 text-yellow-800 rounded shadow animate-pulse">
                    ⚠️ <strong>Squad View Mode Enabled:</strong> Live Auction, Player Search, and Bid Controls are temporarily disabled.
                </div>
            )}

            {/* UI to select theme */}
            <div className="my-6 border border-gray-700 rounded bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-gray-700 hover:bg-gray-600 rounded-t flex justify-between items-center"
                    onClick={() => setShowThemeSelector(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-pink-300">🎨 Theme Settings</h3>
                    <span className="text-white text-xl">
                        {showThemeSelector ? '−' : '+'}
                    </span>
                </div>

                {showThemeSelector && (
                    <div className="p-4">
                        <label className="block mb-2 font-bold text-base">Select Theme:</label>
                        <div className="inline-grid grid-cols-4 md:grid-cols-10 gap-2">
                            {Object.entries(THEMES).map(([key, style]) => (
                                <div
                                    key={key}
                                    className={`cursor-pointer rounded-xl transition-all duration-300 ${selectedTheme === key ? 'scale-105' : 'border-transparent'
                                        }`}
                                    style={{
                                        background: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
                                    }}
                                    onClick={() => setSelectedTheme(key)}
                                >
                                    <div className="items-center">
                                        <div className={`w-10 h-10 rounded-md bg-gradient-to-br ${style.bg} flex`}></div>
                                        <p className={`${key} text-xs font-bold`}>
                                            {key.toUpperCase()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={updateTheme}
                            className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded"
                        >
                            ✅ Apply Theme
                        </button>
                    </div>
                )}
            </div>

            {/* <div className="my-4">
                <label htmlFor="themeSelect" className="text-sm font-bold mr-2 text-white">🎨 Theme:</label>
                <select
                    id="themeSelect"
                    className="bg-black text-white border border-gray-400 px-3 py-1 rounded-md"
                    onChange={async (e) => {
                        const selectedTheme = e.target.value;

                        await fetch(`${API}/api/theme`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ theme: selectedTheme }),
                        });

                        alert(`🎨 Theme changed to ${selectedTheme}`);
                    }}
                    defaultValue={"fireflies"}
                >
                    {Object.keys(THEMES).map((key) => (
                        <option key={key} value={key}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                        </option>
                    ))}
                </select>
            </div> */}


            {/* Background Videos */}
            <div className="my-6 border border-gray-700 rounded bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-gray-700 hover:bg-gray-600 rounded-t flex justify-between items-center"
                    onClick={() => setShowVideoSelector(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-cyan-300">Background Videos</h3>
                    <span className="text-white text-xl">
                        {showVideoSelector ? '-' : '+'}
                    </span>
                </div>

                {showVideoSelector && (
                    <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            {BACKGROUND_VIDEOS.map((file) => {
                                const key = `video:${file}`;
                                const isActive = selectedTheme === key;
                                return (
                                    <button
                                        key={file}
                                        type="button"
                                        onClick={() => setSelectedTheme(key)}
                                        className={`border rounded p-3 text-xs font-semibold truncate hover:bg-gray-700 transition ${isActive ? 'border-cyan-400 bg-gray-700' : 'border-gray-600'}`}
                                        title={file}
                                    >
                                        {file}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={updateTheme}
                            className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded"
                        >
                            Apply Background Video
                        </button>
                    </div>
                )}
            </div>

            {/* Set Bid increment */}

            <div className="my-6 border border-gray-700 rounded bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-gray-700 hover:bg-gray-600 rounded-t flex justify-between items-center"
                    onClick={() => setShowBidConfig(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-yellow-300">📈 Bid Increment Settings</h3>
                    <span className="text-white text-xl">
                        {showBidConfig ? '−' : '+'}
                    </span>
                </div>

                {showBidConfig && (
                    <div className="p-4 space-y-4">
                        {bidIncrements.map((range, idx) => (
                            <div key={idx} className="grid grid-cols-3 gap-4 items-center">
                                <input
                                    type="number"
                                    placeholder="Min"
                                    value={range.min_value}
                                    className="p-2 rounded text-black"
                                    onChange={e => {
                                        const newRanges = [...bidIncrements];
                                        newRanges[idx].min_value = parseInt(e.target.value) || 0;
                                        setBidIncrements(newRanges);
                                    }}
                                />
                                <input
                                    type="number"
                                    placeholder="Max"
                                    value={range.max_value ?? ''}
                                    className="p-2 rounded text-black"
                                    onChange={e => {
                                        const newRanges = [...bidIncrements];
                                        const val = e.target.value.trim();
                                        newRanges[idx].max_value = val === '' ? null : parseInt(val);
                                        setBidIncrements(newRanges);
                                    }}
                                />
                                <input
                                    type="number"
                                    placeholder="Increment"
                                    value={range.increment}
                                    className="p-2 rounded text-black"
                                    onChange={e => {
                                        const newRanges = [...bidIncrements];
                                        newRanges[idx].increment = parseInt(e.target.value) || 0;
                                        setBidIncrements(newRanges);
                                    }}
                                />
                            </div>
                        ))}

                        <div className="flex gap-4 mt-4">
                            <button
                                className="bg-green-600 hover:bg-green-500 text-white font-bold px-3 py-1 rounded"
                                onClick={() =>
                                    setBidIncrements([...bidIncrements, { min_value: 0, max_value: null, increment: 100 }])
                                }
                            >
                                ➕ Add Range
                            </button>

                            <button
                                className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded"
                                onClick={() => setBidIncrements(bidIncrements.slice(0, -1))}
                                disabled={bidIncrements.length <= 1}
                            >
                                🗑️ Remove Last
                            </button>

                            <button
                                className="ml-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1 rounded"
                                onClick={async () => {
                                    try {
                                        const res = await fetch(`${API}/api/bid-increments/${tournamentId}`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify(bidIncrements),
                                        });

                                        if (res.ok) {
                                            alert("✅ Bid increments saved!");
                                        } else {
                                            alert("❌ Failed to save bid increments.");
                                        }
                                    } catch (err) {
                                        console.error("❌ Save failed:", err);
                                    }
                                }}
                            >
                                💾 Save Settings
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* <div className="mb-4 flex items-center gap-3">
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={kcplMode} onChange={e => setKcplMode(e.target.checked)} />
                    <span>KCPL Mode</span>
                </label>

                {kcplMode && (
                    <>
                        <span>Pool:</span>
                        <select
                            value={activePool}
                            onChange={async (e) => {
                                const newPool = e.target.value;
                                setActivePool(newPool);
                                await fetch(`${API}/api/kcpl/active-pool`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ pool: newPool })
                                });
                                // refresh selected team’s KCPL budget pane
                                const t = teams.find(t => t.name === selectedTeam);
                                if (t) {
                                    const s = await fetch(`${API}/api/kcpl/team-state/${t.id}`).then(r => r.json());
                                    setTeamPoolState(s);
                                }
                            }}
                            className="bg-black text-white border px-2 py-1 rounded"
                        >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                        </select>
                    </>
                )}
            </div> */}



            {/* 👇 Collapsible Auction Control Block (All-in-One) */}
            <div className="my-6 border border-gray-700 rounded bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-gray-700 hover:bg-gray-600 rounded-t flex justify-between items-center"
                    onClick={() => setShowAuctionControls(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-green-300">🏏 Live Auction Controls</h3>
                    <span className="text-white text-xl">{showAuctionControls ? '−' : '+'}</span>
                </div>

                {showAuctionControls && (
                    <div className="p-4 space-y-6">

                        {/* 🟩 Team Selection */}
                        <div>
                            {/* 🔍 Player Search Section */}
                            <div>
                                <h3 className="text-lg font-semibold mb-2 text-white">🔍 Search Player by ID:</h3>
                                {/* ===== Quick Select (better UX) ===== */}
                                <div className="mb-4 space-y-2">
                                    {/* Toolbar */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Tabs: Sold / Unsold / Not Auctioned / All */}
                                        <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
                                            <button
                                                type="button"
                                                onClick={() => setSerialView("sold")}
                                                className={`px-3 py-1.5 text-sm ${serialView === "sold" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
                                            >
                                                Sold ({soldSerials.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSerialView("unsold")}
                                                className={`px-3 py-1.5 text-sm border-l border-gray-700 ${serialView === "unsold" ? "bg-rose-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
                                            >
                                                Unsold ({unsoldSerials.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSerialView("na")}
                                                className={`px-3 py-1.5 text-sm border-l border-gray-700 ${serialView === "na" ? "bg-amber-600 text-black" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
                                            >
                                                Not Auctioned ({notAuctionedSerials.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSerialView("all")}
                                                className={`px-3 py-1.5 text-sm border-l border-gray-700 ${serialView === "all" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
                                            >
                                                All ({allSerials.length})
                                            </button>
                                        </div>

                                        {/* Search */}
                                        <input
                                            value={serialQuery}
                                            onChange={(e) => setSerialQuery(e.target.value)}
                                            placeholder="Search serial or name…"
                                            className="px-3 py-1.5 text-sm rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            style={{ minWidth: 220 }}
                                        />

                                        {/* Role filter */}
                                        <select
                                            value={roleFilter}
                                            onChange={(e) => setRoleFilter(e.target.value)}
                                            className="px-3 py-1.5 text-sm rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="all">All roles</option>
                                            {availableRoles.map((role) => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>

                                        {/* Player category filter */}
                                        <select
                                            value={categoryFilter}
                                            onChange={(e) => setCategoryFilter(e.target.value)}
                                            className="px-3 py-1.5 text-sm rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="all">All categories</option>
                                            {availableCategories.map((category) => (
                                                <option key={category} value={category}>{category}</option>
                                            ))}
                                        </select>

                                        {/* Scroll to current */}
                                        <button
                                            type="button"
                                            onClick={scrollToCurrentSerial}
                                            className="ml-auto px-3 py-1.5 text-sm rounded-md bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700"
                                            title="Scroll to current player"
                                        >
                                            ⤴ Scroll to Current
                                        </button>
                                    </div>


                                    {/* Legend */}
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
                                        <span className="inline-flex items-center gap-1">
                                            <span className="w-3 h-3 rounded-sm bg-green-700 border border-green-500"></span> Sold
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="w-3 h-3 rounded-sm bg-red-700 border border-red-500"></span> Unsold
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="w-3 h-3 rounded-sm bg-yellow-600 border border-yellow-400"></span> Ongoing
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="w-3 h-3 rounded-sm bg-gray-700 border border-gray-600"></span> Default
                                        </span>
                                    </div>

                                    {/* Bidding lock notice */}
                                    {isBiddingLocked && (
                                        <div className="mb-2 px-3 py-2 rounded-md bg-yellow-900/80 border border-yellow-600 text-yellow-200 text-sm">
                                            Finish or clear the current bid/secret bid to switch players.
                                        </div>
                                    )}

                                    {/* Chips */}
                                    <div className="max-h-50 overflow-y-auto bg-gray-900/70 border border-gray-700 rounded-lg p-2">
                                        {filteredSerials.length === 0 ? (
                                            <div className="text-xs text-gray-400 px-1 py-2">No players match your filter.</div>
                                        ) : (
                                            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-16 gap-1">
                                                {filteredSerials.map((s) => {
                                                    const p = serialToPlayer.get(s);
                                                    const isDisabled = Number(currentPlayer?.auction_serial) === Number(s) || isTeamViewActive || isBiddingLocked;
                                                    return (
                                                        <button
                                                            id={`serial-chip-${s}`}
                                                            key={s}
                                                            type="button"
                                                            title={p ? `#${s} • ${p.name}${p?.nickname ? ` (${p.nickname})` : ""}` : `#${s}`}
                                                            onMouseEnter={() => prefetchBySerial(s)}
                                                            className={getSerialChipClass(s)}
                                                            disabled={isDisabled}
                                                            onClick={() => handleSearchById(s)}
                                                        >
                                                            #{s}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        className="p-2 rounded text-black w-full sm:w-1/3"
                                        placeholder="Enter Serial"
                                        value={searchId}
                                        onChange={(e) => setSearchId(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") handleSearchById(); }}
                                    />

                                    <button
                                        onClick={() => handleSearchById()}
                                        className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded font-bold shadow"
                                        disabled={isTeamViewActive || isBiddingLocked}
                                        title={isBiddingLocked ? "Locked while a bid/secret bid is active for this player" : ""}
                                    >
                                        🔍 Show Player
                                    </button>
                                    <button
                                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded shadow"
                                        onClick={handleNextPlayer}
                                        disabled={isTeamViewActive || isBiddingLocked}
                                        title={isBiddingLocked ? "Complete or clear the current bid before moving to next player" : ""}
                                    >
                                        ➡️ Next Player
                                    </button>
                                    <button
                                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded shadow"
                                        onClick={clearCurrentPlayer}
                                        disabled={isTeamViewActive}
                                    >
                                        🚫 Clear Current Player
                                    </button>
                                </div>
                            </div>


                            {/* 👤 Current Player Details */}
                            <div className="bg-gray-900 p-4 border border-gray-700 rounded-lg">
                                <h3 className="text-lg font-semibold mb-2 text-white">🎯 Current Player:</h3>
                                {currentPlayer ? (
                                    <div className="flex flex-row text-sm space-x-2 text-white">
                                        <p><strong>ID:</strong> {currentPlayer.id}</p>
                                        <p><strong>Auction-serial:</strong> {currentPlayer.auction_serial}</p>
                                        <p><strong>Player-category:</strong> {currentPlayer.base_category}</p>
                                        <p><strong>Name:</strong> {currentPlayer.name}</p>
                                        <p><strong>Role:</strong> {currentPlayer.role}</p>
                                        <p><strong>Base Price:</strong> ₹{currentPlayer.base_price}</p>

                                        <p className="text-yellow-300">
                                            <strong>Sold Status:</strong> {String(currentPlayer.sold_status).toUpperCase()}
                                        </p>

                                        <p><strong>Secret Bididng:</strong> {String(currentPlayer.secret_bidding_enabled).toUpperCase()}</p>
                                    </div>
                                ) : (
                                    <p className="text-gray-400">No current player selected.</p>
                                )}
                            </div>

                            {kcplMode && kcplTeamStates.length > 0 && (
                                <table className="mt-2 text-xs text-gray-300 w-full">
                                    <thead>
                                        <tr>
                                            <th className="px-2 py-1 text-left">Team</th>
                                            <th className="px-2 py-1 text-left">Limit</th>
                                            <th className="px-2 py-1 text-left">Spent</th>
                                            <th className="px-2 py-1 text-left">Bought</th>
                                            <th className="px-2 py-1 text-left">Remaining</th>
                                            <th className="px-2 py-1 text-left">Max Bid</th>
                                            <th className="px-2 py-1 text-left">Max Players</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {kcplTeamStates.map((team, index) => (
                                            <tr key={`${team?.teamId || team?.teamName || 'team'}-${index}`}>
                                                <td>{team.teamName}</td>
                                                <td>{team?.limitByPool?.[activePool] ?? 0}</td>
                                                <td>{team?.spentByPool?.[activePool] ?? 0}</td>
                                                <td>{team?.boughtByPool?.[activePool] ?? 0}</td>
                                                <td>
                                                    {(team?.limitByPool?.[activePool] ?? 0) -
                                                        (team?.spentByPool?.[activePool] ?? 0)}
                                                </td>
                                                <td>{team?.poolStats?.[activePool]?.maxBid ?? 0}</td>
                                                <td>{team?.poolStats?.[activePool]?.maxPlayers ?? 0}</td>


                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                            )}
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-base font-semibold text-white">Select Team:</h3>
                                <label className="flex items-center cursor-pointer">
                                    <span className="mr-2 text-sm text-white">Team Loop</span>
                                    <input
                                        type="checkbox"
                                        checked={isTeamLoopActive}
                                        onChange={async () => {
                                            if (!isTeamLoopActive) {
                                                // 🟢 Turning ON Team Loop
                                                await fetch(`${API}/api/start-team-loop/${tournamentSlug}`, { method: "POST" });
                                                setIsTeamLoopActive(true);
                                            } else {
                                                // 🔴 Turning OFF Team Loop
                                                await fetch(`${API}/api/stop-team-loop`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        slug: tournamentSlug,
                                                        tournament_id: tournamentId,
                                                    }),
                                                });
                                                setIsTeamLoopActive(false);

                                                // ✅ ALSO disable Squad View (return to live mode)
                                                await fetch(`${API}/api/show-team`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        team_id: null,
                                                        tournament_id: tournamentId,
                                                        tournament_slug: tournamentSlug,
                                                    }),
                                                });
                                                setIsTeamViewActive(false);
                                                setIsLiveAuctionActive(true); // return to live
                                            }
                                        }}

                                        className="sr-only"
                                    />
                                    <div className={`w-10 h-5 rounded-full ${isTeamLoopActive ? 'bg-yellow-400' : 'bg-gray-400'} relative`}>
                                        <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isTeamLoopActive ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </label>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 w-full">
                                {teams.map(team => {
                                    const { eligible, reason } = getTeamEligibility(team) || { eligible: true, reason: "" };
                                    const disabled = !isTeamViewActive && !eligible;
                                    const tooltip = disabled
                                        ? (reason || "Ineligible to bid")
                                        : (isTeamViewActive
                                            ? `Show ${team.name} squad`
                                            : `Select ${team.name}`);
                                    const baseClass = `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-all`;
                                    const normalStateClass = selectedTeam === team.name
                                        ? "bg-green-800 text-white"
                                        : "bg-gray-700 text-gray-200";
                                    const disabledClass = "bg-red-700 text-white ring-1 ring-red-500/60 opacity-90 cursor-not-allowed";
                                    const hoverClass = disabled ? "" : "hover:bg-indigo-600 hover:text-white";
                                    const visualDisable = disabled ? disabledClass : "";
                                    return (
                                        <span key={team.id} title={tooltip} className="inline-block w-full">
                                            <button
                                                onClick={() => !disabled && handleTeamClick(team)}
                                                disabled={disabled}
                                                aria-disabled={disabled}
                                                className={`${baseClass} ${disabled ? '' : normalStateClass} ${hoverClass} ${visualDisable} w-full`}
                                            >
                                                {team.logo && (
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`}
                                                        alt={team.name}
                                                        className="w-5 h-5 rounded-full"
                                                    />
                                                )}
                                                <span className="truncate">{team.name}</span>
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>

                            {selectedTeam && (
                                <div className="mt-2 text-sm text-green-300">
                                    ✅ Selected: <strong>{selectedTeam}</strong>
                                </div>
                            )}
                        </div>

                        {/* 🟥 Mark Sold/Unsold Buttons */}
                        <div className="flex items-center gap-4">
                            <button
                                className={`${markSoldInProgress ? "bg-yellow-400 hover:bg-yellow-300" : "bg-green-500 hover:bg-green-400"} text-black font-bold px-4 py-2 rounded shadow ${markSoldInProgress ? "opacity-80 cursor-not-allowed" : ""}`}
                                onClick={markAsSold}
                                disabled={markSoldInProgress || ["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                            >
                                {markSoldInProgress ? "MARKING SOLD..." : "MARK SOLD"}
                            </button>

                            <button
                                className={`${markUnsoldInProgress ? "bg-yellow-400 hover:bg-yellow-300" : "bg-red-600 hover:bg-red-500"} text-white font-bold px-4 py-2 rounded shadow ${markUnsoldInProgress ? "opacity-80 cursor-not-allowed" : ""}`}
                                onClick={markAsUnsold}
                                disabled={markUnsoldInProgress || ["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                            >
                                {markUnsoldInProgress ? "MARKING UNSOLD..." : "MARK UNSOLD"}
                            </button>

                            {["TRUE", "FALSE", true, false, "true", "false"].includes(currentPlayer?.sold_status) && (
                                <button
                                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded shadow"
                                    onClick={handleReopenPlayer}
                                >
                                    ♻️ Reopen Player
                                </button>
                            )}
                        </div>

                        {/* 🔄 Toggles */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:space-x-4">
                            <label className="flex items-center cursor-pointer space-x-2">
                                <span className="text-sm text-white">Team Squad</span>
                                <input
                                    type="checkbox"
                                    checked={isTeamViewActive}
                                    onChange={async () => {
                                        let team = teams.find(t => t.name === selectedTeam);
                                        if (!team && teams.length > 0) {
                                            team = teams[0];
                                            setSelectedTeam(team.name);
                                        }
                                        if (!team) return;
                                        const newState = !isTeamViewActive;
                                        if (newState) {
                                            setIsLiveAuctionActive(false);
                                            await fetch(`${API}/api/show-team`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    team_id: team.id,
                                                    tournament_id: tournamentId,
                                                    tournament_slug: tournamentSlug,
                                                })
                                            });
                                        } else {
                                            setIsLiveAuctionActive(true);
                                            await fetch(`${API}/api/show-team`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    team_id: null,
                                                    tournament_id: tournamentId,
                                                    tournament_slug: tournamentSlug,
                                                })
                                            });
                                        }
                                        setIsTeamViewActive(newState);
                                    }}
                                    className="sr-only"
                                />
                                <div className={`w-10 h-5 rounded-full ${isTeamViewActive ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                    <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isTeamViewActive ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </label>

                            <label className="flex items-center cursor-pointer space-x-2">
                                <span className="text-sm text-white">Live Auction</span>
                                <input
                                    type="checkbox"
                                    checked={isLiveAuctionActive}
                                    onChange={async () => {
                                        const newState = !isLiveAuctionActive;
                                        if (newState) {
                                            await fetch(`${API}/api/show-team`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    team_id: null,
                                                    tournament_id: tournamentId,
                                                    tournament_slug: tournamentSlug,
                                                })
                                            });
                                            setIsTeamViewActive(false);
                                        }
                                        setIsLiveAuctionActive(newState);
                                    }}
                                    className="sr-only"
                                />
                                <div className={`w-10 h-5 rounded-full ${isLiveAuctionActive ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                    <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isLiveAuctionActive ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </label>
                            <label className="flex items-center cursor-pointer space-x-2">
                                <span className="text-sm text-white">Bottom Marquee</span>
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={isMarqueeOn}
                                    onChange={async () => {
                                        const next = !isMarqueeOn;
                                        setIsMarqueeOn(next);
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: next ? "__MARQUEE_ON__" : "__MARQUEE_OFF__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                    }}
                                />
                                <div className={`w-10 h-5 rounded-full ${isMarqueeOn ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                    <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isMarqueeOn ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </label>

                            {/* Active Bidders display toggles */}
                            <div className="mt-4 p-3 rounded border border-pink-500/40 bg-pink-900/20 space-y-2 w-full">
                                <div className="text-sm font-semibold text-pink-200 uppercase tracking-wide">
                                    Active Bidders Display (Spectator)
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-white text-sm">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span>Show Panel (Youtube view)</span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={showBidderPanel}
                                            onChange={async () => {
                                                const next = !showBidderPanel;
                                                setShowBidderPanel(next);
                                                await broadcastActiveBidderDisplay({
                                                    showActiveBidders: next,
                                                    showPurse: showBidderPurse,
                                                    showMaxBid: showBidderMaxBid,
                                                    showPlayersToBuy: showBidderPlayersToBuy,
                                                });
                                            }}
                                        />
                                        <div className={`w-10 h-5 rounded-full ${showBidderPanel ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                            <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${showBidderPanel ? 'translate-x-5' : ''}`}></div>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span>Purse</span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={showBidderPurse}
                                            onChange={async () => {
                                                const next = !showBidderPurse;
                                                setShowBidderPurse(next);
                                                await broadcastActiveBidderDisplay({
                                                    showActiveBidders: showBidderPanel,
                                                    showPurse: next,
                                                    showMaxBid: showBidderMaxBid,
                                                    showPlayersToBuy: showBidderPlayersToBuy,
                                                });
                                            }}
                                        />
                                        <div className={`w-10 h-5 rounded-full ${showBidderPurse ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                            <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${showBidderPurse ? 'translate-x-5' : ''}`}></div>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span>Max Bid</span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={showBidderMaxBid}
                                            onChange={async () => {
                                                const next = !showBidderMaxBid;
                                                setShowBidderMaxBid(next);
                                                await broadcastActiveBidderDisplay({
                                                    showActiveBidders: showBidderPanel,
                                                    showPurse: showBidderPurse,
                                                    showMaxBid: next,
                                                    showPlayersToBuy: showBidderPlayersToBuy,
                                                });
                                            }}
                                        />
                                        <div className={`w-10 h-5 rounded-full ${showBidderMaxBid ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                            <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${showBidderMaxBid ? 'translate-x-5' : ''}`}></div>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span>Players to Buy</span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={showBidderPlayersToBuy}
                                            onChange={async () => {
                                                const next = !showBidderPlayersToBuy;
                                                setShowBidderPlayersToBuy(next);
                                                await broadcastActiveBidderDisplay({
                                                    showActiveBidders: showBidderPanel,
                                                    showPurse: showBidderPurse,
                                                    showMaxBid: showBidderMaxBid,
                                                    showPlayersToBuy: next,
                                                });
                                            }}
                                        />
                                        <div className={`w-10 h-5 rounded-full ${showBidderPlayersToBuy ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                            <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${showBidderPlayersToBuy ? 'translate-x-5' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                                <p className="text-[11px] text-pink-100/70">
                                    Sends a live update to the Spectator active-bidders panel. Default: panel on with only Max Bid shown.
                                </p>
                            </div>

                        </div>

                        {/* 💰 Bid Amount Input + Smart Quick Buttons */}
                        <div>
                            <label className="block mb-1 text-white">Bid Amount (₹)</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded text-black"
                                value={bidAmount}
                                onChange={e => {
                                    const value = parseInt(e.target.value, 10) || 0;
                                    setBidAmount(value);
                                    setIsBidManual(true);
                                }}
                                onKeyDown={(e) => {
                                    // Press Enter to broadcast immediately (if a team is selected)
                                    if (e.key === "Enter" && selectedTeam) {
                                        updateCurrentBid();
                                    }
                                }}
                                disabled={isTeamViewActive}
                            />

                            {/* Dynamic chips based on configured ranges */}
                            {(() => {
                                const base = getPoolBaseForCurrent();
                                const suggestions = computeSmartSuggestions(bidAmount, base, bidIncrements, 10);

                                return (
                                    <div className="mt-2">
                                        <div className="text-xs text-gray-300 mb-1">
                                            Suggestions (based on increment rules)
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {suggestions.map((val) => (
                                                <button
                                                    key={val}
                                                    className={`px-3 py-1 rounded text-sm font-semibold transition
                ${Number(bidAmount) === Number(val)
                                                            ? "bg-green-700 text-white"
                                                            : "bg-gray-700 text-gray-200 hover:bg-indigo-600 hover:text-white"}`}
                                                    onClick={() => {
                                                        setBidAmount(val);
                                                        setIsBidManual(true);
                                                        // Optionally auto-broadcast when a team is selected:
                                                        // if (selectedTeam) updateCurrentBid();
                                                    }}
                                                    title="Click to set this amount"
                                                >
                                                    ₹{val.toLocaleString()}
                                                </button>
                                            ))}
                                        </div>

                                        {/* (Optional) small legend of rules */}
                                        <div className={`text-sm mt-2 ${isTeamViewActive ? 'text-gray-600' : 'text-gray-400'}`}>
                                            Bid Increments:
                                            {bidIncrements.map((r, i) => (
                                                <div key={i}>
                                                    ₹{r.min_value} – {r.max_value ? `₹${r.max_value}` : '∞'} → +₹{r.increment}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>





                    </div>
                )}
            </div>

            {/* Secret Bidding Controls hidden */}
            {/* 📢 Collapsible Custom Message + Countdown */}
            <div className="mt-6 border border-pink-600 rounded-lg bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-pink-900 hover:bg-pink-800 rounded-t flex justify-between items-center"
                    onClick={() => setShowCustomMessagePanel(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-pink-300">📢 Custom Spectator Message & Countdown</h3>
                    <span className="text-white text-xl">{showCustomMessagePanel ? '−' : '+'}</span>
                </div>

                {showCustomMessagePanel && (
                    <div className="p-4 space-y-6">

                        {/* 📝 Message Input */}
                        <div>
                            <label className="block text-white font-semibold mb-1">Custom Message</label>
                            <textarea
                                rows="3"
                                placeholder="Enter message to show on spectator screen"
                                className="w-full p-3 rounded text-black"
                                value={customMessage}
                                onChange={(e) => setCustomMessage(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2 mt-2">
                                {quickMessageOptions.map(({ label, text }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-700 text-white hover:bg-pink-600 transition"
                                        onClick={() => setCustomMessage(text)}
                                        title={`Use "${text}"`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-300 mt-1">
                                Tap a tag to prefill, edit if needed, then broadcast.
                            </p>

                            <div className="flex flex-col sm:flex-wrap sm:flex-row gap-3 mt-3">
                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: customMessage, tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("Custom message broadcasted.");
                                    }}
                                    className="bg-pink-500 hover:bg-pink-400 text-white font-bold px-4 py-2 rounded shadow"
                                >
                                    🚀 Show on Spectator
                                </button>

                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__SHOW_TEAM_STATS__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("📊 Showing Team Statistics...");
                                    }}
                                    className="bg-teal-500 hover:bg-teal-400 text-black font-bold px-4 py-2 rounded shadow"
                                >
                                    📊 Show Team Stats
                                </button>

                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__SHOW_TOP_10_EXPENSIVE__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("💰 Showing Top 10 Expensive Players...");
                                    }}
                                    className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-4 py-2 rounded shadow"
                                >
                                    💰 Show Top 10 Expensive Players
                                </button>

                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__SHOW_REBID_NON_SOLD__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("Re-bid list of non-sold players will be shown on spectator.");
                                    }}
                                    className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded shadow"
                                >
                                    Show Non-Sold List
                                </button>

                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__SHOW_QR__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("QR code will be shown on spectator.");
                                    }}
                                    className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-4 py-2 rounded shadow"
                                >
                                    Show QR Only
                                </button>

                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__CLEAR_CUSTOM_VIEW__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("✅ Cleared custom view.");
                                    }}
                                    className="bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-2 rounded shadow"
                                >
                                    🔄 Clear Custom View
                                </button>
                            </div>
                        </div>

                        {/* ⏱️ Countdown Timer */}
                        <div>
                            <label className="block text-white font-semibold mb-1">Start Countdown Timer</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="number"
                                    placeholder="Enter seconds (e.g., 120)"
                                    className="p-2 rounded text-black sm:w-1/4"
                                    value={countdownDuration}
                                    onChange={(e) => setCountdownDuration(Number(e.target.value))}
                                />
                                <button
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded shadow"
                                    onClick={async () => {
                                        const message = `__START_COUNTDOWN__${countdownDuration}`;
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message, tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("⏱️ Countdown started!");
                                    }}
                                >
                                    🚀 Start Countdown
                                </button>
                                <button
                                    className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded shadow"
                                    onClick={async () => {
                                        const message = `__START_REBID_COUNTDOWN__${countdownDuration}`;
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message, tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("Re-bid countdown started on unsold list view.");
                                    }}
                                >
                                    Start Countdown (Unsold list)
                                </button>
                            </div>
                        </div>

                    </div>
                )}
            </div>





            {/* ♻️ Collapsible Undo / Reset / Secret Code Panel */}
            <div className="mt-6 border border-orange-600 rounded-lg bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-orange-900 hover:bg-orange-800 rounded-t flex justify-between items-center"
                    onClick={() => setShowResetPanel(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-orange-300">♻️ Undo / Reset Controls</h3>
                    <span className="text-white text-xl">{showResetPanel ? '−' : '+'}</span>
                </div>

                {showResetPanel && (
                    <div className="p-4 space-y-4">

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

                            <button
                                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-2 rounded shadow"
                                onClick={undoLastAction}
                                disabled={undoStack.length === 0}
                            >
                                ⬅️ Undo ({undoStack.length})
                            </button>

                            {["TRUE", "FALSE", true, false, "true", "false"].includes(currentPlayer?.sold_status) && (
                                <button
                                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-2 rounded shadow"
                                    onClick={handleReopenPlayer}
                                >
                                    ♻️ Reopen Player
                                </button>
                            )}

                            <button
                                className={`bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded shadow ${resetUnsoldInProgress ? "opacity-70 cursor-not-allowed" : ""}`}
                                onClick={resetUnsoldPlayers}
                                disabled={resetUnsoldInProgress}
                            >
                                {resetUnsoldInProgress ? "Resetting unsold..." : "Reset Unsold"}
                            </button>

                            <button
                                className={`bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded shadow ${resetMaxBidInProgress ? "opacity-70 cursor-not-allowed" : ""}`}
                                onClick={resetMaxBid}
                                disabled={resetMaxBidInProgress}
                            >
                                {resetMaxBidInProgress ? "Recalculating..." : "Recalculate Max Bid"}
                            </button>

                            <button
                                className={`px-4 py-2 rounded shadow font-bold ${resetInProgress
                                    ? 'bg-gray-500 cursor-not-allowed text-white'
                                    : 'bg-red-600 hover:bg-red-500 text-white'
                                    }`}
                                disabled={resetInProgress}
                                onClick={async () => {
                                    const firstConfirm = window.confirm("⚠️ This will reset the entire auction. Are you sure?");
                                    if (!firstConfirm) return;

                                    const secondConfirm = window.prompt("This will reset ALL player statuses and team budgets.\n\nTo confirm, type RESET in capital letters:");
                                    if (secondConfirm !== "RESET") {
                                        alert("❌ Reset cancelled. You did not type RESET.");
                                        return;
                                    }

                                    try {
                                        setResetInProgress(true);
                                        await resetAuction();
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: "__RESET_AUCTION__", tournament_id: tournamentId, slug: tournamentSlug }),
                                        });
                                        alert("✅ Auction reset successfully.");
                                    } catch (err) {
                                        console.error("Error during auction reset:", err);
                                        alert("❌ Failed to reset auction.");
                                    } finally {
                                        setResetInProgress(false);
                                    }
                                }}
                            >
                                {resetInProgress ? "⏳ Resetting..." : "🔁 Reset Auction"}
                            </button>

                            <button
                                onClick={handleGenerateCodes}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow font-bold col-span-2"
                            >
                                🧾 Generate Secret Codes for Teams
                            </button>
                        </div>

                    </div>
                )}
            </div>

            <footer className="bottom-0 left-0 text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>
        </div>
    );
};

export default AdminPanel;
