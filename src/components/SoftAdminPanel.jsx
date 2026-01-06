import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "../components/config";

const API = CONFIG.API_BASE_URL;

const SoftAdminPanel = () => {
    const { tournamentSlug } = useParams();
    const [tournamentId, setTournamentId] = useState(null);
    const [tournamentTitle, setTournamentTitle] = useState("Tournament");
    const [players, setPlayers] = useState([]);
    const [selectedSerial, setSelectedSerial] = useState("");
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const resolveProfileImage = (player, size = 400) => {
        if (!player) return "/no-image-found.png";
        if (player.profile_image) {
            return String(player.profile_image).startsWith("http")
                ? player.profile_image
                : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-${size},h-${size},fo-face,z-0.4,q-95,e-sharpen`;
        }
        if (player.image_url) return player.image_url;
        if (player.photo_url) return player.photo_url;
        return "/no-image-found.png";
    };

    useEffect(() => {
        document.title = "Auction Selector | Auction Arena";
    }, []);

    useEffect(() => {
        const fetchTournament = async () => {
            try {
                const res = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const data = await res.json();

                if (res.ok && data?.id) {
                    setTournamentId(data.id);
                    setTournamentTitle(data.title || "Tournament");
                } else {
                    setStatus("Unable to find tournament.");
                }
            } catch (err) {
                console.error("Failed to fetch tournament by slug", err);
                setStatus("Unable to load tournament details.");
            }
        };

        fetchTournament();
    }, [tournamentSlug]);

    useEffect(() => {
        if (!tournamentId) return;

        const fetchPlayers = async () => {
            try {
                const res = await fetch(`${API}/api/players?tournament_id=${tournamentId}&slug=${tournamentSlug}`);
                const data = await res.json();
                setPlayers(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error("Failed to load players", err);
                setStatus("Unable to load players for this tournament.");
            }
        };

        fetchPlayers();
    }, [tournamentId, tournamentSlug]);

    const serialOptions = useMemo(
        () =>
            players
                .map((p) => Number(p?.auction_serial))
                .filter((s) => Number.isFinite(s) && s > 0)
                .sort((a, b) => a - b),
        [players]
    );

    const findPlayerBySerial = (serial) =>
        players.find((p) => Number(p?.auction_serial) === Number(serial));

    const loadDetailedPlayer = async (basic) => {
        if (!basic?.id) return basic;
        try {
            const res = await fetch(`${API}/api/players/${basic.id}?slug=${tournamentSlug}`);
            if (!res.ok) return basic;
            return await res.json();
        } catch {
            return basic;
        }
    };

    const pushToSpectator = async () => {
        setStatus("");

        const serialNumber = Number(selectedSerial);
        if (!serialNumber) {
            setStatus("Pick an auction serial first.");
            return;
        }

        const basic = findPlayerBySerial(serialNumber);
        if (!basic) {
            setStatus("No player found for that serial.");
            return;
        }

        setLoading(true);
        try {
            const detailed = await loadDetailedPlayer(basic);
            const payload = { ...basic, ...detailed, tournament_id: tournamentId };

            await Promise.all([
                fetch(`${API}/api/current-player`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }),
                fetch(`${API}/api/current-bid`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bid_amount: 0,
                        team_name: "",
                        tournament_id: tournamentId,
                    }),
                }),
            ]);

            fetch(`${API}/api/notify-player-change`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    tournament_id: tournamentId,
                    tournament_slug: tournamentSlug,
                }),
                keepalive: true,
            });

            setCurrentPlayer({ ...basic, ...detailed });
            setStatus("Player sent to spectator display.");
        } catch (err) {
            console.error("Failed to push player to spectator", err);
            setStatus("Unable to send player to spectator right now.");
        } finally {
            setLoading(false);
        }
    };

    const handleClearSelection = () => {
        setSelectedSerial("");
        setCurrentPlayer(null);
    };

    const handleDownloadCard = () => {
        if (!currentPlayer) {
            setStatus("Select a player first.");
            return;
        }

        const imgSrc = resolveProfileImage(currentPlayer, 800);
        const printable = window.open("", "_blank");
        if (!printable) {
            setStatus("Please allow pop-ups to download the card.");
            return;
        }

        const fields = [
            ["Name", currentPlayer.name || "-"],
            ["Nickname", currentPlayer.nickname || "-"],
            ["Mobile", currentPlayer.mobile || "-"],
            ["Location", currentPlayer.location || "-"],
            ["Role", currentPlayer.role || "-"],
            ["Batting Hand", currentPlayer.batting_hand || "-"],
            ["Bowling Hand", currentPlayer.bowling_hand || "-"],
        ];

        const infoRows = fields.map(
            ([label, value]) => `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`
        ).join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Player Card</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      margin: 0;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #0b1f3b, #143d7a);
      color: #f5f7ff;
    }
    .page {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 24px;
      min-height: calc(100vh - 28mm);
      align-items: center;
    }
    .card {
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      overflow: hidden;
      position: relative;
    }
    .photo {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .photo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    }
    .chip {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 8px 14px;
      border-radius: 999px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .meta {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
    }
    .meta h1 {
      margin: 0;
      font-size: 32px;
      letter-spacing: 1px;
    }
    .meta .role {
      color: #f8c146;
      font-weight: 700;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .section-title {
      text-transform: uppercase;
      letter-spacing: 2px;
      font-size: 13px;
      color: #c4d2ff;
      margin: 18px 0 10px;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 14px;
    }
    .label {
      color: #c7d3ff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .value {
      color: #ffffff;
      font-weight: 600;
    }
    .footer {
      margin-top: 18px;
      text-align: right;
      font-size: 12px;
      letter-spacing: 1px;
      color: #d0e3ff;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card photo">
      <img src="${imgSrc}" alt="${currentPlayer.name || "Player"}" />
      <div class="chip">#${currentPlayer.auction_serial || "-"}</div>
    </div>
    <div class="meta">
      <h1>${currentPlayer.name || "Player"}</h1>
      <div class="role">${currentPlayer.role || "Role"}</div>
      <div class="section-title">Player Info</div>
      <div class="rows">
        ${infoRows}
      </div>
      <div class="footer">Built by E- Auction Arena</div>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); setTimeout(() => window.close(), 300); };</script>
</body>
</html>`;

        printable.document.open();
        printable.document.write(html);
        printable.document.close();
    };

    const handleDownloadAllCards = () => {
        if (!players.length) {
            setStatus("No players to export.");
            return;
        }

        const cardsHtml = players.map((p) => {
            const imgSrc = resolveProfileImage(p, 800);
            const fields = [
                ["Name", p.name || "-"],
                ["Nickname", p.nickname || "-"],
                ["Mobile", p.mobile || "-"],
                ["Location", p.location || "-"],
                ["Role", p.role || "-"],
                ["Batting Hand", p.batting_hand || "-"],
                ["Bowling Hand", p.bowling_hand || "-"],
            ];
            const infoRows = fields
                .map(([label, value]) => `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`)
                .join("");

            return `<div class="page">
    <div class="card photo">
      <img src="${imgSrc}" alt="${p.name || "Player"}" />
      <div class="chip">#${p.auction_serial || "-"}</div>
    </div>
    <div class="meta">
      <h1>${p.name || "Player"}</h1>
      <div class="role">${p.role || "Role"}</div>
      <div class="section-title">Player Info</div>
      <div class="rows">
        ${infoRows}
      </div>
      <div class="footer">Built by E- Auction Arena</div>
    </div>
  </div>`;
        }).join("");

        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>All Player Cards</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      margin: 0;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      background: #0b1f3b;
      color: #f5f7ff;
    }
    .page {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 24px;
      min-height: calc(100vh - 28mm);
      align-items: center;
      page-break-after: always;
      background: linear-gradient(135deg, #0b1f3b, #143d7a);
      padding: 10px;
    }
    .card {
      background: #ffffff;
      border-radius: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
      overflow: hidden;
      position: relative;
      height: 100%;
    }
    .photo {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .photo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 16px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    }
    .chip {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 8px 14px;
      border-radius: 999px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .meta {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
      height: 100%;
      box-sizing: border-box;
    }
    .meta h1 {
      margin: 0;
      font-size: 32px;
      letter-spacing: 1px;
    }
    .meta .role {
      color: #f8c146;
      font-weight: 700;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .section-title {
      text-transform: uppercase;
      letter-spacing: 2px;
      font-size: 13px;
      color: #c4d2ff;
      margin: 18px 0 10px;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 14px;
    }
    .label {
      color: #c7d3ff;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .value {
      color: #ffffff;
      font-weight: 600;
    }
    .footer {
      margin-top: 18px;
      text-align: right;
      font-size: 12px;
      letter-spacing: 1px;
      color: #d0e3ff;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  ${cardsHtml}
  <script>window.onload = function(){ window.print(); setTimeout(() => window.close(), 400); };</script>
</body>
</html>`;

        const printable = window.open("", "_blank");
        if (!printable) {
            setStatus("Please allow pop-ups to download the cards.");
            return;
        }
        printable.document.open();
        printable.document.write(html);
        printable.document.close();
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-6">
            <div className="w-full max-w-4xl space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm uppercase text-gray-400 tracking-widest">Soft Admin</p>
                        <h1 className="text-3xl font-bold">Select Auction Serial</h1>
                        <p className="text-gray-400">
                            Tournament: <span className="text-white">{tournamentTitle}</span>
                        </p>
                    </div>
                    <img
                        src="/AuctionArena2.png"
                        alt="Auction Arena"
                        className="w-16 h-16 object-contain animate-pulse"
                    />
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <p className="text-gray-300">
                        Pick a serial to broadcast that player on the spectator screen. All bidding and
                        purse controls stay disabled here.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <label className="flex flex-col gap-2">
                            <span className="text-sm uppercase tracking-widest text-gray-400">
                                Auction Serial
                            </span>
                            <select
                                className="p-3 rounded-lg bg-gray-800 border border-gray-700 text-white"
                                value={selectedSerial}
                                onChange={(e) => setSelectedSerial(e.target.value)}
                                disabled={loading || !serialOptions.length}
                            >
                                <option value="">Select serial</option>
                                {serialOptions.map((serial) => {
                                    const p = findPlayerBySerial(serial);
                                    return (
                                        <option key={serial} value={serial}>
                                            #{serial} {p?.name ? `- ${p.name}` : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <button
                            type="button"
                            onClick={pushToSpectator}
                            disabled={loading || !selectedSerial}
                            className="md:col-span-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-lg shadow-lg transition"
                        >
                            {loading ? "Sending..." : "Show on Spectator"}
                        </button>
                    </div>

                    {status && (
                        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                            {status}
                        </div>
                    )}
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold">Current Selection</h2>
                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={handleDownloadCard}
                                disabled={!currentPlayer}
                                className="text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md shadow"
                            >
                                Download Player Card (PDF)
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadAllCards}
                                disabled={!players.length}
                                className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md shadow"
                            >
                                Download All Cards (PDF)
                            </button>
                            <button
                                type="button"
                                onClick={handleClearSelection}
                                className="text-sm text-gray-300 hover:text-white underline"
                            >
                                Clear selection
                            </button>
                        </div>
                    </div>

                    {currentPlayer ? (
                        <div className="flex items-center gap-4">
                            <img
                                src={
                                    currentPlayer.profile_image
                                        ? (String(currentPlayer.profile_image).startsWith("http")
                                            ? currentPlayer.profile_image
                                            : `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${currentPlayer.profile_image}?tr=w-160,h-160,fo-face,z-0.4,q-95,e-sharpen`)
                                        : "/no-image-found.png"
                                }
                                alt={currentPlayer.name}
                                className="w-32 h-32 rounded-xl object-cover border border-gray-700"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = "/no-image-found.png";
                                }}
                            />
                            <div className="space-y-1">
                                <p className="text-sm text-gray-400 uppercase tracking-widest">
                                    Serial #{currentPlayer.auction_serial}
                                </p>
                                <p className="text-2xl font-bold">{currentPlayer.name}</p>
                                <p className="text-gray-300">{currentPlayer.role}</p>
                                <p className="text-gray-400">
                                    Base Price:{" "}
                                    <span className="text-white">
                                        {currentPlayer.base_price ? `Rs ${currentPlayer.base_price}` : "-"}
                                    </span>
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-400">Nothing selected yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SoftAdminPanel;
