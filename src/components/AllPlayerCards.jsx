import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import ReactDOM from "react-dom/client";
import CONFIG from "../components/config";
import Navbar from "../components/Navbar";
import { FixedSizeGrid as Grid } from "react-window";
import { Listbox } from "@headlessui/react";
import BackgroundEffect from "../components/BackgroundEffect";
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
    const [errorMessage, setErrorMessage] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
    const [showToast, setShowToast] = useState(false);
    const hoverTimeoutRef = useRef(null);



    const pdfRef = useRef();
    const fetchPlayersRef = useRef(false);

    const filteredPlayers = players.filter((player) =>
        (player.name || "").toLowerCase().includes(filterName.toLowerCase()) &&
        (player.role || "").toLowerCase().includes(filterRole.toLowerCase()) &&
        (player.district || "").toLowerCase().includes(filterDistrict.toLowerCase()) &&
        (player.auction_serial || "").toString().includes(filterSerial)
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

    const PlayerCard = ({ player, style, serial }) => (
        <div
            key={player.id}
            style={{
                ...style,
                // padding: "0.25rem",
                backgroundImage: 'url("/goldenbg.png")',
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                height: "320px",
                WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat"
            }}
            onMouseEnter={() => {
                if (window.innerWidth > 768) {
                    setSelectedPlayerId(player.id);

                    // Auto clear after 2.5s
                    clearTimeout(hoverTimeoutRef.current);
                    hoverTimeoutRef.current = setTimeout(() => {
                        setSelectedPlayerId(null);
                    }, 2500);
                }
            }}
            onClick={() => {
                if (window.innerWidth <= 768) {
                    const isSame = selectedPlayerId === player.id;
                    setSelectedPlayerId(isSame ? null : player.id);

                    if (!isSame) {
                        clearTimeout(hoverTimeoutRef.current);
                        hoverTimeoutRef.current = setTimeout(() => {
                            setSelectedPlayerId(null);
                        }, 1000);
                    }
                }
            }}

            serial={serialMap[player.id]}
            className={`player-card relative rounded-xl text-center font-sans transition-all duration-500 ease-in-out cursor-pointer ${disableHover ? "scale-95 opacity-80" : selectedPlayerId === player.id ? "scale-110 z-10" : "scale-95 opacity-80"
                }`}

        >
            <div className="w-full h-full flex flex-col justify-center items-center scale-[.95] sm:scale-100">
                <div className="absolute top-12 left-8 sm:top-12 sm:left-10 md:top-12 md:left-12">
                    <span className="inline-block bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-[10px] sm:text-xs md:text-sm font-bold px-2 py-1 rounded-full shadow-lg tracking-wide">
                        #{serial}
                    </span>
                </div>
                <img
                    loading="lazy"
                    src={`https://ik.imagekit.io/auctionarena/uploads/players/profiles/${player.profile_image}?tr=w-240,h-240,fo-face,z-1`}
                    alt={player.name}
                    className={`object-contain mx-auto rounded-full ${selectedPlayerId === player.id
                        ? "w-24 h-24 sm:w-24 sm:h-24 md:w-32 md:h-32"
                        : "w-16 h-16 sm:w-16 sm:h-16 md:w-24 md:h-24"
                        }`}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "/no-image-found.png";
                    }}
                />
                <div className="text-xs font-bold text-black uppercase mt-1">{player.name}</div>
                <div className={`text-xs font-bold ${selectedPlayerId === player.id ? "text-black" : "text-gray-700"}`}>
                    <div>Role: {player.role || "-"}</div>
                    {player.district && (
                        <div>District: {player.district}</div>
                    )}
                </div>
                {tournamentLogo && (
                    <div className="flex justify-center items-center gap-1 animate-pulse">
                        <img
                            loading="lazy"
                            src={`https://ik.imagekit.io/auctionarena/uploads/tournaments/${tournamentLogo}?tr=w-40,h-40`}
                            alt="Tournament Logo"
                            className="w-14 h-14 object-contain"
                        />
                        <img
                            loading="lazy"
                            src="/AuctionArena2.png"
                            alt="Auction Arena"
                            className="w-10 h-10 object-contain"
                        />
                    </div>
                )}
            </div>
        </div>
    );

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

        
        <div className="min-h-screen text-black relative overflow-hidden">
        <BackgroundEffect theme="grid" />
        <div className="relative z-10">

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


                            <button
                                onClick={() => {
                                    setFilterSerial("");
                                    setFilterName("");
                                    setFilterRole("");
                                    setFilterDistrict("");
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
