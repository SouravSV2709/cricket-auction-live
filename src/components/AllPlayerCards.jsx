import React, { useEffect, useState, useRef } from "react";
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


const API = CONFIG.API_BASE_URL;


const AllPlayerCards = () => {
    const { tournamentSlug } = useParams();
    const [players, setPlayers] = useState([]);
    const [tournamentName, setTournamentName] = useState("Loading...");
    const [tournamentLogo, setTournamentLogo] = useState(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState(null);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    const [filterSerial, setFilterSerial] = useState("");
    const [filterName, setFilterName] = useState("");
    const [filterRole, setFilterRole] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");
    const [filtersoldstatus, setFiltersoldstatus] = useState("notauctioned");
    const [filterCategory, setFilterCategory] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
    const [showToast, setShowToast] = useState(false);
    const hoverTimeoutRef = useRef(null);
    const [openImage, setOpenImage] = useState(null);

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

    const filteredPlayers = players.filter((player) =>
        (player.name || "").toLowerCase().includes(filterName.toLowerCase()) &&
        (player.role || "").toLowerCase().includes(filterRole.toLowerCase()) &&
        (player.district || "").toLowerCase().includes(filterDistrict.toLowerCase()) &&
        (player.auction_serial || "").toString().includes(filterSerial) &&
        (
            filtersoldstatus === "" ||
            (filtersoldstatus === "true" && player.sold_status === true) ||
            (filtersoldstatus === "false" && player.sold_status === false) ||
            (filtersoldstatus === "notauctioned" && (player.sold_status === null || player.sold_status === undefined))
        ) &&
        (
            filterCategory === "" || player.base_category === filterCategory
        )
    );




    const serialMap = React.useMemo(() => {
        const map = {};
        players.forEach((p, i) => {
            map[p.id] = i + 1;
        });
        return map;
    }, [players]);


    const cardsPerPage = 12;

    const getPageSubtitle = (pageIndex, playersOnPage, serialMap) => {
        const filters = [];

        if (filterRole) filters.push(`Role: ${filterRole}`);
        if (filterDistrict) filters.push(`District: ${filterDistrict}`);
        if (filterName) filters.push(`Name: ${filterName}`);
        if (filterSerial) filters.push(`Serial: ${filterSerial}`);
        if (filterCategory) filters.push(`Category: ${filterCategory}`);
        if (filtersoldstatus) filters.push(`Sold Status: ${filtersoldstatus}`);

        if (filters.length > 0) {
            return `Page ${pageIndex + 1} [Filtered – ${filters.join(" | ")}]`;
        } else {
            const serials = playersOnPage.map(p => serialMap[p.id]);
            const minSerial = Math.min(...serials);
            const maxSerial = Math.max(...serials);
            return `Page ${pageIndex + 1} [Showing Serial No ${minSerial}–${maxSerial}]`;
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

        console.log(`📦 Preparing ${playersToRender.length} players in ${pages} page(s)...`);

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
            container.style.background = "linear-gradient(to bottom right, #fff8dc, #ffffff)"; // gradient
            container.style.border = "5px dashed #facc15"; // golden dashed border
            container.style.borderRadius = "12px";
            container.style.boxShadow = "0 0 8px rgba(0, 0, 0, 0.1)";
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
            logo.src = `https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-60,h-60`;
            logo.style.width = "60px";
            logo.style.height = "60px";
            logo.style.objectFit = "contain";

            const title = document.createElement("div");
            title.innerHTML = `
  <div style="font-size: 24px; font-weight: bold;">${tournamentName}</div>
  <div style="font-size: 16px; margin-top: 5px;">${getPageSubtitle(pageIndex, pagePlayers, serialMap)}</div>
`;


            header.appendChild(logo);
            header.appendChild(title);
            container.appendChild(header);

            // CARD GRID
            const cardGrid = document.createElement("div");
            cardGrid.style.display = "flex";
            cardGrid.style.flexWrap = "wrap";
            cardGrid.style.justifyContent = "center";
            cardGrid.style.gap = "20px";
            container.appendChild(cardGrid);

            pagePlayers.forEach((player) => {
                const card = document.querySelector(`#player-card-${player.id}`);
                if (card) {
                    // Force default styling (remove hover effect)
                    card.classList.remove("scale-110", "z-10");
                    card.classList.add("scale-95", "opacity-80");

                    const clone = card.cloneNode(true);
                    clone.style.width = "240px";
                    clone.style.height = "320px";
                    cardGrid.appendChild(clone);
                }
            });

            // FOOTER
            const footer = document.createElement("div");
            footer.style.marginTop = "30px";
            footer.style.textAlign = "center";
            footer.style.fontSize = "16px";
            footer.style.color = "#000000";
            footer.style.borderTop = "2px solid #7c3aed";
            footer.style.paddingTop = "10px";
            footer.style.width = "100%";
            footer.innerText = "🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨";
            container.appendChild(footer);

            document.body.appendChild(container);

            // ✅ Proper way to hide from user but allow html2canvas to capture
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
            console.log(`✅ Page ${pageIndex + 1} captured`);
        }

        setDownloadProgress({ current: pages, total: pages });

        pdf.save("AllPlayerCards-Final.pdf");
        console.log("🎉 PDF download completed.");
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
                    setErrorMessage("❌ Tournament not found. Please check the URL.");
                    return;
                }

                setTournamentName(tournamentData.title || tournamentSlug);
                setTournamentLogo(tournamentData.logo);
                const tournamentId = tournamentData.id;

                const playerRes = await fetch(`${API}/api/players?tournament_id=${tournamentId}`);
                const playerData = await playerRes.json();
                const filteredPlayers = playerData.filter(
                    (p) => p.payment_success === true && p.deleted_at == null
                );
                setPlayers(filteredPlayers);
            } catch (err) {
                console.error("❌ Error loading players:", err);
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
    const hasAnyDistrict = players.some((p) => !!p.district);

    const columnCount = getColumnCount();
    const rowCount = Math.ceil(filteredPlayers.length / columnCount);
    const columnWidth = windowWidth / columnCount;

    const PlayerCard = ({ player, style, serial }) => {
        const isActive = !disableHover && selectedPlayerId === player.id;

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
                    "ring-1 ring-black/10 bg-white/5 backdrop-blur-[1px]",
                    "transition-transform duration-300 ease-out cursor-pointer",
                    (typeof document !== "undefined" && document.body.classList.contains("exporting"))
                        ? "scale-100"
                        : (disableHover ? "scale-95 opacity-80" : (isActive ? "scale-105 z-10" : "scale-95"))
                ].join(" ")}
            >
                {/* TOP: full image on red background */}
                {/* TOP: image section with red bg + watermark + serial + player image */}
<div
  className="relative h-[72%] md:h-[66%] bg-center bg-cover"
  style={{ backgroundImage: "url('/redbg.jpg')" }}
>
  {/* Dark overlay to dim the red background */}
  <div className="absolute inset-0 bg-black/40 z-0" />

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

  {/* Player image */}
  <img
    loading="lazy"
    src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-900,q-85,e-sharpen,f-webp`}
    alt={player.name}
    className="absolute inset-0 w-full h-full object-contain object-[center_22%] md:object-[center_15%] drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] pointer-events-auto cursor-zoom-in z-20"
    onClick={() =>
      setOpenImage(
        `https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-1600,q-95`
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
                <div className="relative h-[34%] bg-white/10 backdrop-blur-md border-t border-yellow-400/40 px-3 pt-3 pb-2 rounded-b-2xl">
                    {/* Golden divider */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500"></div>

                    <div className="text-[13px] sm:text-sm font-bold text-yellow-300 leading-[1.25] truncate drop-shadow">
                        {player.name}
                    </div>

                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:text-xs text-gray-200">
                        <div>
                            <span className="uppercase tracking-wide text-gray-400 text-[10px]">Role</span>
                            <div className="font-semibold text-white">{player.role || "-"}</div>
                        </div>

                        {player.district && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">District</span>
                                <div className="font-semibold text-white">{player.district}</div>
                            </div>
                        )}

                        {player.base_category && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Category</span>
                                <div className="font-semibold text-white">{player.base_category}</div>
                            </div>
                        )}

                        {player.nickname && (
                            <div>
                                <span className="uppercase tracking-wide text-gray-400 text-[10px]">Nickname</span>
                                <div className="font-semibold text-white">{player.nickname}</div>
                            </div>
                        )}
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
                                        src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}`}
                                        alt="Tournament Logo"
                                        className="w-40 h-40 object-contain animate-pulse"
                                        loading="lazy"
                                    />
                                )}
                                <h1 className="text-xl font-bold text-center text-yellow-300 p-3">{tournamentName}</h1>
                            </div>

                            <div className="bg-yellow/80 rounded-lg shadow-md p-4 max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 sm:gap-4">
                                <input
                                    type="number"
                                    placeholder="Filter by Serial Number"
                                    value={filterSerial}
                                    onChange={(e) => setFilterSerial(e.target.value)}
                                    className="p-2 rounded-md border w-full sm:w-48"
                                />
                                <input
                                    type="text"
                                    value={filterName}
                                    onChange={(e) => setFilterName(e.target.value)}
                                    placeholder="Filter by name"
                                    className="p-2 rounded-md border w-full sm:w-48"
                                />

                                <Listbox value={filterRole} onChange={setFilterRole}>
                                    <div className="relative w-60">
                                        <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                            <span className="block truncate">{filterRole || "All Roles"}</span>
                                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                            </span>
                                        </Listbox.Button>
                                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                            <Listbox.Option key="" value="">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>All Roles</li>
                                                )}
                                            </Listbox.Option>
                                            {uniqueRoles.map((role, idx) => (
                                                <Listbox.Option key={idx} value={role}>
                                                    {({ selected, active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                            {selected && <CheckIcon className="h-4 w-4 inline mr-1 text-green-500" />}
                                                            {role}
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                            ))}
                                        </Listbox.Options>
                                    </div>
                                </Listbox>


                                {hasAnyDistrict && (
                                    <Listbox value={filterDistrict} onChange={setFilterDistrict}>
                                        <div className="relative w-60">
                                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                                <span className="block truncate">{filterDistrict || "All Districts"}</span>
                                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                </span>
                                            </Listbox.Button>
                                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                                <Listbox.Option key="" value="">
                                                    {({ active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                            All Districts
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                                {uniqueDistricts.map((district, idx) => (
                                                    <Listbox.Option key={idx} value={district}>
                                                        {({ selected, active }) => (
                                                            <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
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

                                {players.some(p => p.base_category && p.base_category.trim() !== "") && (
                                    <Listbox value={filterCategory} onChange={setFilterCategory}>
                                        <div className="relative w-60">
                                            <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
                                                <span className="block truncate">
                                                    {filterCategory === "" ? "All Categories" : filterCategory}
                                                </span>
                                                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                    <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                                                </span>
                                            </Listbox.Button>
                                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                                <Listbox.Option key="" value="">
                                                    {({ active }) => (
                                                        <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                            All Categories
                                                        </li>
                                                    )}
                                                </Listbox.Option>
                                                {Array.from(new Set(players
                                                    .map(p => p.base_category)
                                                    .filter(c => c && c.trim() !== "")))
                                                    .map((cat) => (
                                                        <Listbox.Option key={cat} value={cat}>
                                                            {({ active }) => (
                                                                <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                                    {cat}
                                                                </li>
                                                            )}
                                                        </Listbox.Option>
                                                    ))
                                                }
                                            </Listbox.Options>
                                        </div>
                                    </Listbox>
                                )}



                                <Listbox value={filtersoldstatus} onChange={setFiltersoldstatus}>
                                    <div className="relative w-60">
                                        <Listbox.Button className="relative w-full cursor-default rounded-md border bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none">
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

                                        <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5">
                                            <Listbox.Option key="" value="">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                        All Status
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="true" value="true">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                        Sold
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="false" value="false">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                        Unsold
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                            <Listbox.Option key="notauctioned" value="notauctioned">
                                                {({ active }) => (
                                                    <li className={`${active ? "bg-yellow-100" : ""} cursor-default select-none py-2 px-4`}>
                                                        Not Auctioned
                                                    </li>
                                                )}
                                            </Listbox.Option>
                                        </Listbox.Options>
                                    </div>
                                </Listbox>


                                <button
                                    onClick={() => {
                                        setFilterSerial("");
                                        setFilterName("");
                                        setFilterRole("");
                                        setFilterDistrict("");
                                        setFiltersoldstatus("");
                                        setFilterCategory("")
                                    }}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition w-full sm:w-auto"
                                >
                                    Clear Filters
                                </button>

                                <button
                                    onClick={downloadAllCardsAsPDF}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                >
                                    📥 Download All Player Cards (PDF)
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
                                        rowHeight={340}
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
      ✕
    </button>
  </div>
)}

                            <footer className="fixed bottom-0 left-0 w-full text-center text-white text-lg tracking-widest bg-black border-t border-purple-600 animate-pulse z-50 py-2 mt-5">
                                🔴 All rights reserved | Powered by Auction Arena | +91-9547652702 🧨
                            </footer>
                        </div>
                    </>
                )}

                {isDownloading && (
                    <div className="fixed inset-0 bg-black bg-opacity-70 z-[99999] flex flex-col items-center justify-center text-white text-xl font-semibold">
                        📥 Downloading Page {downloadProgress.current} of {downloadProgress.total}...
                    </div>
                )}

                {showToast && (
                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-lg z-[99999] animate-bounce">
                        ✅ All Player Cards PDF Downloaded!
                    </div>
                )}


            </div>
        </div>
    );
};

export default AllPlayerCards;
