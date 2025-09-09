import React from "react";
import "../App.css";

const PlayerCard3 = ({
    player = {},
    isSold,
    isUnsold,
    soldPrice,
    currentBid,
    biddingTeam,
    biddingTeamLogo,
    secretBidActive,
    animClass,
    tournamentLogo,
    brandLogo,                    // e.g. "/logos/auction-arena-white.svg" or ImageKit URL
    brandText = "AUCTION ARENA",  // shows a small tagline under the name
    soldMarqueeItems = [],        // 👈 NEW: [{ name, team }]
}) => {

    const formatINR = (value) => {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return "₹0";
        return `₹${n.toLocaleString("en-IN")}`;
    };

    const basePrice = player?.base_price || 0;

    // RIGHT-PANEL CONTENT
    let rightTitle = "WAITING";
    let rightMain = "FOR BID";
    let rightSub = "";
    let rightBg = "bg-gray-700";
    let rightText = "text-white";

    if (isUnsold) {
        rightTitle = "STATUS";
        rightMain = "UNSOLD";
        rightSub = "";
        rightBg = "bg-red-700";
        rightText = "text-white";
    } else if (isSold) {
        rightTitle = "SOLD";
        rightMain = formatINR(soldPrice);
        rightSub = player?.team_name ? player.team_name : "";
        rightBg = "bg-green-700";
        rightText = "text-white";
    } else if (Number(currentBid) > 0) {
        rightTitle = "CURRENT BID";
        rightMain = formatINR(currentBid);
        rightSub = biddingTeam || (secretBidActive ? "Secret Bid" : "");
        rightBg = "bg-emerald-700";
        rightText = "text-white";
    }

    return (
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 w-[92vw] max-w-[1200px] select-none ${animClass || ""}`}>
            {/* BAR */}
            <div className="w-full flex flex-col items-center">
                {/* Image sits above the ribbon; no absolute/negative top */}
                {player?.profile_image && (
                    <div className="w-48 h-96 rounded-md overflow-hidden ring-4 ring-white shadow-xl bg-white -mb-20">
                        <img
                            src={
                                player.profile_image?.startsWith("http")
                                    ? player.profile_image
                                    : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-320,h-320,fo-face,z-0.4,q-95,e-sharpen,f-webp`
                            }
                            onError={(e) => (e.currentTarget.src = "/no-image-found.png")}
                            alt={player?.name || "Player"}
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}

                {/* Ribbon */}
                <div className="flex items-stretch w-full h-20 drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)] relative z-10">
                    {/* LEFT — Base Price */}
                    <div className="relative w-[28%] text-white px-6 flex flex-col justify-center rounded-l-xl bg-gradient-to-r from-rose-800 to-rose-600">
                        <div
                            className="absolute -left-6 top-0 h-full w-6"
                            style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)", background: "linear-gradient(to right, #9f1239, #be123c)" }}
                        />
                        <p className="uppercase text-xs tracking-widest opacity-90">Base Price</p>
                        <p className="text-3xl font-extrabold leading-none">{formatINR(basePrice)}</p>
                    </div>

                    {/* CENTER — Player Name + optional tagline */}
                    {/* CENTER — Player Name with logos inside the ribbon */}
                    <div className="flex-1 relative text-white bg-gradient-to-r from-rose-600 to-rose-500">
                        {/* left logo: tournament */}
                        {tournamentLogo && (
                            <img
                                src={tournamentLogo}
                                alt="Tournament"
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-20 h-20 rounded-full object-contain bg-white/80 animate-pulse"
                                onError={(e) => (e.currentTarget.style.display = "none")}
                            />
                        )}

                        {/* right logo: Auction Arena */}
                        {brandLogo && (
                            <img
                                src={brandLogo}
                                alt="Auction Arena"
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-20 h-20 bg-white/80 rounded-full object-cover animate-pulse"
                                onError={(e) => (e.currentTarget.style.display = "none")}
                            />
                        )}

                        {/* keep text perfectly centered; add side padding so logos don't overlap */}
                        <div className="h-full w-full px-16 flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-[28px] font-extrabold tracking-wide leading-none">
                                    {player?.name || "—"}
                                </p>
                                {(player?.role || player?.auction_serial) && (
                                    <p className="mt-1 text-xs uppercase tracking-widest opacity-90">
                                        {player?.role ? `${player.role}` : ""}{" "}
                                        {player?.auction_serial ? `• Serial ${player.auction_serial}` : ""}
                                    </p>
                                )}
                                {brandText && (
                                    <p className="mt-1 text-[10px] uppercase tracking-[0.2em] opacity-70">
                                        {brandText}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* RIGHT — Status / Bid / Sold */}
                    <div
                        className={`relative w-[28%] text-white px-5 pr-6 rounded-r-xl flex items-center justify-between ${isUnsold
                            ? "bg-gradient-to-r from-red-800 to-red-600"
                            : isSold
                                ? "bg-gradient-to-r from-green-800 to-green-600"
                                : Number(currentBid) > 0
                                    ? "bg-gradient-to-r from-emerald-800 to-emerald-600"
                                    : "bg-gradient-to-r from-slate-800 to-slate-600"
                            }`}
                    >
                        <div
                            className="absolute -right-6 top-0 h-full w-6"
                            style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)", background: "inherit" }}
                        />
                        <div className="flex-1">
                            <p className="uppercase text-[10px] tracking-[0.2em] opacity-90">{rightTitle}</p>
                            <p className="text-3xl font-extrabold leading-none">{rightMain}</p>
                            {rightSub && (
                                <p className="mt-1 text-xs font-semibold truncate max-w-[16rem]">{rightSub}</p>
                            )}
                        </div>

                        {(biddingTeamLogo || player?.team_logo) && !isUnsold && (
                            <img
                                src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${biddingTeamLogo || player.team_logo}?tr=w-64,h-64`}
                                alt="Team"
                                className="w-12 h-12 object-contain rounded-full bg-white/20 ring-2 ring-white/70 ml-3"
                            />
                        )}
                    </div>
                </div>

                {/* 🔻 SOLD PLAYERS MARQUEE (below the ribbon) */}
                {Array.isArray(soldMarqueeItems) && soldMarqueeItems.length > 0 && (
                    <div className="w-full mt-2">
                        <marquee
                            behavior="scroll"
                            direction="left"
                            scrollamount="6"
                            className="block w-full bg-black/40 text-white py-2 rounded-xl"
                        >
                            {soldMarqueeItems.map((it, idx) => (
                                <span key={idx} className="mx-8 text-base md:text-lg tracking-wide">
                                    {it.name} — {it.team}
                                </span>
                            ))}
                        </marquee>
                    </div>
                )}






            </div>
        </div>
    );
};

export default PlayerCard3;
