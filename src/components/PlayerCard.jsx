import React from "react";
import useDraggable from "./useDraggable";

const PlayerCard = ({
  player,
  isSold,
  isUnsold,
  soldPrice,
  currentBid,
  biddingTeam,
  biddingTeamLogo
}) => {
  const playerRef = useDraggable("playerImage");
  const priceRef = useDraggable("pricePanel");
  const teamRef = useDraggable("biddingTeamBox");

  if (!player || !player.profile_image) return null;

  return (
    <>
      {/* 🟢 Player Image */}
      <div
        ref={playerRef}
        className="absolute z-50 p-2 bg-blue-500/30 select-none touch-none cursor-move"
      >
        <img
          src={player.profile_image}
          alt={player.name}
          className="w-40 h-40 object-cover rounded-xl border-4 border-purple-500 shadow-lg"
        />
      </div>

      {/* 🟡 Price Panel */}
      <div
        ref={priceRef}
        className="absolute z-50 p-2 bg-yellow-500/30 select-none touch-none cursor-move"
      >
        <div className="w-fit max-w-xl flex justify-around items-center bg-gradient-to-br from-purple-900 to-black border-2 border-purple-700 rounded-lg px-6 py-3 shadow-xl text-white">
          <div className="text-center">
            <p className="text-sm uppercase">Base Price</p>
            <p className="text-xl font-bold text-yellow-400">
              ₹{(player.base_price || 0).toLocaleString()}
            </p>
          </div>

          <div className="text-center ml-8">
            <p className="text-sm uppercase">
              {isSold ? "Sold Price" : isUnsold ? "Status" : "Current Bid"}
            </p>
            <p
              className={`text-xl font-bold ${
                isSold
                  ? "text-green-400"
                  : isUnsold
                  ? "text-red-400"
                  : "text-blue-400"
              }`}
            >
              {isSold
                ? `₹${(soldPrice || 0).toLocaleString()}`
                : isUnsold
                ? "UNSOLD"
                : `₹${(currentBid || 0).toLocaleString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* 🔵 Bidding Team Box */}
      {!isSold && !isUnsold && biddingTeam && (
        <div
          ref={teamRef}
          className="absolute z-50 p-2 bg-green-500/30 select-none touch-none cursor-move"
        >
          <div className="flex items-center gap-3 bg-purple-800 rounded-lg px-4 py-2 shadow-md">
            {biddingTeamLogo && (
              <img
                src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${biddingTeamLogo}?tr=w-40,h-40`}
                alt={biddingTeam}
                className="w-10 h-10 object-contain rounded-full border border-white"
              />
            )}
            <p className="text-white text-lg font-semibold">{biddingTeam}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default PlayerCard;
