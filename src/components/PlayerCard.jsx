import React from "react";
import useDraggable from "./useDraggable";

const PlayerCard = ({
  player,
  isSold,
  isUnsold,
  soldPrice,
  currentBid,
  biddingTeam,
  secretBidActive,
  biddingTeamLogo
}) => {
  const wrapperRef = useDraggable("playerCardWrapper");

  return (
    <div
      ref={wrapperRef}
      className="absolute z-50 select-none cursor-move flex flex-row items-center justify-center gap-6 p-4"
    >
      {/* 🟡 Price Panel */}
      <div className="flex flex-col items-center justify-center px-6 py-4 bg-gradient-to-br from-purple-900 to-black border-2 border-purple-700 rounded-lg shadow-xl text-white">
        <p className="text-sm uppercase">Base Price</p>
        <p className="text-xl font-bold text-yellow-400">
          ₹{(player.base_price || 0).toLocaleString()}
        </p>

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

      {/* 🟢 Player Info */}
      <div className="flex flex-col items-center space-y-2">
        <img
          src={
            player.profile_image?.startsWith("http")
              ? player.profile_image
              : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`
          }
          alt={player.name}
          className="w-36 h-36 object-contain rounded-full shadow-md"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = "/no-image-found.png";
          }}
        />
        <div className="text-base font-bold text-black uppercase text-center">
          NAME: {player.name} || {player.auction_serial}
        </div>
        <div className="text-sm text-black font-semibold text-center">
          Role: {player.role}
        </div>
      </div>

      {/* 🟣 Team / Secret Bid / Status */}
      <div>
        {isSold && player.team_id ? (
          <div className="flex items-center gap-3 bg-green-100 px-4 py-2 rounded-lg shadow-md">
            {player.team_logo && (
              <img
                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${player.team_logo}?tr=w-40,h-40`}
                alt="Team"
                className="w-10 h-10 object-contain rounded-full border border-white"
              />
            )}
            <p className="text-purple-800 font-bold text-sm">{player.team_name || "Team"}</p>
          </div>
        ) : !isUnsold && secretBidActive ? (
          <div className="bg-yellow-300 text-black px-4 py-2 rounded-lg shadow-md font-bold">
            🔒 Secret Bid in Progress
          </div>
        ) : !isUnsold && biddingTeam ? (
          <div className="flex items-center gap-3 bg-green-100 px-4 py-2 rounded-lg shadow-md">
            {biddingTeamLogo && (
              <img
                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${biddingTeamLogo}?tr=w-40,h-40`}
                alt="Team"
                className="w-10 h-10 object-contain rounded-full border border-white"
              />
            )}
            <p className="text-purple-800 font-bold text-sm">{biddingTeam}</p>
          </div>
        ) : !isUnsold && !isSold ? (
          <div className="bg-purple-700 px-5 py-2 rounded-full text-white text-sm shadow-md animate-pulse">
            Waiting for a bid...
          </div>
        ) : (
          <img
            src="/unsold5.gif"
            alt="No Bid"
            className="w-36 h-36 object-contain mx-auto"
          />
        )}
      </div>
    </div>
  );
};

export default PlayerCard;
