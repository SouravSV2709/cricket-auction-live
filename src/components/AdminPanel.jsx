import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useRef } from "react";
import confetti from "canvas-confetti"; // 🎆 Confetti library
import CONFIG from '../components/config';
import THEMES from '../components/themes';
import './ThemePreview.css';

const API = CONFIG.API_BASE_URL;

const computeBasePrice = (player) => {
    if (player.base_price && player.base_price > 0) return player.base_price;
    const map = { A: 1700, B: 3000, C: 5000 };
    return map[player.base_category] || 0;
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
    const [resetInProgress, setResetInProgress] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState("default");
    const [isTeamViewActive, setIsTeamViewActive] = useState(false);
    const [isTeamLoopActive, setIsTeamLoopActive] = useState(false);
    const [bidIncrements, setBidIncrements] = useState([]);
    const [showBidConfig, setShowBidConfig] = useState(false);
    const [showThemeSelector, setShowThemeSelector] = useState(false);
    const [isLiveAuctionActive, setIsLiveAuctionActive] = useState(true);





    useEffect(() => {
        document.title = "Admin Panel | Auction Arena";
    }, []);

    useEffect(() => {
        const tournamentId = CONFIG.TOURNAMENT_ID;
        fetchPlayers();
        fetchTeams(CONFIG.TOURNAMENT_ID);
        fetchCurrentPlayer();
    }, []);

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
                const res = await fetch(`${API}/api/bid-increments/${CONFIG.TOURNAMENT_ID}`);
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



    const fetchPlayers = async () => {
        try {
            const tournamentId = CONFIG.TOURNAMENT_ID; // replace this with dynamic value if needed
            const res = await fetch(`${API}/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`);
            if (!res.ok) throw new Error("Failed to fetch players");
            const data = await res.json();
            setPlayers(data);
        } catch (err) {
            console.error("Error fetching players from DB:", err);
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

            setTeams(data);
        } catch (error) {
            console.error("❌ Failed to fetch teams:", error);
            setTeams([]);
        }
    };



    const fetchCurrentPlayer = async () => {
        try {
            const res = await fetch(`${API}/api/current-player`);

            let data = null;
            if (res.ok) {
                const text = await res.text();
                if (text) {
                    data = JSON.parse(text);
                }
            }

            if (data) {
                console.log("Auction Serial:", data.auction_serial);
                setCurrentPlayer(data);
            } else {
                setCurrentPlayer(null);
            }
        } catch (error) {
            console.error("Failed to fetch current player:", error);
            setCurrentPlayer(null);
        }
    };




    const updateCurrentBid = async () => {
        if (!selectedTeam || bidAmount === 0) {
            alert("Please select a team and set a bid.");
            return;
        }

        if (bidAmount < currentPlayer.base_price) {
            alert(`Bid must be at least ₹${currentPlayer.base_price}`);
            return;
        }

        await fetch(`${API}/api/current-bid`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: bidAmount,
                team_name: selectedTeam
            })
        });

        alert("Bid updated.");
    };

    const markAsSold = async () => {
        if (!selectedTeam || bidAmount === 0) {
            alert("Cannot mark as sold without a valid bid and team.");
            return;
        }

        if (bidAmount < (currentPlayer.base_price || 0)) {
            alert(`❌ Sold price must be at least ₹${currentPlayer.base_price}`);
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

        // ✅ Perform critical updates in parallel
        await Promise.all([
            fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPlayer)
            }),
            fetch(`${API}/api/players/${currentPlayer.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sold_status: "TRUE",
                    team_id: teamId,
                    sold_price: bidAmount
                })
            }),
            fetch(`${API}/api/teams/${team.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedTeam)
            }),
            fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bid_amount: 0, team_name: "" })
            })
        ]);

        // 🚀 Fire notifications (non-blocking, async side-effects)
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

        // 🎉 Visual feedback
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.6 },
            colors: ['#ff0', '#f00', '#fff', '#0f0', '#00f']
        });

        alert("🎉 Player SOLD and team updated!");

        // 🔄 Update local state
        setBidAmount(0);
        setSelectedTeam('');
        fetchPlayers();
        fetchTeams(CONFIG.TOURNAMENT_ID);
        fetchCurrentPlayer();
    };


    const markAsUnsold = async () => {

        setUndoStack(prev => [...prev, {
            type: "unsold",
            player: currentPlayer,
        }]);

        const updatedPlayer = {
            ...currentPlayer,
            sold_status: "FALSE",
            team_id: null,
            sold_price: 0
        };

        await fetch(`${API}/api/current-player`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer)
        });


        await fetch(`${API}/api/players/${currentPlayer.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer)
        });

        // ✅ Notify spectators to refresh
        await fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer),
        });

        alert("Player marked as UNSOLD.");
        fetchPlayers();
        fetchCurrentPlayer();
    };

    const handleNextPlayer = async () => {
        const tournamentId = CONFIG.TOURNAMENT_ID;

        try {
            // 1. Get all players once
            const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const allPlayers = await res.json();

            // 2. Filter unprocessed players
            const unprocessedPlayers = allPlayers.filter(
                p =>
                    !["TRUE", "FALSE", true, false, "true", "false"].includes(p.sold_status) &&
                    !p.deleted_at
            );

            if (unprocessedPlayers.length === 0) {
                alert("✅ All players have been auctioned.");
                return;
            }

            // ✅ 3. Pick a random player from unprocessed ones
            const nextBasic = unprocessedPlayers[Math.floor(Math.random() * unprocessedPlayers.length)];

            // 4. Fetch full details
            const detailedRes = await fetch(`${API}/api/players/${nextBasic.id}`);
            const nextPlayer = await detailedRes.json();
            nextPlayer.base_price = computeBasePrice(nextPlayer);

            // 5. Save undo state
            setUndoStack(prev => [...prev, {
                type: "next",
                player: currentPlayer
            }]);

            // 6. Update current player and bid in parallel
            await Promise.all([
                fetch(`${API}/api/current-player`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(nextPlayer)
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bid_amount: 0,
                        team_name: ""
                    })
                })
            ]);

            // 7. Notify spectator screen (non-blocking)
            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextPlayer),
            });

            // 8. Update admin UI
            setPlayers(allPlayers);
            setCurrentPlayer(nextPlayer);
            setBidAmount(0);
            setSelectedTeam('');

        } catch (err) {
            console.error("❌ Error in handleNextPlayer:", err);
            alert("❌ Could not load next player.");
        }
    };




    const handleSearchById = async () => {
        try {
            const res = await fetch(`${API}/api/players/${searchId}`);
            const player = await res.json();

            // ✅ Validate tournament_id
            if (player.tournament_id !== CONFIG.TOURNAMENT_ID) {
                alert("❌ Player not found in this tournament.");
                return;
            }

            const playerWithStatus = {
                id: player.id,
                serial: player.auction_serial,
                name: player.name || "Unknown",
                role: player.role || "Unknown",
                base_price: computeBasePrice(player),
                profile_image: player.profile_image || `https://ik.imagekit.io/auctionarena/uploads/players/profiles/default.jpg`,
                sold_status: player.sold_status ?? null,
                team_id: player.team_id ?? null,
                sold_price: player.sold_price ?? 0
            };

            console.log("📦 About to update current player:", playerWithStatus);

            // ✅ Perform updates in parallel
            await Promise.all([
                fetch(`${API}/api/current-player`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(playerWithStatus),
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bid_amount: 0,
                        team_name: ""
                    })
                }),
            ]);

            // 🔔 Notify spectators (non-blocking)
            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(playerWithStatus),
            });

            // ✅ Update Admin UI
            await fetchCurrentPlayer();
            setBidAmount(0);
            setSelectedTeam('');

        } catch (err) {
            console.error("❌ Error in handleSearchById:", err);
            alert("❌ Failed to find player. Please try again.");
        }
    };

    const socketRef = useRef(null);

    // Inside useEffect, connect only once
    useEffect(() => {
        socketRef.current = io(API);
        window.socket = socketRef.current;

        return () => {
            socketRef.current.disconnect();

        };
    }, []);

    const handleTeamClick = (team) => {
  if (isTeamViewActive) {
    socketRef.current?.emit("showTeam", {
      team_id: team.id,
      empty: team.players?.length === 0
    });
    return;
  }

  if (!isLiveAuctionActive || !currentPlayer) return;

  const base = Number(currentPlayer.base_price || computeBasePrice(currentPlayer));

  console.log("📦 Raw bidAmount state value:", bidAmount, typeof bidAmount);
  let currentBid = typeof bidAmount === 'number' ? bidAmount : parseInt(bidAmount, 10) || 0;
  console.log("✅ Parsed currentBid:", currentBid, typeof currentBid);

  if (currentBid < base) {
    console.log("⏫ Starting from base price:", base);
    currentBid = base;
  }

  const increment = getDynamicBidIncrement(currentBid);
  console.log("➕ Increment to apply:", increment);

  const newBid = currentBid + increment;
  console.log("💰 New bid to set:", newBid);

  setBidAmount(newBid);
  setSelectedTeam(team.name);

  fetch(`${API}/api/current-bid`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bid_amount: newBid,
      team_name: team.name
    })
  });

  socketRef.current?.emit("bidUpdated", {
    bid_amount: newBid,
    team_name: team.name
  });
};




    const resetAuction = async () => {
        try {
            await fetch(`${API}/api/reset-auction`, {
                method: "POST"
            });

            alert("✅ Auction has been fully reset.");
            fetchPlayers(); // Refresh player list
            fetchTeams(CONFIG.TOURNAMENT_ID); // Optional
            fetchCurrentPlayer(); // Optional
            setBidAmount(0);
            setSelectedTeam('');
        } catch (err) {
            console.error("❌ Failed to reset auction:", err);
            alert("❌ Error occurred while resetting the auction.");
        }
    };




    const resetUnsoldPlayers = async () => {
        const playersRes = await fetch(`${API}/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`);
        const playersData = await playersRes.json();
        let changes = 0;

        for (const player of playersData) {
            if (["FALSE", "false", false].includes(player.sold_status)) {
                await fetch(`${API}/api/players/${player.id}`, {
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
            await fetch(`${API}/api/players/${player.id}`, {
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
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: previousBid,
                    team_name: previousTeam
                })
            });

            return; // early return as no current-player/team changes
        }


        if (type === "unsold") {
            await fetch(`${API}/api/players/${player.id}`, {
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
        fetchTeams(CONFIG.TOURNAMENT_ID);
        fetchCurrentPlayer();
    };

    const handleReopenPlayer = async () => {
        if (!currentPlayer || !["TRUE", "FALSE", true, false, "true", "false"].includes(currentPlayer.sold_status)) return;

        // Save undo state
        setUndoStack(prev => [
            ...prev,
            {
                type: currentPlayer.sold_status,
                player: currentPlayer,
                teamName: currentPlayer.team_id,
                bidAmount: currentPlayer.sold_price,
            }
        ]);

        // 1. Refund budget & remove player from team (only if previously SOLD)
        if (currentPlayer.sold_status === "TRUE" || currentPlayer.sold_status === true) {
            const team = teams.find(t => t.id === currentPlayer.team_id || t.name === currentPlayer.team_id);
            if (team) {
                const filteredPlayers = (team.players || []).filter(p => p.id !== currentPlayer.id);
                const updatedTeam = {
                    ...team,
                    players: filteredPlayers,
                    budget: team.budget + (currentPlayer.sold_price || 0)
                };

                await fetch(`${API}/api/players/${currentPlayer.id}/reopen`, {
                    method: "POST"
                });
            }
        }

        // 2. Build reopened player object
        const reopenedPlayer = {
            ...currentPlayer,
            sold_status: null,
            team_id: null,
            sold_price: currentPlayer.sold_price || 0, // retain the last amount
            base_price: currentPlayer.base_price || computeBasePrice(currentPlayer)
        };

        // 4. Update current player table
        await fetch(`${API}/api/current-player`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reopenedPlayer),
        });

        // 5. Reset current bid
        await fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: 0,
                team_name: ""
            })
        });

        // 6. Notify spectators to update
        await fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reopenedPlayer),
        });

        // 7. Refresh UI
        setCurrentPlayer(reopenedPlayer);
        setBidAmount(reopenedPlayer.sold_price || 0);  // retain last sold amount
        setSelectedTeam(''); // team should be reset
        fetchTeams(CONFIG.TOURNAMENT_ID);
    };


    // Clear current player from db

    const clearCurrentPlayer = async () => {
        try {
            await fetch(`${API}/api/current-player/reset`, {
                method: "POST",
            });

            // 👇 Notify Spectator
            await fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: null }),
            });

            alert("✅ Current player cleared.");
            setCurrentPlayer(null);
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
                                        const res = await fetch(`${API}/api/bid-increments/${CONFIG.TOURNAMENT_ID}`, {
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



            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-base font-semibold">Select Team:</h3>
                    <label className="flex items-center cursor-pointer">
                        <span className="mr-2 text-sm">Team Loop</span>
                        <input
                            type="checkbox"
                            checked={isTeamLoopActive}
                            onChange={async () => {
                                if (!isTeamLoopActive) {
                                    await fetch(`${API}/api/start-team-loop`, { method: "POST" });
                                } else {
                                    await fetch(`${API}/api/stop-team-loop`, { method: "POST" });
                                }
                                setIsTeamLoopActive(!isTeamLoopActive);
                            }}
                            className="sr-only"
                        />
                        <div className={`w-10 h-5 rounded-full ${isTeamLoopActive ? 'bg-yellow-400' : 'bg-gray-400'} relative`}>
                            <div className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isTeamLoopActive ? 'translate-x-5' : ''}`}></div>
                        </div>
                    </label>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                    {teams.map(team => (
                        <button
                            key={team.id}
                            onClick={() => handleTeamClick(team)}
                            className={`flex items-center justify-start gap-1 px-2 py-1 rounded-md border text-xs font-medium transition
          ${selectedTeam === team.name ? "border-green-400 bg-green-900 text-white scale-105" : "border-gray-700 bg-gray-800 text-gray-200"}
          hover:bg-indigo-700 hover:scale-105`}
                        >
                            {team.logo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${team.logo}`}
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



            <div className="flex items-center space-x-4">
                <label className="flex items-center cursor-pointer">
                    <span className="mr-2 text-sm">Show Team Squad</span>
                    <input
                        type="checkbox"
                        checked={isTeamViewActive}
                        onChange={async () => {
                            const team = teams.find(t => t.name === selectedTeam);
                            if (!team) return;

                            const newState = !isTeamViewActive;

                            if (newState) {
                                // Turn off live auction if Show Squad is being activated
                                setIsLiveAuctionActive(false);
                                await fetch(`${API}/api/show-team`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ team_id: team.id })
                                });
                            } else {
                                // If turning off Show Squad, re-enable Live Auction
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
                        <div
                            className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isTeamViewActive ? 'translate-x-5' : ''
                                }`}
                        ></div>
                    </div>
                </label>

                <label className="flex items-center cursor-pointer space-x-2">
                    <span className="text-sm">Live Auction</span>
                    <input
                        type="checkbox"
                        checked={isLiveAuctionActive}
                        onChange={async () => {
                            const newState = !isLiveAuctionActive;

                            // If turning on Live Auction, turn off Show Squad
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
                    <div className={`w-10 h-5 rounded-full ${isLiveAuctionActive ? 'bg-blue-500' : 'bg-red-400'} relative`}>
                        <div
                            className={`absolute left-0 top-0 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${isLiveAuctionActive ? 'translate-x-5' : ''}`}
                        ></div>
                    </div>
                </label>

                <button
                    className="bg-green-500 hover:bg-green-400 text-black font-bold px-2 py-2 rounded shadow"
                    onClick={markAsSold}
                    disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                >
                    ✅ SOLD
                </button>

                <button
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-2 py-2 rounded shadow"
                    onClick={markAsUnsold}
                    disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                >
                    ❌ UNSOLD
                </button>
            </div>



            <div className="mb-4 mt-4">
                <label className="block mb-1">Bid Amount (₹)</label>
                <input
                    type="number"
                    className="w-full p-2 rounded text-black"
                    value={bidAmount}
                    onChange={e => {
                        const value = parseInt(e.target.value, 10) || 0;
                        setBidAmount(value);
                    }}
                    disabled={isTeamViewActive}
                />
                <div className={`text-sm mt-1 ${isTeamViewActive ? 'text-gray-600' : 'text-gray-400'}`}>
                    Bid Increments:
                    {bidIncrements.map((r, i) => (
                        <div key={i}>
                            ₹{r.min_value} – {r.max_value ? `₹${r.max_value}` : '∞'} → +₹{r.increment}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">🔍 Search Player by ID:</h3>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="number"
                        min="1"
                        className="p-2 rounded text-black w-full sm:w-1/3"
                        placeholder="Enter Player ID"
                        onChange={(e) => setSearchId(e.target.value.trim())}
                    />
                    <button
                        onClick={handleSearchById}
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

            {/* Selected player details */}

            {currentPlayer ? (
                <div className="mb-6">
                    <h3 className="text-xl font-semibold mb-2">Current Player:</h3>
                    <p>ID: {currentPlayer.id}</p>
                    <p>Auction-serial: {currentPlayer.auction_serial}</p>
                    <p>Name: {currentPlayer.name}</p>
                    <p>Role: {currentPlayer.role}</p>
                    <p>Base Price: ₹{currentPlayer.base_price}</p>
                    {currentPlayer.sold_status && (
                        <p className="mt-1 text-yellow-300">
                            Status: {String(currentPlayer.sold_status).toUpperCase()}
                        </p>
                    )}
                </div>
            ) : (
                <p>No current player selected.</p>
            )}

            <div className="mt-8 mb-6">
                <h3 className="text-lg font-semibold mb-2">📢 Custom Spectator Message</h3>
                <textarea
                    rows="3"
                    placeholder="Enter message to show on spectator screen"
                    className="w-full p-3 rounded text-black"
                    onChange={(e) => setCustomMessage(e.target.value)}
                />
                <button
                    onClick={async () => {
                        await fetch(`${API}/api/custom-message`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ message: customMessage }),
                        });
                        alert("Custom message broadcasted.");
                    }}
                    className="mt-2 bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded shadow font-bold"
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
                    className="bg-teal-500 hover:bg-teal-400 text-black font-bold px-4 py-2 m-2 rounded shadow"
                >
                    📊 Show Team Stats
                </button>

                <button
                    onClick={async () => {
                        await fetch(`${API}/api/custom-message`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ message: "__CLEAR_CUSTOM_VIEW__" }),
                        });
                        alert("✅ Cleared custom view. Back to live mode.");
                    }}
                    className="bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-2 m-1 rounded shadow"
                >
                    🔄 Clear Custom View
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">

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
                        : 'bg-orange-700 hover:bg-orange-600 text-white'
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
                            // 🔔 Notify spectators to refresh team stats
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
            </div>
            <footer className="text-center text-white text-sm tracking-widest bg-black border-t border-purple-600 animate-pulse w-full py-2 mt-2">
                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
            </footer>
        </div>


    );
};

export default AdminPanel;