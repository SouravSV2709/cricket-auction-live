import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import ReactDOM from "react-dom/client";
import CONFIG from "../components/config";
import Navbar from "../components/Navbar";
import { FixedSizeGrid as Grid } from "react-window";
import { Listbox } from "@headlessui/react";
// import BackgroundEffect from "../components/BackgroundEffect";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/20/solid";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getPlayerProfileCardExporter } from "../utils/playerprofilecard";


const API = CONFIG.API_BASE_URL;


const AllPlayerCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const [filterQuery, setFilterQuery] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");
    const [filterLocation, setFilterLocation] = useState("");
    const [filtersoldstatus, setFiltersoldstatus] = useState("notauctioned");
    const [filterCategory, setFilterCategory] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [isZipDownloading, setIsZipDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
    const [zipProgress, setZipProgress] = useState({
        phase: "render",
        current: 0,
        total: 0,
        percent: 0,
    });
    const [showToast, setShowToast] = useState(false);
    const hoverTimeoutRef = useRef(null);
    const [openImage, setOpenImage] = useState(null);
    const [openDetails, setOpenDetails] = useState(null);
    const [teams, setTeams] = useState([]);

    const CARD_ROW_HEIGHT =
        windowWidth < 640 ? 420 :   // more space for mobile
            windowWidth < 768 ? 380 :
                340;


    // Brand gradient background (EAARENA)
    const EA_BG_STYLE = {
        backgroundImage: `
    radial-gradient(1100px 600px at 0% 0%, rgba(250, 204, 21, .15), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(168, 85, 247, .16), transparent 60%),
    linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
  `
    };


    const pdfRef = useRef();
    const fetchPlayersRef = useRef(false);

    const normalizedQuery = filterQuery.trim().toLowerCase();

    const filteredPlayers = players.filter((player) => {
        const matchesQuery =
            !normalizedQuery ||
            (player.name || "").toLowerCase().includes(normalizedQuery) ||
            (player.nickname || "").toLowerCase().includes(normalizedQuery) ||
            (player.auction_serial || "").toString().includes(normalizedQuery);

        return (
            matchesQuery &&
            (player.role || "").toLowerCase().includes(filterRole.toLowerCase()) &&
            (player.district || "").toLowerCase().includes(filterDistrict.toLowerCase()) &&
            (player.location || "").toLowerCase().includes(filterLocation.toLowerCase()) &&
            (
                filtersoldstatus === "" ||
                (filtersoldstatus === "true" && player.sold_status === true) ||
                (filtersoldstatus === "false" && player.sold_status === false) ||
                (filtersoldstatus === "notauctioned" && (player.sold_status === null || player.sold_status === undefined))
            ) &&
            (
                // Filter by Age Category when selected
                filterCategory === "" || (player.age_category || "") === filterCategory
            )
        );
    });




    const serialMap = React.useMemo(() => {
        const map = {};
        players.forEach((p, i) => {
            map[p.id] = i + 1;
        });
        return map;
    }, [players]);

    // inside the component, after serialMap is defined
    // inside the component, after serialMap is defined
    const exporter = useMemo(
        () =>
            getPlayerProfileCardExporter({
                serialResolver: (p) => p?.auction_serial ?? serialMap[p.id],
                tournamentName,
                tournamentLogo,
                background: "/goldbg.jpg", // or '/redbg.jpg'
            }),
        [serialMap, tournamentName, tournamentLogo]
    );

    // Use filtered list when present, otherwise all players
    const handleDownloadProfileCard = (player) => exporter.downloadOne(player);
    const handleDownloadAllProfileCards = async () => {
        const playersToDownload = filteredPlayers.length ? filteredPlayers : players;
        if (!playersToDownload.length) return;
        setIsZipDownloading(true);
        setZipProgress({
            phase: "render",
            current: 0,
            total: playersToDownload.length,
            percent: 0,
        });
        try {
            await exporter.downloadAll(playersToDownload, {
                onProgress: (next) =>
                    setZipProgress((prev) => ({
                        ...prev,
                        ...next,
                    })),
            });
        } finally {
            setIsZipDownloading(false);
            setZipProgress({
                phase: "render",
                current: 0,
                total: 0,
                percent: 0,
            });
        }
    };



    const cardsPerPage = 12;

    const getPageSubtitle = (pageIndex, playersOnPage, serialMap) => {
        const filters = [];

        if (filterRole) filters.push(`Role: ${filterRole}`);
        if (filterDistrict) filters.push(`District: ${filterDistrict}`);
        if (filterLocation) filters.push(`Location: ${filterLocation}`);
        if (filterQuery) filters.push(`Search: ${filterQuery}`);
        if (filterCategory) filters.push(`Category: ${filterCategory}`);
        if (filtersoldstatus) filters.push(`Sold Status: ${filtersoldstatus}`);

        if (filters.length > 0) {
            return `Page ${pageIndex + 1} [Filtered - ${filters.join(" | ")}]`;
        } else {
            const serials = playersOnPage.map(p => serialMap[p.id]);
            const minSerial = Math.min(...serials);
            const maxSerial = Math.max(...serials);
            return `Page ${pageIndex + 1} [Showing Serial No ${minSerial}-${maxSerial}]`;
        }
    };

    const [disableHover, setDisableHover] = useState(false);

    const downloadAllCardsAsPDF = async () => {

        setDisableHover(true);
        setSelectedPlayerId(null);
        setIsDownloading(true);
        setDownloadProgress({ current: 1, total: 0 });

        const playersToRender = filteredPlayers.length ? filteredPlayers : players;
        // const cardsPerPage = 12;
        const pages = Math.ceil(playersToRender.length / cardsPerPage);
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        console.log(`Preparing ${playersToRender.length} players in ${pages} page(s)...`);

        for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
            setDownloadProgress({ current: pageIndex + 1, total: pages });
            const startIdx = pageIndex * cardsPerPage;
            const endIdx = Math.min((pageIndex + 1) * cardsPerPage, playersToRender.length);
            const pagePlayers = playersToRender.slice(startIdx, endIdx);
            const serialStart = playersToRender[startIdx]?.id || startIdx + 1;
            const serialEnd = playersToRender[endIdx - 1]?.id || endIdx;

            const container = document.createElement("div");
            container.style.width = "1000px";
            container.style.minHeight = "1400px";
            container.style.padding = "40px 40px 80px";
            container.style.background = `
            radial-gradient(1200px 700px at 0% 0%, rgba(250, 204, 21, 0.12), transparent 60%),
            radial-gradient(900px 500px at 100% 0%, rgba(168, 85, 247, 0.12), transparent 60%),
            linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
            `;
            container.style.border = "3px solid rgba(250, 204, 21, 0.5)";
            container.style.borderRadius = "18px";
            container.style.boxShadow = "0 12px 50px rgba(0,0,0,.45)";
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.alignItems = "center";
            container.style.gap = "30px";
            container.style.position = "fixed";
            container.style.top = "0";
            container.style.left = "0";
            container.style.zIndex = "9999";
            container.style.opacity = "1";



            // HEADER
            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.alignItems = "center";
            header.style.justifyContent = "center";
            header.style.gap = "20px";
            header.style.flexWrap = "wrap";
            header.style.textAlign = "center";

            const logo = document.createElement("img");
            logo.src = `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-60,h-60`;
            logo.style.width = "60px";
            logo.style.height = "60px";
            logo.style.objectFit = "contain";

            const title = document.createElement("div");
            title.innerHTML = `
            <div style="font-size: 26px; font-weight: 800; color:#FDE68A; text-shadow:0 2px 6px rgba(0,0,0,.6)">
                ${tournamentName}
            </div>
            <div style="font-size: 14px; margin-top: 5px; color:#D8B4FE;">
                ${getPageSubtitle(pageIndex, pagePlayers, serialMap)}
            </div>
            `;


            header.appendChild(logo);
            header.appendChild(title);
            container.appendChild(header);

            // --- EA ARENA watermark background ---
            const wm = document.createElement("img");
            wm.src = "/AuctionArena2.png"; // or full ImageKit URL
            wm.alt = "EA ARENA";
            Object.assign(wm.style, {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) rotate(-10deg)",
                width: "70%",
                maxWidth: "720px",
                opacity: "0.06",
                pointerEvents: "none",
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
                zIndex: "0",
            });
            container.style.position = "relative";
            container.appendChild(wm);

            // --- Small corner logos ---
            ["left", "right"].forEach((side) => {
                const cornerLogo = document.createElement("img");
                cornerLogo.src = "/AuctionArena2.png";
                cornerLogo.alt = "EA ARENA";
                Object.assign(cornerLogo.style, {
                    position: "absolute",
                    top: "10px",
                    [side]: "10px",
                    width: "40px",
                    height: "40px",
                    objectFit: "contain",
                    opacity: "0.85", // visible but not overpowering
                    zIndex: "2",
                });
                container.appendChild(cornerLogo);
            });

            // --- CARD GRID ---
            const cardGrid = document.createElement("div");
            cardGrid.style.position = "relative";
            cardGrid.style.zIndex = "1"; // cards above watermark, below corner logos
            cardGrid.style.display = "flex";
            cardGrid.style.flexWrap = "wrap";
            cardGrid.style.justifyContent = "center";
            cardGrid.style.gap = "20px";
            container.appendChild(cardGrid);



            pagePlayers.forEach((player) => {
                const src = document.querySelector(`#player-card-${player.id}`);
                if (!src) return;

                const clone = src.cloneNode(true);
                clone.style.width = "240px";
                clone.style.height = "320px";

                // Remove hover/opacity classes
                clone.classList.remove("opacity-80", "scale-95", "scale-105", "z-10");
                clone.style.opacity = "1";
                clone.style.transform = "none";

                // Remove "View full" buttons/links
                clone.querySelectorAll("button, a").forEach((el) => el.remove());

                // Remove Nickname field
                const removeNickname = () => {
                    const nodes = clone.querySelectorAll("*");
                    nodes.forEach((el) => {
                        const txt = (el.textContent || "").trim().toLowerCase();
                        if (txt === "nickname") {
                            const field = el.closest("div");
                            if (field) field.remove();
                        }
                        if (player.nickname && txt === player.nickname.toLowerCase()) {
                            const field = el.closest("div");
                            if (field) field.remove();
                        }
                    });
                };
                removeNickname();

                // Remove the label "Role" (keep only value)
                clone.querySelectorAll("div, span, strong, small, label").forEach((el) => {
                    const txt = (el.textContent || "").trim().toLowerCase();
                    if (txt === "role") {
                        const field = el.closest("div");
                        if (field) {
                            // Keep the value sibling, remove the label
                            el.remove();
                        }
                    }
                });

                // Style text
                clone.querySelectorAll("*").forEach((el) => {
                    el.style.color = "#FFFFFF";
                    el.style.textShadow = "0 1px 2px rgba(0,0,0,0.5)";
                });

                // Optimize field layout: single column
                clone.querySelectorAll("div").forEach((div) => {
                    if (div.classList.contains("grid")) {
                        div.classList.remove("grid-cols-2");
                        div.classList.add("grid-cols-1");
                    }
                });

                // Compact field styling: remove extra wrappers & padding
                clone.querySelectorAll("div").forEach((div) => {
                    const txt = (div.textContent || "").trim();
                    if (txt.length > 1) {
                        // keep only value text, no big box
                        div.style.background = "transparent";
                        div.style.padding = "0";       // remove unnecessary space
                        div.style.margin = "0";        // reset margin
                        div.style.borderRadius = "0";
                        div.style.whiteSpace = "normal";
                        div.style.wordBreak = "break-word";
                        div.style.overflow = "visible";
                    }
                });


                // Brighten player images
                clone.querySelectorAll("img").forEach((img) => {
                    if (img.getAttribute("src") === "/AuctionArena2.png") {
                        img.style.display = "none";
                    } else {
                        img.style.filter = "brightness(1.1) contrast(1.15)";
                    }
                });

                cardGrid.appendChild(clone);


            });




            // FOOTER
            const footer = document.createElement("div");
            footer.style.marginTop = "30px";
            footer.style.textAlign = "center";
            footer.style.fontSize = "16px";
            footer.style.color = "#FDE68A";
            footer.style.borderTop = "2px solid #A855F7";
            footer.style.textShadow = "0 1px 3px rgba(0,0,0,.6)";
            footer.style.paddingTop = "10px";
            footer.style.width = "100%";
            footer.innerText = "All rights reserved | Powered by Auction Arena | +91-9547652702";
            container.appendChild(footer);

            document.body.appendChild(container);

            // Proper way to hide from user but allow html2canvas to capture
            container.style.position = "absolute";
            container.style.top = "0";
            container.style.left = "-100000px";
            container.style.opacity = "1";
            container.style.zIndex = "-1";


            await new Promise((r) => requestAnimationFrame(r));

            const images = container.querySelectorAll("img");
            await Promise.all(
                Array.from(images).map((img) => {
                    return new Promise((resolve) => {
                        const fallback = "/no-image-found.png";
                        if (img.complete && img.naturalWidth !== 0) return resolve();
                        const timeout = setTimeout(() => {
                            img.src = fallback;
                            resolve();
                        }, 3000);
                        img.onload = () => {
                            clearTimeout(timeout);
                            resolve();
                        };
                        img.onerror = () => {
                            clearTimeout(timeout);
                            img.src = fallback;
                            resolve();
                        };
                    });
                })
            );

            container.style.display = "block";
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#fff",
            });

            const imgData = canvas.toDataURL("image/jpeg", 1.0);
            if (pageIndex > 0) pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);

            container.style.display = "none";

            document.body.removeChild(container);
            console.log(`Page ${pageIndex + 1} captured`);
        }

        setDownloadProgress({ current: pages, total: pages });

        pdf.save("AllPlayerCards-Final.pdf");
        console.log("PDF download completed.");
        setIsDownloading(false);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000); // Hide after 3 seconds
        setDisableHover(false);

    };



    useEffect(() => {
        return () => {
            clearTimeout(hoverTimeoutRef.current);
        };
    }, []);


    useEffect(() => {
        document.title = "Players | Auction Arena";
    }, []);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {

        if (fetchPlayersRef.current) return; // Skip repeated calls
        fetchPlayersRef.current = true;

        const fetchPlayers = async () => {
            try {
                const tournamentRes = await fetch(`${API}/api/tournaments/slug/${tournamentSlug}`);
                const tournamentData = await tournamentRes.json();

                if (!tournamentRes.ok || !tournamentData.id) {
                    setErrorMessage("Tournament not found. Please check the URL.");
                    return;
                }

                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
                const tournamentId = tournamentData.id;

                const [playerRes, teamRes] = await Promise.all([
                    fetch(`${API}/api/players?tournament_id=${tournamentId}`),
                    fetch(`${API}/api/teams?tournament_id=${tournamentId}`)
                ]);
                const playerData = await playerRes.json();
                const teamData = await teamRes.json();
                const filteredPlayers = playerData.filter(
                    (p) => p.payment_success === true && p.deleted_at == null
                );
                setPlayers(filteredPlayers);
                setTeams(Array.isArray(teamData) ? teamData : []);
            } catch (err) {
                console.error("Error loading players:", err);
            }
        };
        fetchPlayers();
    }, [tournamentSlug]);

    const getColumnCount = () => {
        if (windowWidth < 640) return 2;
        if (windowWidth < 768) return 3;
        if (windowWidth < 1024) return 4;
        if (windowWidth < 1280) return 5;
        return 7;
    };

    const uniqueRoles = [...new Set(players.map((p) => p.role).filter(Boolean))];
    const uniqueDistricts = [...new Set(players.map((p) => p.district).filter(Boolean))];
    const uniqueLocations = [
        ...new Set(
            players
                .map((p) => p.location)
                .filter((v) => v !== undefined && v !== null && String(v).toLowerCase() !== "null" && String(v).trim() !== "")
        ),
    ];
    const hasAnyDistrict = players.some((p) => !!p.district);
    const hasAnyLocation = players.some(
        (p) => p.location && String(p.location).toLowerCase() !== "null" && String(p.location).trim() !== ""
    );
    const uniqueAgeCategories = [
        ...new Set(
            players
                .map((p) => p.age_category)
                .filter((v) => v !== undefined && v !== null && String(v).toLowerCase() !== "null" && String(v).trim() !== "")
        ),
    ];
    const hasAnyAgeCategory = players.some(
        (p) => p.age_category && String(p.age_category).toLowerCase() !== "null" && String(p.age_category).trim() !== ""
    );
    const teamById = useMemo(() => {
        const map = {};
        teams.forEach((team) => {
            if (team?.id !== undefined && team?.id !== null) {
                map[team.id] = team;
            }
        });
        return map;
    }, [teams]);
    const teamByName = useMemo(() => {
        const map = {};
        teams.forEach((team) => {
            if (team?.name) {
                map[String(team.name).toLowerCase()] = team;
            }
        });
        return map;
    }, [teams]);

    const columnCount = getColumnCount();
    const rowCount = Math.ceil(filteredPlayers.length / columnCount);
    const columnWidth = windowWidth / columnCount;

    const PlayerCard = ({ player, style, serial }) => {
        const isActive = !disableHover && selectedPlayerId === player.id;
        const soldState = player.sold_status === true ? "sold" : player.sold_status === false ? "unsold" : null;
        const soldTeamNameRaw = player.team_name || player.team || player.teamname || "";
        const teamMatch =
            soldState === "sold"
                ? (
                    teamById[player.team_id] ||
                    (soldTeamNameRaw ? teamByName[String(soldTeamNameRaw).toLowerCase()] : null)
                )
                : null;
        const soldTeamName = teamMatch?.name || soldTeamNameRaw;

        return (
            <div
                key={player.id}
                style={{ ...style }}                     // keep react-window positioning
                onMouseEnter={() => {
                    if (window.innerWidth > 768) {
                        setSelectedPlayerId(player.id);
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => setSelectedPlayerId(null), 2500);
                    }
                }}
                onClick={() => {
                    if (window.innerWidth <= 768) {
                        const same = selectedPlayerId === player.id;
                        setSelectedPlayerId(same ? null : player.id);
                        if (!same) {
                            clearTimeout(hoverTimeoutRef.current);
                            hoverTimeoutRef.current = setTimeout(() => setSelectedPlayerId(null), 1000);
                        }
                    }
                }}
                className={[
                    "player-card relative rounded-2xl overflow-hidden shadow-xl",
                    "ring-1 ring-black/10 bg-red/5 backdrop-blur-[1px]",
                    "transition-transform duration-300 ease-out cursor-pointer",
                    (typeof document !== "undefined" && document.body.classList.contains("exporting"))
                        ? "scale-100"
                        : (disableHover ? "scale-95 opacity-80" : (isActive ? "scale-105 z-10" : "scale-95"))
                ].join(" ")}
            >
                {/* TOP: full image on red background */}
                {/* TOP: image section with red bg + watermark + serial + player image */}
                <div
                    className="relative h-[66%] bg-center bg-cover"
                    style={{ backgroundImage: "url('/goldbg.jpg')" }}
                >
                    {/* Dark overlay to dim the red background */}

                    {/* <div className="absolute inset-0 bg-black/40 z-0" /> */}

                    {/* EAARENA Logo watermark */}
                    <img
                        src="/AuctionArena2.png"
                        alt="EAARENA Logo"
                        className="absolute inset-0 w-full h-full object-contain opacity-20 pointer-events-none z-10"
                    />

                    {/* Serial pill */}
                    <span className="absolute top-2 left-2 inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow z-30">
                        #{player?.auction_serial ?? serial}
                    </span>

                    {soldState && (
                        <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
                            {soldState === "sold" ? (
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col px-2 py-1 rounded-lg bg-gradient-to-r from-emerald-300 to-green-600 text-black shadow-md min-w-[96px]">
                                        <span className="text-[10px] font-extrabold leading-none tracking-wide">SOLD</span>
                                        <span className="text-[10px] font-semibold leading-tight text-emerald-900 truncate max-w-[140px]">
                                            {soldTeamName || "Team"}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full shadow bg-gradient-to-r from-rose-400 to-red-700 text-white">
                                    UNSOLD
                                </span>
                            )}
                        </div>
                    )}

                    {/* Player image */}
                    <img
                        loading="lazy"
                        src={`https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,ar-3-4,cm-pad_resize,bg-FFFFFF,w-900,q-85,f-webp`}
                        alt={player.name}
                        className="absolute inset-0 w-full h-full object-cover object-[center_22%] md:object-[center_22%] drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] pointer-events-auto cursor-zoom-in z-20"
                        onClick={() =>
                            setOpenImage(
                                `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=w-1600,q-95`
                            )
                        }
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/no-image-found.png";
                        }}
                    />

                    {/* scrim for gradient fade */}
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/10 via-transparent to-transparent z-30" />
                </div>


                {/* BOTTOM: classy white info panel */}
                {/* BOTTOM: classy info panel */}
                <div className="relative h-[34%] bg-white/10 backdrop-blur-md border-t border-yellow-400/40 px-3 pt-3 pb-4 rounded-b-2xl">                    {/* Golden divider */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500"></div>

                    <div
                        className="text-[13px] sm:text-sm font-bold text-yellow-300 leading-[1.25] drop-shadow"
                        style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,           // show up to 2 lines
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden"
                        }}
                    >
                        {player.name}
                    </div>

                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-200">
                        <div>
                            <span className="uppercase tracking-wide text-gray-400 text-[10px]">Role</span>
                            <div className="font-semibold text-white truncate">{player.role || "-"}</div>
                        </div>

                        {player.district && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">District</span>
                                <div className="font-semibold text-white truncate">{player.district}</div>
                            </div>
                        )}

                        {player.base_category && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Category</span>
                                <div className="font-semibold text-white truncate">
                                    {(() => {
                                        const baseCat = String(player.base_category).toUpperCase();
                                        const soldAmt = Number(player.sold_price) || 0;

                                        if (baseCat === "X") {
                                            if (soldAmt === 400000) return "Owner";
                                            if (soldAmt === 1000000) return "Icon";
                                            return "X"; // fallback if different amount
                                        }
                                        return baseCat;
                                    })()}
                                </div>
                            </div>
                        )}


                        {player.nickname && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Nickname</span>
                                <div className="font-semibold text-white truncate">{player.nickname}</div>
                            </div>
                        )}

                        {player.age_category && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Category</span>
                                <div className="font-semibold text-white truncate">{player.age_category}</div>
                            </div>
                        )}

                        {player.location && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Location</span>
                                <div className="font-semibold text-white truncate">{player.location}</div>
                            </div>
                        )}
                        <button
                            className="absolute bottom-2 right-5 text-[11px] sm:text-xs text-yellow-300 hover:text-yellow-200 underline"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpenDetails(player);
                            }}
                        >
                            View full
                        </button>
                    </div>
                </div>
            </div>
        );
    };


    return (
        // <div className="min-h-screen overflow-hidden text-black bg-gradient-to-br from-yellow-100 to-black relative pb-4">

        // <div
        //     className="min-h-screen text-black relative"
        //     style={{
        //         backgroundImage: `linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), rgba(255, 215, 0, 0.3)), url("/bg1.jpg")`,
        //         backgroundSize: 'cover',
        //         backgroundRepeat: 'no-repeat',
        //         backgroundPosition: 'center',
        //         overflowX: 'hidden'
        //     }}
        // >


        <div className="min-h-screen text-black relative overflow-hidden" style={EA_BG_STYLE}>
            <div className="relative">

                {errorMessage && (
                    <div className="bg-red-100 text-red-700 border border-red-400 p-4 rounded-md max-w-xl mx-auto mt-4 text-center">
                        {errorMessage}
                    </div>
                )}

                {!errorMessage && (
                    <>
                        <Navbar tournamentSlug={tournamentSlug} />
                        <div className="pt-6 mt-6">
                            <div className="flex items-center justify-center my-2">
                                {tournamentLogo && (
                                    <img
                                        src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}`}
                                        alt="Tournament Logo"
                                        className="w-40 h-40 object-contain animate-pulse"
                                        loading="lazy"
                                    />
                                )}
                                <h1 className="text-xl font-bold text-center text-yellow-300 p-3">{tournamentName}</h1>
                            </div>

                            <div className="bg-yellow/80 rounded-lg shadow-md p-3 max-w-5xl mx-auto mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                <input
                                    type="text"
                                    placeholder="Search name / serial / nickname"
                                    value={filterQuery}
                                    onChange={(e) => setFilterQuery(e.target.value)}
                                    className="px-2 py-1.5 text-sm rounded-md border w-full"
                                />

                                <Listbox value={filterRole} onChange={setFilterRole}>
                                    <div className="relative w-full">
                                        <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-1.5 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none">
                                            <span className="block truncate">{filterRole || "All Roles"}</span>
                                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                            </span>
                                        </Listbox.Button>
                                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
                                            <Listbox.Option key="" value="">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>All Roles</li>
                                                )}
                                            </Listbox.Option>
                                            {uniqueRoles.map((role, idx) => (
                                                <Listbox.Option key={idx} value={role}>
                                                    {({ selected, active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                            {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                            {role}
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                            ))}
                                        </Listbox.Options>
                                    </div>
                                </Listbox>


                                {hasAnyLocation && (
                                    <Listbox value={filterLocation} onChange={setFilterLocation}>
                                        <div className="relative w-full">
                                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-1.5 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none">
                                                <span className="block truncate">{filterLocation || "All Locations"}</span>
                                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                </span>
                                            </Listbox.Button>
                                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
                                                <Listbox.Option key="" value="">
                                                    {({ active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                            All Locations
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                                {uniqueLocations.map((location, idx) => (
                                                    <Listbox.Option key={idx} value={location}>
                                                        {({ selected, active }) => (
                                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                                {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                                {location}
                                                            </li>
                                                        )}
                                                    </Listbox.Option>
                                                ))}
                                            </Listbox.Options>
                                        </div>
                                    </Listbox>
                                )}


                                {hasAnyDistrict && (
                                    <Listbox value={filterDistrict} onChange={setFilterDistrict}>
                                        <div className="relative w-full">
                                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-1.5 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none">
                                                <span className="block truncate">{filterDistrict || "All Districts"}</span>
                                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                </span>
                                            </Listbox.Button>
                                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
                                                <Listbox.Option key="" value="">
                                                    {({ active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                            All Districts
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                                {uniqueDistricts.map((district, idx) => (
                                                    <Listbox.Option key={idx} value={district}>
                                                        {({ selected, active }) => (
                                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                                {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                                {district}
                                                            </li>
                                                        )}
                                                    </Listbox.Option>
                                                ))}
                                            </Listbox.Options>
                                        </div>
                                    </Listbox>
                                )}

                                

                                {hasAnyAgeCategory && (
                                    <Listbox value={filterCategory} onChange={setFilterCategory}>
                                        <div className="relative w-full">
                                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-1.5 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none">
                                                <span className="block truncate">{filterCategory || "All Categories"}</span>
                                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                </span>
                                            </Listbox.Button>
                                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
                                                <Listbox.Option key="" value="">
                                                    {({ active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                            All Categories
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                                {uniqueAgeCategories.map((cat, idx) => (
                                                    <Listbox.Option key={idx} value={cat}>
                                                        {({ selected, active }) => (
                                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                                {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                                {cat}
                                                            </li>
                                                        )}
                                                    </Listbox.Option>
                                                ))}
                                            </Listbox.Options>
                                        </div>
                                    </Listbox>
                                )}


                                <Listbox value={filtersoldstatus} onChange={setFiltersoldstatus}>
                                    <div className="relative w-full">
                                        <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-1.5 pl-3 pr-10 text-left text-sm shadow-sm focus:outline-none">
                                            <span className="block truncate">
                                                {filtersoldstatus === "" ? "All Status" :
                                                    filtersoldstatus === "true" ? "Sold" :
                                                        filtersoldstatus === "false" ? "Unsold" :
                                                            filtersoldstatus === "notauctioned" ? "Not Auctioned" :
                                                                filtersoldstatus}
                                            </span>
                                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                            </span>
                                        </Listbox.Button>

                                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/5">
                                            <Listbox.Option key="" value="">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                        All Status
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="true" value="true">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                        Sold
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="false" value="false">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                        Unsold
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="notauctioned" value="notauctioned">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-1.5 px-4`}>
                                                        Not Auctioned
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                        </Listbox.Options>
                                    </div>
                                </Listbox>


                                <button
                                    onClick={() => {
                                        setFilterQuery("");
                                        setFilterRole("");
                                        setFilterDistrict("");
                                        setFilterLocation("");
                                        setFiltersoldstatus("");
                                        setFilterCategory("")
                                    }}
                                    className="col-span-2 sm:col-span-2 lg:col-span-2 px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition w-full"
                                >
                                    Clear Filters
                                </button>

                                <button
                                    onClick={downloadAllCardsAsPDF}
                                    className="col-span-2 sm:col-span-2 lg:col-span-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition w-full"
                                >
                                    Download Player Book (PDF)
                                </button>

                                <button
                                    onClick={handleDownloadAllProfileCards}
                                    className="col-span-2 sm:col-span-2 lg:col-span-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition w-full"
                                    disabled={isZipDownloading}
                                >
                                    Download Player Cards (ZIP)
                                </button>

                            </div>

                            <div className="text-center my-4">
                                <span className="bg-black text-yellow-300 px-4 py-2 rounded-full shadow-md font-semibold text-sm">
                                    {filteredPlayers.length} player{filteredPlayers.length !== 1 ? "s" : ""} found
                                </span>
                            </div>

                            <div id="pdf-cards-clone" style={{ position: "absolute", top: "-9999px", left: "-9999px", width: "1000px" }} ref={pdfRef}>
                                {/* <div
                            id="pdf-cards-clone"
                            ref={pdfRef}
                            style={{
                                position: "fixed",
                                top: 0,
                                left: 0,
                                width: "1200px",
                                zIndex: -1,
                                background: "white",
                                opacity: 0,
                                pointerEvents: "none"
                            }}
                        > */}

                                <div className="flex flex-wrap justify-center gap-4">
                                    {(filteredPlayers.length ? filteredPlayers : players).map((player) => (
                                        <div
                                            id={`player-card-${player.id}`}
                                            className="w-[240px] h-[320px]"
                                            key={player.id}
                                        >
                                            <PlayerCard
                                                player={player}
                                                style={{ width: "240px", height: "320px" }}
                                                serial={serialMap[player.id]}
                                            />
                                        </div>
                                    ))}

                                </div>
                            </div>

                            <div className="pb-24">
                                <div id="player-cards-container">
                                    <Grid
                                        columnCount={columnCount}
                                        columnWidth={columnWidth}
                                        height={Math.max(window.innerHeight - 250, 400)}
                                        rowCount={rowCount}
                                        rowHeight={CARD_ROW_HEIGHT}
                                        width={windowWidth - 20}
                                    >
                                        {({ columnIndex, rowIndex, style }) => {
                                            const index = rowIndex * columnCount + columnIndex;
                                            const player = filteredPlayers[index];
                                            return player ? <PlayerCard key={player.id} player={player} style={style} serial={serialMap[player.id]} /> : null;
                                        }}
                                    </Grid>
                                </div>
                            </div>

                            {openImage && (
                                <div
                                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999]"
                                    onClick={() => setOpenImage(null)}
                                >
                                    {/* EAARENA watermark background */}
                                    <img
                                        src="/AuctionArena2.png"
                                        alt="EA ARENA Logo"
                                        className="absolute inset-0 w-full h-full object-contain opacity-10 pointer-events-none"
                                    />

                                    {/* Player full image */}
                                    <img
                                        src={openImage}
                                        alt="Full View"
                                        className="relative max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl border-2 border-yellow-400 z-10"
                                        onClick={(e) => e.stopPropagation()}
                                    />

                                    {/* Close button */}
                                    <button
                                        className="absolute top-6 right-6 text-white text-3xl font-bold hover:text-yellow-300 z-20"
                                        onClick={() => setOpenImage(null)}
                                    >
                                        X
                                    </button>
                                </div>
                            )}

                            {openDetails && (
                                <div
                                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999]"
                                    onClick={() => setOpenDetails(null)}
                                >
                                    {/* Background watermark */}
                                    <img
                                        src="/AuctionArena2.png"
                                        alt="EA ARENA Logo"
                                        className="absolute inset-0 w-full h-full object-contain opacity-10 pointer-events-none"
                                    />

                                    <div
                                        className="relative w-[94vw] max-w-[920px] max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl"
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            background:
                                                "radial-gradient(900px 500px at 0% 0%, rgba(250, 204, 21, .10), transparent 60%), radial-gradient(700px 420px at 100% 0%, rgba(168, 85, 247, .12), transparent 60%), linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)",
                                            border: "1px solid rgba(250,204,21,.22)",
                                        }}
                                    >
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                                            <div className="flex items-center gap-3">
                                                {tournamentLogo && (
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-44,h-44`}
                                                        alt="Tournament"
                                                        className="h-8 w-8 object-contain"
                                                    />
                                                )}
                                                <div className="text-yellow-300 font-bold text-base leading-none">
                                                    #{openDetails.auction_serial ?? serialMap[openDetails.id]} - {openDetails.name}
                                                </div>
                                            </div>
                                            <button
                                                className="text-white text-2xl leading-none hover:text-yellow-300"
                                                onClick={() => setOpenDetails(null)}
                                                aria-label="Close"
                                            >
                                                X
                                            </button>
                                        </div>

                                        {/* Body */}
                                        <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-5 overflow-auto" style={{ maxHeight: "66vh" }}>
                                            {/* Photo panel */}
                                            <div className="md:col-span-2">
                                                <div className="relative rounded-xl overflow-hidden border border-yellow-400/30"
                                                    style={{ backgroundImage: "url('/goldbg.jpg')", backgroundPosition: "center", backgroundSize: "cover" }}>
                                                    <div className="absolute inset-0 bg-black/35" />
                                                    <span className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-extrabold px-2.5 py-0.5 rounded-full shadow z-10">
                                                        #{openDetails.auction_serial ?? serialMap[openDetails.id]}
                                                    </span>
                                                    <img
                                                        src={`https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${openDetails.profile_image}?tr=fo-face,cm-pad_resize,w-1400,q-90,e-sharpen,f-webp`}
                                                        alt={openDetails.name}
                                                        className="relative w-full h-[420px] object-cover drop-shadow-[0_12px_28px_rgba(0,0,0,.55)]"
                                                        onError={(e) => (e.currentTarget.src = "/no-image-found.png")}
                                                    />
                                                </div>
                                            </div>

                                            {/* Fields */}
                                            {/* Details (single block) */}
                                            <div className="md:col-span-3">
                                                <div className="rounded-xl p-4 bg-white/5 border border-white/10">
                                                    <div className="uppercase text-[10px] tracking-wider text-gray-400 mb-2">
                                                        Player Details
                                                    </div>

                                                    <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr] gap-y-2 text-sm">
                                                        {/* Full Name */}
                                                        <div className="text-gray-400">Full Name</div>
                                                        <div className="font-semibold text-white">
                                                            {(openDetails?.name && String(openDetails.name).toLowerCase() !== "null") ? openDetails.name : "-"}
                                                        </div>

                                                        {/* Nick Name */}
                                                        <div className="text-gray-400">Nick Name</div>
                                                        <div className="font-semibold text-white">
                                                            {(openDetails?.nickname && String(openDetails.nickname).toLowerCase() !== "null") ? openDetails.nickname : "-"}
                                                        </div>

                                                        {/* Role */}
                                                        <div className="text-gray-400">Role</div>
                                                        <div className="font-semibold text-white">
                                                            {(openDetails?.role && String(openDetails.role).toLowerCase() !== "null") ? openDetails.role : "-"}
                                                        </div>

                                                        {/* Mobile */}
                                                        <div className="text-gray-400">Mobile</div>
                                                        <div className="font-semibold text-white">
                                                            {(openDetails?.mobile && String(openDetails.mobile).toLowerCase() !== "null")
                                                                ? <a href={`tel:${openDetails.mobile}`} className="hover:underline">{openDetails.mobile}</a>
                                                                : "-"}
                                                        </div>

                                                       {/* Location (only if present) */}
                                                        {openDetails?.location &&
                                                        String(openDetails.location).toLowerCase() !== "null" &&
                                                        openDetails.location.trim() !== "" && (
                                                            <>
                                                            <div className="text-gray-400">Location</div>
                                                            <div className="font-semibold text-white">
                                                                {openDetails.location}
                                                            </div>
                                                            </>
                                                        )}

                                                        {/* Age Category (only if present) */}
                                                        {openDetails?.age_category &&
                                                        String(openDetails.age_category).toLowerCase() !== "null" &&
                                                        openDetails.location.trim() !== "" && (
                                                            <>
                                                            <div className="text-gray-400">Age Category</div>
                                                            <div className="font-semibold text-white">
                                                                {openDetails.age_category}
                                                            </div>
                                                            </>
                                                        )}

                                                        {/* District (only if present) */}
                                                        {openDetails?.district &&
                                                        String(openDetails.district).toLowerCase() !== "null" &&
                                                        openDetails.district.trim() !== "" && (
                                                            <>
                                                            <div className="text-gray-400">District</div>
                                                            <div className="font-semibold text-white">
                                                                {openDetails.district}
                                                            </div>
                                                            </>
                                                        )}


                                                    </div>
                                                </div>
                                            </div>

                                        </div>

                                        {/* Footer actions */}
                                        <div className="px-5 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-yellow-300 text-xs">
                                                All rights reserved | EA Arena | +91-9547652702
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    className="px-4 py-2 rounded-md bg-yellow-500/90 hover:bg-yellow-500 text-black font-semibold"
                                                    onClick={() => handleDownloadProfileCard(openDetails)}
                                                >
                                                    Download Card
                                                </button>

                                                {/* <button
                                                    className="px-4 py-2 rounded-md bg-purple-500/90 hover:bg-purple-500 text-white font-semibold"
                                                    onClick={handleDownloadAllProfileCards}
                                                >
                                                    Download All (ZIP)
                                                </button> */}

                                                <button
                                                    className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white font-semibold"
                                                    onClick={() => setOpenDetails(null)}
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}



                            <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
                                All rights reserved | Powered by Auction Arena | +91-9547652702
                            </footer>
                        </div>
                    </>
                )}

                {isDownloading && (
                    <div className="fixed inset-0 bg-black bg-opacity-70 z-[99999] flex flex-col items-center justify-center text-white text-xl font-semibold">
                        Downloading Page {downloadProgress.current} of {downloadProgress.total}...
                    </div>
                )}

                {isZipDownloading && (
                    <div className="fixed inset-0 bg-black bg-opacity-70 z-[99999] flex flex-col items-center justify-center text-white text-xl font-semibold">
                        {zipProgress.phase === "zip"
                            ? `Creating ZIP... ${zipProgress.percent || 0}%`
                            : `Rendering cards... ${zipProgress.current} of ${zipProgress.total}`}
                    </div>
                )}

                {showToast && (
                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-lg z-[99999] animate-bounce">
                        All Player Cards PDF Downloaded!
                    </div>
                )}


            </div>
        </div>
    );
};

export default AllPlayerCards;
