import React, { useEffect, useRef, useState } from "react";
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

    // Constant-speed ticker: measure content width and set duration
    const tickerTrackRef = useRef(null);
    const [tickerDurationSec, setTickerDurationSec] = useState(null);
    useEffect(() => {
        const PIXELS_PER_SECOND = 60; // target speed
        const recalc = () => {
            requestAnimationFrame(() => {
                const el = tickerTrackRef.current;
                if (!el) return;
                // track contains duplicated items; half is one full cycle width
                const total = el.scrollWidth;
                const cycle = total / 2;
                if (!cycle || !Number.isFinite(cycle)) return;
                const seconds = Math.max(5, cycle / PIXELS_PER_SECOND);
                setTickerDurationSec(seconds);
            });
        };
        recalc();
        const onResize = () => recalc();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [soldMarqueeItems]);

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
                    <div className="relative w-[28%] text-white px-6 flex flex-col justify-center rounded-l-xl bg-gradient-to-r from-pink-300 to-pink-500 text-black">
                        <div
                            className="absolute -left-6 top-0 h-full w-6"
                            style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)", background: "linear-gradient(to right, #9f1239, #be123c)" }}
                        />
                        <p className="uppercase text-xs tracking-widest opacity-90">Base Price</p>
                        <p className="text-3xl font-extrabold leading-none">{formatINR(basePrice)}</p>
                    </div>

                    {/* CENTER — Player Name + optional tagline */}
                    {/* CENTER — Player Name with logos inside the ribbon */}
                    <div className="flex-1 relative text-white bg-gradient-to-r bg-gradient-to-r from-gray-900 to-gray-700">
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
                            ? "bg-gradient-to-r from-pink-700 to-pink-500"
                            : isSold
                                ? "bg-gradient-to-r from-yellow-500 to-yellow-400 text-black"
                                : Number(currentBid) > 0
                                    ? "bg-gradient-to-r from-sky-700 to-sky-500"
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

                <div className="w-full text-center bg-gradient-to-r from-rose-700 to-rose-500 text-white text-sm tracking-widest py-1 rounded-t-xl">
  Digitalize your auction experience with E-AUCTION ARENA. +91-9547652702
</div>

                {/* 🔻 SOLD / UNSOLD MARQUEE (below the ribbon) */}
                {Array.isArray(soldMarqueeItems) && soldMarqueeItems.length > 0 && (
  <div className="w-full mt-3 relative">
    {/* edge fades */}
    <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/60 to-transparent rounded-bl-xl"></div>
    <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black/60 to-transparent rounded-br-xl"></div>

    <div className="overflow-hidden bg-black/40 text-white py-2 rounded-xl border border-white/10">
      <div
        ref={tickerTrackRef}
        className="ticker-track whitespace-nowrap will-change-transform animate-ticker flex items-center"
        style={tickerDurationSec ? { animationDuration: `${tickerDurationSec}s` } : undefined}
      >
        {soldMarqueeItems.map((it, idx) => {
          const isSold = it.status === "TRUE";
          return (
            <span
              key={it.id ?? idx}
              className={`inline-flex items-center gap-2 px-8 text-sm md:text-base tracking-wide ${
                idx > 0 ? "border-l border-white/20" : ""
              }`}
            >
              {/* highlight chip for latest */}
              {it.isLatest && (
                <span className="px-2 py-0.5 rounded bg-yellow-300 text-black text-[11px] font-extrabold uppercase animate-pulse">
                  Latest
                </span>
              )}

              {/* serial & name */}
              <span className="font-semibold">
                #{it.serial ?? "-"} {it.name ?? "-"}
              </span>

              {/* status pill */}
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider ${
                  isSold ? "bg-emerald-500 text-black" : "bg-rose-500 text-black"
                }`}
              >
                {isSold ? "SOLD" : "UNSOLD"}
              </span>

              {/* details */}
              {isSold && (
                <span className="opacity-90">
                  to <span className="font-semibold">{it.team ?? "-"}</span>{" "}
                  ({formatINR(it.sold_price || 0)})
                </span>
              )}
            </span>
          );
        })}

        {/* duplicate for seamless loop */}
        {soldMarqueeItems.map((it, idx) => {
          const isSold = it.status === "TRUE";
          return (
            <span
              key={"dup-" + (it.id ?? idx)}
              className={`inline-flex items-center gap-2 px-8 text-sm md:text-base tracking-wide ${
                idx > 0 ? "border-l border-white/20" : ""
              }`}
            >
              {it.isLatest && (
                <span className="px-2 py-0.5 rounded bg-yellow-300 text-black text-[11px] font-extrabold uppercase animate-pulse">
                  Latest
                </span>
              )}

              <span className="font-semibold">
                #{it.serial ?? "-"} {it.name ?? "-"}
              </span>

              <span
                className={`px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wider ${
                  isSold ? "bg-emerald-500 text-black" : "bg-rose-500 text-black"
                }`}
              >
                {isSold ? "SOLD" : "UNSOLD"}
              </span>

              {isSold && (
                <span className="opacity-90">
                  to <span className="font-semibold">{it.team ?? "-"}</span>{" "}
                  ({formatINR(it.sold_price || 0)})
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  </div>
)}











            </div>
        </div>
    );
};

export default PlayerCard3;
