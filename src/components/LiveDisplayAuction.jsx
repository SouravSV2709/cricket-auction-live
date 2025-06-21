import React, { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

const LiveDisplayAuction = ({
    player,
    highestBid,
    leadingTeam,
    timer,
    auctionStatus,
    teamSummaries,
}) => {
    const hasFiredRef = useRef(false); // prevent repeating effect during polling

    useEffect(() => {
        if (auctionStatus === "sold" && !hasFiredRef.current) {
            triggerConfettiBurst();
            hasFiredRef.current = true;

            // reset flag after 3 seconds for future players
            setTimeout(() => {
                hasFiredRef.current = false;
            }, 3000);
        }
    }, [auctionStatus]);

    const triggerConfettiBurst = () => {
        const duration = 3000;
        const end = Date.now() + duration;
        const defaults = {
            startVelocity: 30,
            spread: 360,
            ticks: 60,
            zIndex: 9999,
        };

        const interval = setInterval(() => {
            const timeLeft = end - Date.now();

            if (timeLeft <= 0) {
                clearInterval(interval);
                return;
            }

            confetti({
                ...defaults,
                particleCount: 60,
                origin: {
                    x: Math.random(),
                    y: Math.random() * 0.6,
                },
            });
        }, 300);
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-4">
            {/* Header */}
            <header className="text-3xl font-bold text-center py-4 tracking-wider">
                AUCTION ARENA LIVE DISPLAY
            </header>

            {/* Player Info */}
            <div className="flex flex-col items-center text-center">
                <img
                    src={player.profile_image}
                    alt={player.name}
                    className="w-48 h-48 rounded-full object-cover border-4 border-white mb-4"
                />
                <h2 className="text-2xl font-semibold">{player.name}</h2>
                <p className="text-lg">
                    {player.role} | Base Price: ₹{(player.base_price || 0).toLocaleString()}
                </p>
            </div>

            {/* Bidding Info */}
            <div className="text-center mt-6">
                {auctionStatus !== 'sold' && auctionStatus !== 'unsold' && (
                    <>
                        <p className="text-xl">🔴 Current Bid: ₹{(highestBid || 0).toLocaleString()}</p>
                        <p className="text-xl">🟢 Leading Team: {leadingTeam || "-"}</p>
                        {/* <p className="text-lg mt-2">⏱️ Time Left: {timer}</p> */}
                    </>
                )}

                {auctionStatus === 'sold' && (() => {
                    const team = teamSummaries.find(t => t.id === player.team_id);
                    const displayName = team?.name || leadingTeam;

                    return (
                        <p className="text-green-400 text-2xl font-bold mt-4">
                            SOLD TO: {displayName} for ₹{(player.sold_price || highestBid).toLocaleString()}
                        </p>
                    );
                })()}


                {auctionStatus === 'unsold' && (
                    <div className="text-red-400 text-2xl font-bold mt-4 flex flex-col items-center">
                        <p className="mb-2 animate-shake">UNSOLD</p>
                        <span className="text-[80px] animate-shake">😞</span>
                    </div>
                )}

            </div>

            {/* Team Summary Strip */}
            <div className="w-full mt-10 bg-gray-900 py-2 px-4 overflow-x-auto whitespace-nowrap flex gap-6 text-sm">
                {teamSummaries.map((team) => (
                    <div
                        key={team.id}
                        className="bg-gray-700 px-3 py-2 rounded-lg text-center min-w-[120px]"
                    >
                        <p className="font-semibold">{team.name}</p>
                        <p>💰 ₹{team.budget.toLocaleString()}</p>
                        <p>👥 {team.players.length} Players</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LiveDisplayAuction;
