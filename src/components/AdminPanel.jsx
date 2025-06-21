import React, { useEffect, useState } from "react";
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



    useEffect(() => {
        const tournamentId = CONFIG.TOURNAMENT_ID;
        fetchPlayers();
        fetchTeams(CONFIG.TOURNAMENT_ID);
        fetchCurrentPlayer();
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
            const text = await res.text();
            if (!text) {
                console.warn("Empty response from /api/teams");
                setTeams([]);
                return;
            }
            const data = JSON.parse(text);
            if (!Array.isArray(data)) {
                console.error("Expected array, got:", data);
                setTeams([]);
                return;
            }
            setTeams(data);
        } catch (error) {
            console.error("Failed to fetch teams:", error);
            setTeams([]);
        }
    };



    const fetchCurrentPlayer = async () => {
        try {
            const res = await fetch(`${API}/api/current-player`);

            const text = await res.text(); // get raw text
            if (!text) {
                console.warn("Empty response from /api/current-player");
                setCurrentPlayer(null);
                return;
            }

            const data = JSON.parse(text); // parse manually
            setCurrentPlayer(data);
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

        setUndoStack(prev => [...prev, {
            type: "sold",
            player: currentPlayer,
            teamName: selectedTeam,
            bidAmount,
        }]);

        const updatedPlayer = {
            ...currentPlayer,
            sold_status: "TRUE",
            team_id: teamId,
            sold_price: bidAmount,
            base_price: currentPlayer.base_price || computeBasePrice(currentPlayer)
        };

        // 1. Update current-player
        await fetch(`${API}/api/current-player`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer)
        });

        // ✅ 2. PUT only relevant fields to players/:id

        await fetch(`${API}/api/players/${currentPlayer.id}`, {
            method: "PUT", // updating the db
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sold_status: "TRUE",
                team_id: teamId,
                sold_price: bidAmount
            })
        });

        // 3. Update team
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

        await fetch(`${API}/api/teams/${team.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedTeam)
        });

        // Notify sold
        await fetch(`${API}/api/notify-sold`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPlayer),
        });

        // Also notify general player change
        await fetch(`${API}/api/notify-player-change`, {
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

        alert("🎉 Player SOLD and team updated!");

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

        const res = await fetch(`${API}/api/players?tournament_id=${CONFIG.TOURNAMENT_ID}`);
        const allPlayers = await res.json();

        const unprocessedPlayers = allPlayers.filter(
            p =>
                !["TRUE", "FALSE", true, false, "true", "false"].includes(p.sold_status) &&
                !p.deleted_at // make sure deleted_at is null or undefined
        );

        if (unprocessedPlayers.length === 0) {
            alert("✅ All players have been auctioned.");
            return;
        }

        const nextBasic = unprocessedPlayers[0];

        // ✅ Fetch full enriched player details (with full image + base price)
        const detailedRes = await fetch(`${API}/api/players/${nextBasic.id}`);
        const nextPlayer = await detailedRes.json();
        nextPlayer.base_price = computeBasePrice(nextPlayer);


        // Save undo
        setUndoStack(prev => [...prev, {
            type: "next",
            player: currentPlayer
        }]);

        // Set current-player
        await fetch(`${API}/api/current-player`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextPlayer)
        });


        // Reset current bid
        await fetch(`${API}/api/current-bid`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                bid_amount: 0,
                team_name: ""
            })
        });

        // Notify Spectators
        await fetch(`${API}/api/notify-player-change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextPlayer),
        });


        setPlayers(allPlayers);
        setCurrentPlayer(nextPlayer); // ✅ Proper data with full image and base price
        setBidAmount(0);
        setSelectedTeam('');
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
                name: player.name || "Unknown",
                role: player.role || "Unknown",
                base_price: computeBasePrice(player),
                profile_image: player.profile_image || `https://ik.imagekit.io/auctionarena/uploads/players/profiles/default.jpg`,
                sold_status: player.sold_status ?? null,
                team_id: player.team_id ?? null,
                sold_price: player.sold_price ?? 0
            };


            console.log("📦 About to update current player:", playerWithStatus);

            await fetch(`${API}/api/current-player`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(playerWithStatus),
            });

            await fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(playerWithStatus),
            });

            console.log("✅ Notified spectators of player change");

            await fetchCurrentPlayer(); // Refresh Admin UI
            setBidAmount(0);
            setSelectedTeam('');


        } catch (err) {
            console.error("❌ Error in handleSearchById:", err);
            alert("❌ Failed to find player. Please try again.");
        }
    };


    const resetAuction = async () => {
        try {
            const tournamentId = CONFIG.TOURNAMENT_ID;

            // 1️⃣ Reset All Players
            const playersRes = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const players = await playersRes.json();

            for (const player of players) {
                await fetch(`${API}/api/players/${player.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sold_status: null,
                        sold_price: null,
                        team_id: null
                    })
                });
            }

            // 2️⃣ Reset All Teams
            // Fetch auction_money from tournament table and reset all teams

            const tournamentRes = await fetch(`${API}/api/tournaments/${tournamentId}`);
            const tournament = await tournamentRes.json();
            const auctionMoney = tournament.auction_money || 0;

            // Call backend reset route (which also updates team stats)

            await fetch(`${API}/api/reset-auction`, {
                method: "POST"
            });



            // 3️⃣ Reset Current Player
            await fetch(`${API}/api/current-player`, {
                method: "POST",
            });

            // 4️⃣ Reset Current Bid
            await fetch(`${API}/api/current-bid`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bid_amount: 0,
                    team_name: ""
                })
            });

            alert("✅ Auction has been fully reset.");
            fetchPlayers(); // Refresh player list

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

            {currentPlayer ? (
                <div className="mb-6">
                    <h3 className="text-xl font-semibold mb-2">Current Player:</h3>
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

            {/* UI to select theme */}

           <div className="my-4">
    <label className="block mb-2 font-bold text-lg">🎨 Select Theme:</label>
    <div className="inline-grid grid-cols-3 md:grid-cols-8 gap-2">
      {Object.entries(THEMES).map(([key, style]) => (
        <div
          key={key}
          className={`cursor-pointer rounded-xl transition-all duration-300 ${
            selectedTheme === key ? 'scale-105' : 'border-transparent'
          }`}
          style={{
            background: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
          }}
          onClick={() => setSelectedTheme(key)}
        >
          <div className="items-center">
          <div className={`w-10 h-10 rounded-md bg-gradient-to-br ${style.bg} flex`}>
          </div>
          <p className={`${key} text-xs font-bold`}>
            {key.toUpperCase()}
          </p>
          </div>
        </div>
      ))}
    </div>
    <div><button
      onClick={updateTheme}
      className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded"
    >
      ✅ Apply Theme
    </button></div>
  </div>

            <div className="mb-4">
                <h3 className="text-lg font-semibold">Select Team:</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                    {teams.map(team => (
                        <button
                            key={team.id}
                            onClick={async () => {
                                setSelectedTeam(team.name);

                                // Only run bidding logic if a player is currently selected
                                if (currentPlayer) {
                                    const newBid = Math.max(bidAmount + 100, currentPlayer.base_price);

                                    setUndoStack(prev => [
                                        ...prev,
                                        {
                                            type: "bid",
                                            player: currentPlayer,
                                            previousBid: bidAmount,
                                            previousTeam: selectedTeam
                                        }
                                    ]);

                                    setBidAmount(newBid);

                                    await fetch(`${API}/api/current-bid`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            bid_amount: newBid,
                                            team_name: team.name
                                        })
                                    });
                                }
                            }}

                            className={`px-3 py-1 rounded ${selectedTeam === team.name
                                ? "bg-green-500 text-black font-bold"
                                : "bg-gray-700"
                                }`}
                        >
                            {team.name}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <button
                    className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-3 py-1 rounded"
                    onClick={async () => {
                        const team = teams.find(t => t.name === selectedTeam);
                        if (!team) {
                            alert("Select a team first");
                            return;
                        }
                        await fetch(`${API}/api/show-team`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ team_id: team.id })
                        });
                        alert(`✅ ${team.name} squad will be shown on Spectator.`);
                    }}
                >
                    🧢 Show Team Squad
                </button>

                <button
                    className="bg-gray-300 hover:bg-gray-200 text-black font-bold px-3 py-1 ml-3 rounded"
                    onClick={async () => {
                        await fetch(`${API}/api/show-team`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ team_id: null })
                        });
                        alert("🎬 Back to live auction view");
                    }}
                >
                    🔙 Exit Team View
                </button>
                <div className="mt-4 space-x-4">
                    <button
                        className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-3 py-1 rounded"
                        onClick={async () => {
                            await fetch(`${API}/api/start-team-loop`, {
                                method: "POST",
                            });
                            alert("✅ Team loop started");
                        }}
                    >
                        🔁 Enable Team Loop
                    </button>

                    <button
                        className="bg-red-400 hover:bg-red-300 text-black font-bold px-3 py-1 rounded"
                        onClick={async () => {
                            await fetch(`${API}/api/stop-team-loop`, {
                                method: "POST",
                            });
                            alert("⏹️ Team loop stopped");
                        }}
                    >
                        ⏹️ Disable Team Loop
                    </button>
                </div>

            </div>



            <div className="mb-4">
                <label className="block mb-1">Bid Amount (₹)</label>
                <input
                    type="number"
                    className="w-full p-2 rounded text-black"
                    value={bidAmount}
                    onChange={e => {
                        const value = parseInt(e.target.value, 10) || 0;
                        setBidAmount(value);
                    }}
                />
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
                    >
                        🔍 Show Player
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <button
                    className="bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-2 rounded shadow"
                    onClick={markAsSold}
                    disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                >
                    ✅ Mark as SOLD
                </button>

                <button
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded shadow"
                    onClick={markAsUnsold}
                    disabled={["TRUE", true, "FALSE", false, "true", "false"].includes(currentPlayer?.sold_status)}
                >
                    ❌ Mark as UNSOLD
                </button>

                <button
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded shadow"
                    onClick={handleNextPlayer}
                >
                    ➡️ Next Player
                </button>

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
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded shadow"
                    onClick={clearCurrentPlayer}
                >
                    🚫 Clear Current Player
                </button>
            </div>

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
            </div>
        </div>


    );
};

export default AdminPanel;