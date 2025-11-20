import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import CONFIG from "../components/config";
import { slugsMatch } from "../utils/slugUtils";
import Navbar from "./Navbar";

const API = CONFIG.API_BASE_URL;

const formatLakhs = (value) => {
    const amount = Number(value) || 0;
    if (amount === 0) return "0";
    if (Math.abs(amount) < 1000) return amount.toString();
    if (Math.abs(amount) >= 100000) {
        const lakhs = amount / 100000;
        const formatted = (Number.isInteger(lakhs) ? lakhs.toFixed(0) : lakhs.toFixed(2)).replace(/\.0$/, "");
        return `${formatted} ${parseFloat(formatted) === 1 ? "lakh" : "lakhs"}`;
    }
    const thousands = amount / 1000;
    const formatted = (Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)).replace(/\.0$/, "");
    return `${formatted}k`;
};

const getPlayerImageUrl = (image, size = 480) => {
    if (!image) return "/no-image-found.png";
    const src = String(image);
    if (src.startsWith("http")) return src;
    return `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${src}?tr=w-${size},h-${size},fo-face,z-0.4,q-95,e-sharpen`;
};

const getTeamLogoUrl = (logo, size = 160) => {
    if (!logo) return "/AuctionArena2.png";
    return `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${logo}?tr=w-${size},h-${size},q-95,e-sharpen`;
};

