import React from "react";
import useDraggable from "./useDraggable";
import BackgroundEffect from "./BackgroundEffect";

const PlayerCard = ({
    player,
    isSold,
    isUnsold,
    soldPrice,
    currentBid,
    biddingTeam,
    biddingTeamLogo,
    secretBidActive
}) => {
    const cardRef = useDraggable("playerImage");

    const formatINR = (value) => {
        const amount = Number(value);
        if (isNaN(amount)) return "₹0";
        return `₹${amount.toLocaleString()}`;
    };

    return (
        <>
            {/* 📦 Unified Auction Panel */}
            <div
                ref={cardRef}
                className="absolute z-10 flex flex-col items-center justify-center select-none cursor-move w-full font-sans"
                style={{ top: 0, left: 0 }}
            >
                {/* Horizontal Block Layout */}
                <div className="relative rounded-xl overflow-hidden ring-4 ring-cyan-400 animate-glow text-white max-w-2xl mx-auto px-2 py-2">
                    {/* 🔲 Animated Parallax Grid */}
<div
  className="absolute inset-0 z-0 animate-grid-scroll"
  style={{
    backgroundImage: `
      radial-gradient(circle, rgba(255, 255, 255, 0.2) 2px, transparent 2px)
    `,
    backgroundSize: "60px 60px", // 🔍 Larger spacing between dots
    backgroundColor: "#4c1d95", // base purple
    backgroundBlendMode: "overlay",
  }}
></div>





                    {/* 💎 Actual 3-block content section */}
                    <div className="relative z-10 flex justify-center">
                        {/* Base Price */}
                        <div className="flex flex-col items-left justify-center text-xs">
                            <p className="text-yellow-200 tracking-widest">Base Price: {formatINR(player.base_price)}</p>
                            <p className="text-yellow-200 tracking-widest">Name: {player.name}</p>
                            <p className="text-yellow-200 tracking-widest">Role: {player.role}</p>
                        </div>

                        {/* Player Image with Decorative Frame */}
                        <div
                            className="relative w-52 h-52 rounded-full bg-center bg-contain bg-no-repeat flex items-center justify-center"
                            style={{
                                backgroundImage: "url('/frame.png')",
                            }}
                        >
                            <img
                                src={player.profile_image?.startsWith("http")
                                    ? player.profile_image
                                    : `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}`}
                                alt={player.name}
                                className="w-36 h-36 object-cover rounded-full border-4 border-white shadow-md"
                                onError={(e) => (e.target.src = "/no-image-found.png")}
                            />
                        </div>

                        {/* Current Bid / Sold */}
                        <div className="flex flex-col justify-center items-left">
                            <p className="text-xs uppercase tracking-widest text-yellow-200">
                                {isSold ? "Sold Price" : isUnsold ? "Status" : "Current Bid"}
                            </p>
                            <p className={`text-xl items-left font-extrabold ${isSold ? "text-green-300" : isUnsold ? "text-red-300" : "text-white"}`}>
                                {isUnsold ? "UNSOLD" : formatINR(isSold ? soldPrice : currentBid)}
                            </p>
                        </div>
                    </div>
                </div>


                {/* 🟣 Team Info below card */}
                <div className="mt-4">
                    {isSold && player.team_id ? (
                        <div className="flex items-center gap-3 bg-gradient-to-r from-green-900 to-green-600 rounded-lg px-4 py-2 shadow-md">
                            {player.team_logo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${player.team_logo}?tr=w-40,h-40`}
                                    alt="Sold To"
                                    className="w-10 h-10 object-contain rounded-full border border-white"
                                />
                            )}
                            <p className="text-white text-lg font-bold tracking-wide">
                                SOLD: {player.team_name || `Team #${player.team_id}`}
                            </p>
                        </div>
                    ) : !isUnsold && secretBidActive ? (
                        <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-lg px-6 py-2 shadow-md animate-pulse">
                            <p className="text-black text-base font-bold tracking-wide">🔒 Secret Bid in Progress</p>
                        </div>
                    ) : !isUnsold && biddingTeam ? (
                        <div className="flex items-center gap-3 bg-gradient-to-r from-purple-900 to-purple-600 rounded-lg px-4 py-2 shadow-md">
                            {biddingTeamLogo && (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${biddingTeamLogo}?tr=w-40,h-40`}
                                    alt={biddingTeam}
                                    className="w-10 h-10 object-contain rounded-full border border-white"
                                />
                            )}
                            <p className="text-white text-lg font-semibold tracking-wide">{biddingTeam}</p>
                        </div>
                    ) : !isUnsold && !isSold ? (
                        <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-900 to-indigo-700 rounded-full px-6 py-2 shadow-md animate-pulse">
                            <svg
                                className="w-4 h-4 text-yellow-300 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                ></circle>
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                ></path>
                            </svg>
                            <p className="text-sm text-white font-semibold tracking-wide">Waiting for a bid...</p>
                        </div>
                    ) : (
                        <img
                            src="/duck.gif"
                            alt="Sad Duck"
                            className="w-24 h-24 object-contain mx-auto"
                        />
                    )}
                </div>
            </div>

            {/* 🧠 Animations */}
            <style>{`
    @keyframes parallaxGrid {
      0% {
        background-position: 0 0;
      }
      100% {
        background-position: 100px 100px;
      }
    }

    .animate-parallaxGrid {
      animation: parallaxGrid 25s linear infinite;
    }

    @keyframes glow {
      0% { box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee; }
      50% { box-shadow: 0 0 20px #22d3ee, 0 0 40px #22d3ee; }
      100% { box-shadow: 0 0 10px #22d3ee, 0 0 20px #22d3ee; }
    }

    .animate-glow {
      animation: glow 3s ease-in-out infinite;
    }
      @keyframes scrollGrid {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 100px 100px;
  }
}

.animate-grid-scroll {
  animation: scrollGrid 30s linear infinite;
}

  `}</style>

        </>
    );
};

export default PlayerCard;
