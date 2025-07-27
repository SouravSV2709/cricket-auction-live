import React from "react";
import useDraggable from "./useDraggable";

const PlayerCard = ({
  player,
  isSold,
  isUnsold,
  soldPrice,
  currentBid,
  biddingTeam,
  secretBidActive, // ✅ add this line
  biddingTeamLogo
}) => {
  const playerRef = useDraggable("playerImage");
  const priceRef = useDraggable("pricePanel");
  const teamRef = useDraggable("biddingTeamBox");


  return (
    <>
      {/* 🟢 Player Image */}
      <div
  ref={playerRef}
  className="absolute z-10 select-none cursor-move flex flex-col justify-center items-center mt-5"
>
  <img
    src={player.profile_image?.startsWith("http")
      ? player.profile_image
      : `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-320,h-320,fo-face,z-1`}
    alt={player.name}
    className="w-40 h-40 object-cover rounded-full shadow-lg border-2 border-white"
    onError={(e) => {
      e.target.onerror = null;
      e.target.src = "/no-image-found.png";
    }}
  />
  <div className="text-sm font-bold text-black mt-2 uppercase text-center">Name: {player.name}</div>
  <div className="text-sm text-black font-semibold text-center">
    <div>Role: {player.role}</div>
  </div>
</div>

      {/* 🟡 Price Panel */}
      <div
        ref={priceRef}
        style={{ left: 0, top: 0 }}
        className="absolute z-50 p-2 bg-yellow-500/30 select-none cursor-move"
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
              className={`text-xl font-bold ${isSold
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


      {/* 🔵 Bidding Team Box – always render for dragging */}
      <div
        ref={teamRef}
        className="absolute z-50 p-2 bg-green-500/30 select-none cursor-move"
      >
        {isSold && player.team_id ? (
          <div className="flex items-center gap-3 bg-green-800 rounded-lg px-4 py-2 shadow-md">
            {player.team_logo && (
              <img
                src={`https://ik.imagekit.io/auctionarena/uploads/teams/logos/${player.team_logo}?tr=w-40,h-40`}
                alt="Sold To"
                className="w-10 h-10 object-contain rounded-full border border-white"
              />
            )}
            <p className="text-white text-lg font-semibold">
              SOLD: {player.team_name || "Team"}
            </p>
          </div>
        ) : !isUnsold && secretBidActive ? (
          <div className="flex items-center gap-3 bg-yellow-600 rounded-lg px-4 py-2 shadow-md">
            <p className="text-black text-lg font-bold">🔒 Secret Bid in Progress</p>
          </div>
        ) : !isUnsold && biddingTeam ? (

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
        ) : !isUnsold && !isSold ? (
          <div className="flex items-center gap-3 bg-purple-800 rounded-full px-5 py-2 shadow-md animate-pulse">
            <span className="text-white text-sm font-semibold flex items-center gap-2">
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
              Waiting for a bid...
            </span>
          </div>
        ) : (

          <div>
            <img
              src="/duck.gif"
              alt="Sad Duck"
              className="w-24 h-24 object-contain mx-auto"
            />
          </div>
        )}
      </div>

    </>
  );
};

export default PlayerCard;
