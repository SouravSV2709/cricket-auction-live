import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useRef } from "react";
import { useParams } from "react-router-dom";
import confetti from "canvas-confetti"; // 🎆 Confetti library
import CONFIG from '../components/config';
import THEMES from '../components/themes';
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
    const [showCustomMessagePanel, setShowCustomMessagePanel] = useState(false);
    const [resetInProgress, setResetInProgress] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState("fireflies");
    const [isTeamViewActive, setIsTeamViewActive] = useState(false);
    const [isTeamLoopActive, setIsTeamLoopActive] = useState(false);
    const [bidIncrements, setBidIncrements] = useState([]);
    const [showBidConfig, setShowBidConfig] = useState(false);
    const [showThemeSelector, setShowThemeSelector] = useState(false);
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


    useEffect(() => {
        document.title = "Admin Panel | Auction Arena";
    }, []);


    // --- Quick-pick: Paid players (payment_success=true AND not deleted) ---
    // ===== Quick-Pick UX: filter + search =====
    const [serialView, setSerialView] = React.useState("paid"); // 'paid' | 'unpaid' | 'all'
    const [serialQuery, setSerialQuery] = React.useState("");


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



    // choose base list by tab
    const serialsByView = React.useMemo(() => {
        switch (serialView) {
            case "sold": return soldSerials;
            case "unsold": return unsoldSerials;
            case "na": return notAuctionedSerials;
            default: return allSerials;
        }
    }, [serialView, soldSerials, unsoldSerials, notAuctionedSerials, allSerials]);


    // apply search (by serial or name/nickname)
    const filteredSerials = React.useMemo(() => {
        const q = serialQuery.trim().toLowerCase();
        if (!q) return serialsByView;
        return serialsByView.filter((s) => {
            if (String(s).includes(q)) return true;
            const p = serialToPlayer.get(s);
            const name = String(p?.name || "").toLowerCase();
            const nick = String(p?.nickname || "").toLowerCase();
            return name.includes(q) || nick.includes(q);
        });
    }, [serialsByView, serialQuery, serialToPlayer]);

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
        const out = [];
        const rs = normalizeRanges(ranges);
        if (rs.length === 0) return out;

        // Start from what's typed (or base)
        let amt = Math.max(Number(currentBid) || 0, base);

        // Find the range that contains 'amt' (or the first range after it)
        let idx = findRangeIndex(rs, amt);
        if (idx === -1) {
            // If below the very first range min, start at that min
            idx = 0;
            amt = Math.max(amt, rs[0].min_value ?? 0, base);
        }

        const pushVal = (v) => {
            const x = Math.max(v, base);
            if (out.length === 0 || x > out[out.length - 1]) out.push(x);
        };

        // Walk ranges forward, always stepping by that range's increment
        while (out.length < maxCount && idx < rs.length) {
            const r = rs[idx];
            const rMin = Math.max(r.min_value ?? 0, base);
            const rMax = r.max_value;          // null => ∞
            const inc = Math.max(1, Number(r.increment) || 1);

            // Ensure we are at least at the range min
            if (amt < rMin) amt = rMin;

            // First suggestion inside this range:
            //  - If user typed inside range, go to "next step from what they typed" (even if off-grid)
            //  - Else (we landed exactly on the min), use that min
            let first = amt;
            if (first < rMin) first = rMin;

            // If we're *already* at/over the finite max, push the max and move to next range
            if (rMax != null && first >= rMax) {
                pushVal(rMax);
                idx += 1;
                amt = rMax; // nudge into next range
                continue;
            }

            // If the amount is equal to the min boundary, that's a valid first chip;
            // otherwise, for off-grid amounts we *advance by inc from the current value*.
            // Example: amt=2300 in +500 range => first=2300+500 = 2800
            if (first > rMin) first = first + inc;

            // Emit steps in this range
            let cursor = first;
            while (out.length < maxCount) {
                if (rMax != null && cursor > rMax) {
                    // include the exact max boundary before leaving the range
                    if (out[out.length - 1] !== rMax) pushVal(rMax);
                    break;
                }
                pushVal(cursor);
                cursor += inc;
            }

            // Move to next range
            idx += 1;

            // Prepare amt for the next range:
            if (rMax != null) {
                // start from the max boundary (no +1 offset)
                amt = rMax;
            } else {
                // Infinite range handled above already; we would have filled maxCount by now
                break;
            }
        }

        // If we still need more and there is an infinite tail, continue with it
        if (out.length < maxCount) {
            const inf = rs.find(r => r.max_value == null);
            if (inf) {
                const iMin = Math.max(inf.min_value ?? 0, base);
                const inc = Math.max(1, Number(inf.increment) || 1);
                let cursor = Math.max(out[out.length - 1] ?? iMin, iMin) + inc;
                while (out.length < maxCount) {
                    pushVal(cursor);
                    cursor += inc;
                }
            }
        }

        return out.slice(0, maxCount);
    };






    useEffect(() => {
        const fetchTournamentId = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();

                if (res.ok && data.id) {
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
                message: isSecretBiddingActive ? "__SECRET_BIDDING_ACTIVE__" : "__CLEAR_CUSTOM_VIEW__"
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
                        body: JSON.stringify({ team_id: null }),
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

            // 3) (optional) KCPL summary refresh
            refreshKcplTeamStates?.();
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

            refreshKcplTeamStates?.();
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
        await fetch(`${API}/api/theme`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: selectedTheme }),
        });
        alert(`🎨 Theme updated to: ${selectedTheme}`);
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

            setTeams(data);
        } catch (error) {
            console.error("❌ Failed to fetch teams:", error);
            setTeams([]);
        }
    };



    const fetchCurrentPlayer = async () => {
        try {
            const res = await fetch(`${API}/api/current-player`);
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
                active_pool: activePool || null
            });

            // 2) Then persist
            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: amt,
                    team_name: selectedTeam,
                    active_pool: activePool || null
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
        });
        socketRef.current?.emit("playerSold", {
            player_id: currentPlayer.id,
            team_id: teamId,
            sold_price: bidAmount,
            sold_pool: activePool,
        });

        // ✅ Perform critical updates in parallel (skip bid reset here)
        await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPlayer)
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
            body: JSON.stringify(updatedPlayer),
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


        // ✅ Immediately reset the bid on server & broadcast (no 3s delay)
        fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bid_amount: 0, team_name: "" }),
        });
        socketRef.current?.emit("bidUpdated", {
            bid_amount: 0,
            team_name: "",
            active_pool: activePool,
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

    };


    const markAsUnsold = async () => {
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
        });

        // Persist to DB (current-player + players)
        await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPlayer),
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


        // Reset current bid immediately + broadcast
        // Reset current bid on the server silently (no broadcast)
        // Optional: delay to let spectators finish the UNSOLD overlay
        setTimeout(() => {
            fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bid_amount: 0, team_name: "" }),
            });
        }, 1200);


        // Fast KCPL summary refresh (optional)
        try {
            await refreshKcplTeamStates();
        } catch (e) {
            console.warn("KCPL table refresh failed:", e);
        }
    };



    const handleNextPlayer = async () => {
        try {
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
                    body: JSON.stringify(nextPlayer)
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bid_amount: 0, team_name: "" })
                })
            ]);

            // 8. Notify spectators (non-blocking)
            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextPlayer),
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



    // ---- Full replacement: resilient search by serial ----
    const handleSearchById = async (idOverride) => {
        try {
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

            // 1) Find the player by serial
            const res = await fetch(
                `${API}/api/players/by-serial/${encodeURIComponent(serialParam)}?slug=${tournamentSlug}`
            );
            if (!res.ok) {
                alert("❌ Player not found.");
                return;
            }
            const basic = await res.json();

            // ✅ Validate tournament_id
            if (Number(basic.tournament_id) !== Number(tournamentId)) {
                alert("❌ Player not found in this tournament.");
                return;
            }

            // 2) Get full player
            const detailUrl =
                kcplMode && activePool
                    ? `${API}/api/players/${basic.id}?slug=${tournamentSlug}&active_pool=${activePool}`
                    : `${API}/api/players/${basic.id}?slug=${tournamentSlug}`;

            const detailedRes = await fetch(detailUrl);
            if (!detailedRes.ok) {
                alert("❌ Failed to load player details.");
                return;
            }
            const detailed = await detailedRes.json();

            // 3) Update current player + reset bid
            await Promise.all([
                fetch(`${API}/api/current-player`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(detailed),
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bid_amount: 0, team_name: "" }),
                }),
            ]);

            // 4) Notify spectators (non-blocking)
            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(detailed),
            });

            // 5) Update Admin UI
            await fetchCurrentPlayer();
            setBidAmount(0);
            setSelectedTeam("");
            setSearchId(serialParam); // keep the input synced (e.g., from pill click)
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
                body: JSON.stringify({ team_id: team.id }),
            });

            socketRef.current?.emit("showTeam", {
                team_id: team.id,
                empty: team.players?.length === 0,
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
            });

            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: amt,
                    team_name: team.name,
                    active_pool: activePool,
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
        });

        await fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: newBid,
                team_name: team.name,
                active_pool: activePool,
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




    const resetUnsoldPlayers = async () => {
        const playersRes = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
        const playersData = await playersRes.json();
        let changes = 0;

        for (const player of playersData) {
            if (["FALSE", "false", false].includes(player.sold_status)) {
                await fetch(`${API}/api/players/${player.id}?slug=${tournamentSlug}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sold_status: null,
                        team_id: null,
                        sold_price: null
                    })
                });
                changes++;
            }
        }

        alert(changes > 0 ? "Unsold players reset." : "No unsold players found.");
        fetchPlayers();
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
                team_name: type === "sold" ? teamName : ""
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
                    team_name: previousTeam
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
                body: JSON.stringify({ bid_amount: 0, team_name: "" })
            })
        ]);

        // Notify spectators (same as Next Player)
        await fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reopenedPlayer),
        });

        // Update local state
        setCurrentPlayer(reopenedPlayer);
        setBidAmount(0);
        setSelectedTeam('');
        fetchTeams(tournamentId);
    };


    // Clear current player from db

    const clearCurrentPlayer = async () => {
        try {
            // 1. Clear current player
            await fetch(`${API}/api/current-player/reset`, { method: "POST" });

            // 2. Clear current bid
            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bid_amount: 0, team_name: "" })
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
                body: JSON.stringify({ message: "__SHOW_NO_PLAYERS__" }),
            });

            // ✅ Broadcast the change via socket
            socketRef.current?.emit("playerChanged");  // 🔥 Add this line

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

                                    {/* Chips */}
                                    <div className="max-h-50 overflow-y-auto bg-gray-900/70 border border-gray-700 rounded-lg p-2">
                                        {filteredSerials.length === 0 ? (
                                            <div className="text-xs text-gray-400 px-1 py-2">No players match your filter.</div>
                                        ) : (
                                            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 lg:grid-cols-16 gap-1">
                                                {filteredSerials.map((s) => {
                                                    const p = serialToPlayer.get(s);
                                                    const isDisabled = Number(currentPlayer?.auction_serial) === Number(s) || isTeamViewActive;
                                                    return (
                                                        <button
                                                            id={`serial-chip-${s}`}
                                                            key={s}
                                                            type="button"
                                                            title={p ? `#${s} • ${p.name}${p?.nickname ? ` (${p.nickname})` : ""}` : `#${s}`}
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
                                        disabled={isTeamViewActive}
                                    >
                                        🔍 Show Player
                                    </button>
                                    <button
                                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded shadow"
                                        onClick={handleNextPlayer}
                                        disabled={isTeamViewActive}
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
                                    <div className="flex flex row text-sm space-x-2 text-white">
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
                                                await fetch(`${API}/api/stop-team-loop`, { method: "POST" });
                                                setIsTeamLoopActive(false);

                                                // ✅ ALSO disable Squad View (return to live mode)
                                                await fetch(`${API}/api/show-team`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ team_id: null }),
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

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                                {teams.map(team => (
                                    <button
                                        key={team.id}
                                        onClick={() => handleTeamClick(team)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-all
                ${selectedTeam === team.name ? "bg-green-800 text-white" : "bg-gray-700 text-gray-200"}
                hover:bg-indigo-600 hover:text-white`}
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
                                ))}
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
                                className="bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-2 rounded shadow"
                                onClick={markAsSold}
                                disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                            >
                                ✅ MARK SOLD
                            </button>

                            <button
                                className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded shadow"
                                onClick={markAsUnsold}
                                disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                            >
                                ❌ MARK UNSOLD
                            </button>
                        </div>

                        {/* 🔄 Toggles */}
                        <div className="flex items-center space-x-4">
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
                                                body: JSON.stringify({ team_id: team.id })
                                            });
                                        } else {
                                            setIsLiveAuctionActive(true);
                                            await fetch(`${API}/api/show-team`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ team_id: null })
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
                                                body: JSON.stringify({ team_id: null })
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
                                            body: JSON.stringify({ message: next ? "__MARQUEE_ON__" : "__MARQUEE_OFF__" }),
                                        });
                                    }}
                                />
                                <div className={`w-10 h-5 rounded-full ${isMarqueeOn ? 'bg-green-500' : 'bg-red-400'} relative`}>
                                    <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isMarqueeOn ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </label>

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

            <div className="mt-6 border border-purple-700 rounded-lg bg-gray-800">
                <div
                    className="p-4 cursor-pointer bg-purple-900 hover:bg-purple-800 rounded-t flex justify-between items-center"
                    onClick={() => setShowSecretBiddingControls(prev => !prev)}
                >
                    <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
                        🕵️‍♂️ Secret Bidding Controls
                    </h3>
                    <span className="text-white text-xl">{showSecretBiddingControls ? '−' : '+'}</span>
                </div>

                {showSecretBiddingControls && (
                    <div className="p-4 space-y-4">
                        {/* 🔘 Secret Bidding Buttons */}
                        <div className="flex gap-4 mb-2">
                            <button
                                onClick={async () => {
                                    setIsSecretBiddingActive(true);
                                    await fetch(`${API}/api/current-player`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ secret_bidding_enabled: true }),
                                    });
                                    await fetchCurrentPlayer();
                                    alert("✅ Secret Bidding ENABLED for current player");
                                    socketRef.current?.emit("secretBiddingToggled");
                                }}
                                className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded font-bold"
                                disabled={isSecretBiddingActive || bidAmount <= 0} // 👈 disable if bid is 0
                            >
                                ✅ Enable Secret Bidding
                            </button>
                            <button
                                onClick={async () => {
                                    setIsSecretBiddingActive(false);
                                    setShowSecretBids(false);
                                    await fetch(`${API}/api/current-player`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ secret_bidding_enabled: false }),
                                    });
                                    await fetchCurrentPlayer(); // ← ADD THIS
                                    alert("❌ Secret Bidding DISABLED for current player");
                                    socketRef.current?.emit("secretBiddingToggled");
                                }}
                                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-bold"
                                disabled={!isSecretBiddingActive}
                            >
                                ❌ Disable Secret Bidding
                            </button>

                            <button
                                onClick={async () => {
                                    const res = await fetch(
                                        `${API}/api/secret-bids?tournament_id=${tournamentId}&player_serial=${currentPlayer?.auction_serial}`
                                    );
                                    const data = await res.json();
                                    setSecretBids(data);
                                    setShowSecretBids(true);

                                    socketRef.current?.emit("revealSecretBids", {
                                        tournament_id: tournamentId,
                                        player_serial: currentPlayer?.auction_serial
                                    });
                                }}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold"
                                disabled={!isSecretBiddingActive}
                            >
                                👁️ Reveal Bids
                            </button>
                        </div>

                        {/* 🏆 Show Secret Bid List */}
                        {showSecretBids && secretBids.length > 0 && (
                            <div className="space-y-2">
                                {secretBids.map((bid, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3 rounded shadow bg-gray-900 border ${idx === 0 ? "border-green-400" : "border-gray-600"}`}
                                    >
                                        <p><strong>Team:</strong> {bid.team_name}</p>
                                        <p><strong>Bid:</strong> ₹{bid.bid_amount}</p>
                                        <button
                                            onClick={async () => {
                                                await fetch(`${API}/api/secret-bid/winner`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        player_id: currentPlayer.id,
                                                        team_id: bid.team_id,
                                                        bid_amount: bid.bid_amount,
                                                    }),
                                                });
                                                alert("✅ Player assigned via secret bid!");
                                                setShowSecretBids(false);
                                                setIsSecretBiddingActive(false);
                                                fetchPlayers();
                                                fetchTeams(tournamentId);
                                                fetchCurrentPlayer();

                                                socketRef.current?.emit("secretBidWinnerAssigned", {
                                                    player_id: currentPlayer.id,
                                                    team_id: bid.team_id,
                                                    team_name: bid.team_name,
                                                    bid_amount: bid.bid_amount,
                                                    team_logo: bid.logo
                                                });
                                            }}
                                            className="mt-2 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded font-bold"
                                        >
                                            🏆 Assign to this Team
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showSecretBids && secretBids.length === 0 && (
                            <p className="text-red-300 font-semibold">No bids submitted yet.</p>
                        )}
                    </div>
                )}
            </div>


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
                                onChange={(e) => setCustomMessage(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-3 mt-3">
                                <button
                                    onClick={async () => {
                                        await fetch(`${API}/api/custom-message`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: customMessage }),
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
                                            body: JSON.stringify({ message: "__SHOW_TEAM_STATS__" }),
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
                                            body: JSON.stringify({ message: "__SHOW_TOP_10_EXPENSIVE__" }),
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
                                            body: JSON.stringify({ message: "__CLEAR_CUSTOM_VIEW__" }),
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
                                            body: JSON.stringify({ message }),
                                        });
                                        alert("⏱️ Countdown started!");
                                    }}
                                >
                                    🚀 Start Countdown
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
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded shadow"
                                onClick={resetUnsoldPlayers}
                            >
                                🔄 Reset Unsold
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
                                            body: JSON.stringify({ message: "__RESET_AUCTION__" }),
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