const normalizeName = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const SpectatorLiveDisplay6 = () => {
    const { tournamentSlug } = useParams();
    const [player, setPlayer] = useState(null);
    const [highestBid, setHighestBid] = useState(0);
    const [leadingTeam, setLeadingTeam] = useState("");
    const [teamSummaries, setTeamSummaries] = useState([]);
    const [tournamentId, setTournamentId] = useState(null);
    const [tournamentName, setTournamentName] = useState("Auction Arena");
    const [tournamentLogo, setTournamentLogo] = useState("");
    const [liveBidTeams, setLiveBidTeams] = useState([]);
    const [playerList, setPlayerList] = useState([]);
    const socketRef = useRef(null);
    const lastPlayerIdRef = useRef(null);

    const fetchTournament = useCallback(async () => {
        if (!tournamentSlug) return;
        try {
            const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
            const data = await res.json();
            if (res.ok && data) {
                setTournamentId(data.id || null);
                setTournamentName(data.title || "Auction Arena");
                if (data.logo) {
                    setTournamentLogo(`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${data.logo}?tr=w-240,q-95,e-sharpen`);
                } else {
                    setTournamentLogo("");
                }
            }
        } catch (err) {
            console.error("Failed to fetch tournament info", err);
        }
    }, [tournamentSlug]);

    const fetchTeams = useCallback(async () => {
        if (!tournamentId) return;
        try {
            const res = await fetch(`${API}/api/teams?tournament_id=${tournamentId}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setTeamSummaries(data);
            }
        } catch (err) {
            console.error("Failed to fetch teams", err);
        }
    }, [tournamentId]);

    const fetchPlayerList = useCallback(async () => {
        if (!tournamentId) return;
        try {
            const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setPlayerList(data);
            }
        } catch (err) {
            console.error("Failed to fetch players for purse calc", err);
        }
    }, [tournamentId]);

    const resetBidTeams = useCallback(() => {
        setLiveBidTeams([]);
    }, []);

    const seedBidTeams = useCallback((rawTeams = []) => {
        if (!Array.isArray(rawTeams)) {
            resetBidTeams();
            return;
        }
        const seeds = rawTeams
            .map((team) => ({
                teamId: team.team_id != null ? Number(team.team_id) : null,
                teamName: team.team_name || "",
                bidAmount: Number(team.bid_amount) || 0,
                updatedAt: Date.now(),
            }))
            .filter((item) => item.teamId !== null || item.teamName);
        setLiveBidTeams(seeds.slice(0, 4));
    }, [resetBidTeams]);

    const fetchCurrentPlayer = useCallback(async () => {
        if (!tournamentSlug) return;
        try {
            const res = await fetch(`${API}/api/current-player?slug=${tournamentSlug}`);
            const text = await res.text();
            if (!text || text.trim().length === 0) {
                setPlayer(null);
                setHighestBid(0);
                setLeadingTeam("");
                resetBidTeams();
                return;
            }
            const current = JSON.parse(text);
            if (!current?.id) {
                setPlayer(null);
                setHighestBid(0);
                setLeadingTeam("");
                resetBidTeams();
                return;
            }

            const fullRes = await fetch(`${API}/api/players/${current.id}`);
            const fullPlayer = await fullRes.json();
            setPlayer(fullPlayer);
            lastPlayerIdRef.current = current.id;

            if (current.latest_bid_amount != null) {
                setHighestBid(Number(current.latest_bid_amount) || 0);
            } else if (fullPlayer?.sold_price) {
                setHighestBid(Number(fullPlayer.sold_price) || 0);
            } else {
                setHighestBid(0);
            }
            if (current.leading_team_name || fullPlayer?.team_name) {
                setLeadingTeam(current.leading_team_name || fullPlayer.team_name || "");
            } else if (fullPlayer?.team_data?.name) {
                setLeadingTeam(fullPlayer.team_data.name);
            } else {
                setLeadingTeam("");
            }

            if (Array.isArray(current.live_bid_teams)) {
                seedBidTeams(current.live_bid_teams);
            } else if (Array.isArray(fullPlayer?.live_bid_teams)) {
                seedBidTeams(fullPlayer.live_bid_teams);
            } else {
                resetBidTeams();
            }
        } catch (err) {
            console.error("Failed to fetch current player", err);
        }
    }, [tournamentSlug, resetBidTeams, seedBidTeams]);

    useEffect(() => {
        fetchTournament();
    }, [fetchTournament]);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    useEffect(() => {
        fetchPlayerList();
    }, [fetchPlayerList]);

    useEffect(() => {
        fetchCurrentPlayer();
    }, [fetchCurrentPlayer]);

    const matchesTournament = useCallback((payload) => {
        if (!payload) return false;
        if (payload.tournament_id != null && tournamentId != null) {
            return Number(payload.tournament_id) === Number(tournamentId);
        }
        const slugFromPayload = payload.slug || payload.tournament_slug;
        if (slugFromPayload) {
            return slugsMatch(slugFromPayload, tournamentSlug);
        }
        return true;
    }, [tournamentId, tournamentSlug]);

    const registerBidTeam = useCallback(({ team_id, teamId, team_name, teamName, bid_amount, bidAmount }) => {
        const id = team_id != null ? Number(team_id) : teamId != null ? Number(teamId) : null;
        const name = team_name || teamName || "";
        const bidValue = bid_amount != null ? Number(bid_amount) : bidAmount != null ? Number(bidAmount) : null;
        if (!name && id == null) return;
        setLiveBidTeams((prev) => {
            const now = Date.now();
            const cloned = [...prev];
            const index = cloned.findIndex((item) => {
                if (id != null && item.teamId != null) {
                    return Number(item.teamId) === id;
                }
                return normalizeName(item.teamName) === normalizeName(name);
            });
            const payload = {
                teamId: id != null ? id : index >= 0 ? cloned[index].teamId : null,
                teamName: name || (index >= 0 ? cloned[index].teamName : ""),
                bidAmount: bidValue != null ? bidValue : index >= 0 ? cloned[index].bidAmount : 0,
                updatedAt: now,
            };
            if (index >= 0) {
                cloned[index] = payload;
                return cloned.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
            }
            return [payload, ...cloned].slice(0, 4);
        });
    }, []);

    useEffect(() => {
        if (!tournamentId) return;
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        const socket = io(API, { transports: ["websocket"] });
        socketRef.current = socket;

        const handleBidUpdated = (payload = {}) => {
            if (!matchesTournament(payload)) return;
            if (payload.bid_amount != null) {
                setHighestBid(Number(payload.bid_amount) || 0);
            }
            if (payload.team_name) {
                setLeadingTeam(payload.team_name);
            }
            registerBidTeam(payload);
        };

        const handleRefreshPlayer = (payload = {}) => {
            if (!matchesTournament(payload)) return;
            fetchCurrentPlayer();
            fetchTeams();
            fetchPlayerList();
        };

        socket.on("bidUpdated", handleBidUpdated);
        socket.on("playerChanged", handleRefreshPlayer);
        socket.on("saleCommitted", handleRefreshPlayer);
        socket.on("playerUnsold", handleRefreshPlayer);

        return () => {
            socket.off("bidUpdated", handleBidUpdated);
            socket.off("playerChanged", handleRefreshPlayer);
            socket.off("saleCommitted", handleRefreshPlayer);
            socket.off("playerUnsold", handleRefreshPlayer);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [tournamentId, fetchCurrentPlayer, fetchTeams, fetchPlayerList, matchesTournament, registerBidTeam]);

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    const teamMapById = useMemo(() => {
        const map = new Map();
        teamSummaries.forEach((team) => {
            const id = Number(team.id);
            if (!Number.isNaN(id)) {
                map.set(id, team);
            }
        });
        return map;
    }, [teamSummaries]);

    const teamMapByName = useMemo(() => {
        const map = new Map();
        teamSummaries.forEach((team) => {
            const key = normalizeName(team.name || team.display_name);
            if (key) {
                map.set(key, team);
            }
        });
        return map;
    }, [teamSummaries]);

    const spendByTeamMap = useMemo(() => {
        const map = new Map();
        if (!Array.isArray(playerList)) return map;
        playerList.forEach((playerItem) => {
            if (
                playerItem &&
                ["TRUE", "true", true].includes(playerItem.sold_status) &&
                playerItem.team_id != null
            ) {
                const id = Number(playerItem.team_id);
                if (!Number.isNaN(id)) {
                    const price = Number(playerItem.sold_price) || 0;
                    map.set(id, (map.get(id) || 0) + price);
                }
            }
        });
        return map;
    }, [playerList]);

    const resolveRemainingPurse = useCallback(
        (team, fallbackTeamId = null) => {
            const hasExplicitRemaining =
                team && team.remaining_purse !== undefined && team.remaining_purse !== null;
            if (hasExplicitRemaining) {
                const val = Number(team.remaining_purse);
                if (!Number.isNaN(val)) return Math.max(val, 0);
            }
            const teamId = team ? Number(team.id) : Number(fallbackTeamId);
            const spent = Number.isFinite(teamId) ? spendByTeamMap.get(teamId) || 0 : 0;
            if (team) {
                const budget = Number(team.budget) || 0;
                if (!Number.isNaN(budget) && budget > 0) {
                    return Math.max(budget - spent, 0);
                }
            }
            return Math.max(0 - spent, 0);
        },
        [spendByTeamMap]
    );

    const biddingDisplay = useMemo(() => {
        if (!Array.isArray(liveBidTeams) || liveBidTeams.length === 0) {
            if (!leadingTeam) return [];
            const fallback = Array.from(teamMapByName.values()).find((team) => normalizeName(team.name) === normalizeName(leadingTeam));
            if (!fallback) return [];
            return [
                {
                    key: fallback.id || fallback.name,
                    team: fallback,
                    teamName: fallback.name,
                    available: resolveRemainingPurse(fallback, fallback.id),
                    maxBid: Number(fallback.max_bid_allowed) || 0,
                    lastBid: highestBid,
                    updatedAt: Date.now(),
                },
            ];
        }
        return liveBidTeams.map((entry) => {
            const byId = entry.teamId != null ? teamMapById.get(Number(entry.teamId)) : null;
            const byName = !byId && entry.teamName ? teamMapByName.get(normalizeName(entry.teamName)) : null;
            const team = byId || byName || null;
            const available = resolveRemainingPurse(team, entry.teamId);
            const maxBid = team ? Number(team.max_bid_allowed) || 0 : 0;
            return {
                key: entry.teamId != null ? entry.teamId : entry.teamName,
                team,
                teamName: entry.teamName || team?.name || "Team",
                logo: team?.logo,
                available,
                maxBid,
                lastBid: entry.bidAmount || (entry.teamName === leadingTeam ? highestBid : 0),
                updatedAt: entry.updatedAt || Date.now(),
            };
        });
    }, [liveBidTeams, teamMapById, teamMapByName, highestBid, leadingTeam, resolveRemainingPurse]);

    const computeBasePrice = useCallback((playerData) => {
        if (!playerData) return 0;
        if (playerData.base_price && Number(playerData.base_price) > 0) {
            return Number(playerData.base_price);
        }
        const poolDefaults = { A: 1700, B: 3000, C: 5000 };
        const code = (playerData.base_category || "").toUpperCase();
        return poolDefaults[code] || 0;
    }, []);

    if (!player) {
        return (
            <div className="min-h-screen w-screen relative overflow-hidden text-white flex items-center justify-center px-6 text-center">
                <video
                    className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
                    src="/bg11.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                />
                <div className="absolute inset-0 bg-black/70 z-10" />
                <div className="relative z-20 w-full flex flex-col items-center gap-10">
                    <div className="w-full">
                        <Navbar />
                    </div>
                    <div>
                        <img src={tournamentLogo || "/AuctionArena2.png"} alt="Tournament Logo" className="w-24 h-24 object-contain mx-auto mb-4 opacity-80" />
                        <p className="text-lg tracking-wide text-white/70">Waiting for the auctioneer to load the next player...</p>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mt-2">{tournamentName}</p>
                    </div>
                </div>
            </div>
        );
    }

    const isSold = ["TRUE", "true", true].includes(player?.sold_status);
    const isUnsold = ["FALSE", "false", false].includes(player?.sold_status);
    const playerImage = getPlayerImageUrl(player.profile_image);
    const playerTags = [player.role, player.location, player.age_category].filter(Boolean);
    const basePrice = computeBasePrice(player);
    const saleValue = Number(player?.sold_price) || 0;
    const liveStatus = isSold
        ? { label: "Sold Amount", value: formatLakhs(saleValue), badge: "Sold", badgeClass: "bg-emerald-400/20 border-emerald-300/60 text-emerald-100" }
        : isUnsold
            ? { label: "Status", value: "Unsold", badge: "Unsold", badgeClass: "bg-rose-500/15 border-rose-400/50 text-rose-100" }
            : { label: "Highest Bid", value: formatLakhs(highestBid), badge: "Live", badgeClass: "bg-amber-400/20 border-amber-300/60 text-amber-100" };

    return (
        <div className="min-h-screen w-screen relative overflow-hidden text-white px-4 py-5 pb-24">
            <video
                className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
                src="/bg11.mp4"
                autoPlay
                muted
                loop
                playsInline
            />
            <div className="absolute inset-0 bg-black/70 z-0" />
            <div className="relative z-10 flex flex-col gap-4">
                <Navbar />
                <header className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 flex items-center gap-4 mt-10">
                    <img
                        src={tournamentLogo || "/AuctionArena2.png"}
                        alt={tournamentName}
                        className="w-14 h-14 rounded-2xl border border-white/20 object-contain bg-black/30"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">Live Auction</p>
                        <h1 className="text-lg font-semibold truncate">{tournamentName}</h1>
                        <p className="text-xs text-white/60">{tournamentSlug ? `/${tournamentSlug}` : "Special Event"}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full border ${liveStatus.badgeClass} text-xs font-semibold`}>
                        {liveStatus.badge}
                    </span>
                </header>

                <section className="rounded-3xl border border-white/10 bg-white/5 p-4 mb-4 shadow-xl">
                <div className="flex gap-4 items-start">
                    <img
                        src={playerImage}
                        alt={player.name}
                        className="w-32 h-32 rounded-2xl object-contain border border-white/10 shadow-lg bg-black/40 p-1"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.4em] text-white/50 mb-1">Player #{player.auction_serial || "-"}</p>
                        <h2 className="text-2xl font-extrabold leading-tight break-words">{player.name}</h2>
                        {playerTags.length > 0 && <p className="text-sm text-white/70 mt-1">{playerTags.join(" • ")}</p>}
                        <div className="flex flex-wrap gap-2 mt-3 text-xs">
                            <span className="px-3 py-1 rounded-full bg-black/40 border border-white/10 uppercase tracking-widest">{player.nickname || "-"}</span>
                            {player?.secret_bidding_enabled && (
                                <span className="px-3 py-1 rounded-full bg-purple-500/15 border border-purple-400/40 text-purple-100">Secret Bid</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5 text-center">
                    <div className="rounded-2xl bg-black/50 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Base Price</p>
                        <p className="text-2xl font-semibold">{formatLakhs(basePrice)}</p>
                    </div>
                    <div className="rounded-2xl bg-black/50 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{liveStatus.label}</p>
                        <p className="text-2xl font-semibold text-emerald-200">{liveStatus.value}</p>
                    </div>
                    <div
                        className={`rounded-2xl border px-3 py-3 col-span-2 ${
                            isSold
                                ? "bg-emerald-500/10 border-emerald-400/60"
                                : isUnsold
                                    ? "bg-rose-500/10 border-rose-400/60"
                                    : "bg-black/40 border-white/10"
                        }`}
                    >
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                            {isSold ? "Sold To" : isUnsold ? "Status" : "Leading Team"}
                        </p>
                        <p
                            className={`text-xl font-semibold ${
                                isSold
                                    ? "text-emerald-200"
                                    : isUnsold
                                        ? "text-rose-200"
                                        : "text-white"
                            }`}
                        >
                            {isSold
                                ? player.team_data?.name || player.team_name || leadingTeam || "Team"
                                : isUnsold
                                    ? "Unsold"
                                    : leadingTeam || "Awaiting bid"}
                        </p>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4 mb-4 relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">Player Details</p>
                        <h3 className="text-lg font-semibold">Vitals</h3>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-black/40 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Role</p>
                        <p className="text-base">{player.role || "N/A"}</p>
                    </div>
                    <div className="rounded-2xl bg-black/40 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">District</p>
                        <p className="text-base">{player.district || "NA"}</p>
                    </div>
                    <div className="rounded-2xl bg-black/40 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Batting</p>
                        <p className="text-base">{player.batting_hand || "-"}</p>
                    </div>
                    <div className="rounded-2xl bg-black/40 border border-white/10 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Bowling</p>
                        <p className="text-base">{player.bowling_hand || "-"}</p>
                    </div>
                </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-black/60 to-black/30 p-4 space-y-3 relative z-10">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">Active Bidders</p>
                        <h3 className="text-lg font-semibold">Live purse &amp; max bid</h3>
                    </div>
                    <span className="text-xs text-white/60">{biddingDisplay.length || 0} teams</span>
                </div>
                {biddingDisplay.length === 0 ? (
                    <p className="text-sm text-white/60">No teams have placed a bid yet. Waiting for the first paddle.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {(() => {
                            const latestTimestamp = Math.max(
                                ...biddingDisplay.map((entry) => Number(entry.updatedAt) || 0),
                                0
                            );
                            return biddingDisplay.map((entry) => {
                                const isLatest = Number(entry.updatedAt) === latestTimestamp;
                                return (
                                    <div
                                        key={entry.key || entry.teamName}
                                        className={`rounded-2xl border px-3 py-3 flex items-center gap-3 ${
                                            isLatest
                                                ? "border-amber-300/80 bg-amber-500/10 shadow-lg shadow-amber-500/20"
                                                : "border-white/10 bg-white/5"
                                        }`}
                                    >
                                        <img
                                            src={getTeamLogoUrl(entry.logo)}
                                            alt={entry.teamName}
                                            className="w-12 h-12 rounded-full object-contain border border-white/10 bg-black/30"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-semibold truncate">{entry.teamName}</p>
                                            <p className="text-[11px] text-white/60 mt-0.5">
                                                Last bid: {formatLakhs(entry.lastBid || 0)}
                                            </p>
                                        </div>
                                        <div className="text-right text-xs">
                                            <p className="text-white/60 uppercase tracking-[0.3em]">Purse</p>
                                            <p className="text-sm font-semibold">{formatLakhs(entry.available)}</p>
                                            <p className="text-white/60 uppercase tracking-[0.3em] mt-2">Max Bid</p>
                                            <p className="text-sm font-semibold">{formatLakhs(entry.maxBid)}</p>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
                </section>
            </div>
        </div>
    );
};

export default SpectatorLiveDisplay6;
