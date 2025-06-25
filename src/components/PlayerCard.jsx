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


  return (
    <>
      {/* 🟢 Player Image */}
      <div
        ref={playerRef}
        style={{
          left: 0,
          top: 0,
          backgroundImage: 'url("/goldenbg.png")',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          height: '300px',
          width: '240px'
        }}
        className="absolute z-10 select-none cursor-move flex flex-col mt-5 justify-center"
      >
        <img
          src={
            player.profile_image?.startsWith("http")
              ? player.profile_image
              : `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`
          }
          alt={player.name}
          className="w-20 h-35 object-contain mx-auto rounded-lg"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
        />
        <div className="text-xs font-bold text-black mt-1 uppercase text-center justify-center">{player.name}</div>
        <div className="text-xs text-black font-semibold mt-1 text-center justify-center">
          <div>🏏 {player.role}</div>
          <div>📍 {player.district}</div>
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
            <p className="text-white text-lg font-semibold">SOLD: {player.team_name}</p>
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
        ) : (
          <div className="text-white bg-purple-900 px-3 py-2 rounded-lg shadow-md">
            <p className="text-sm italic text-gray-300">Waiting for a bid...</p>
          </div>
        )}
      </div>

    </>
  );
};

export default PlayerCard;
