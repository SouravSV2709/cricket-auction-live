// src/utils/teamPosters.js
//
// Export a factory `getTeamPosterExporter(ctx)` to render and download
// team-branded posters for players. Each poster highlights:
// - Team logo & Team name
// - Player image & Player name
//
// It can download a single PNG or a ZIP of all team posters.

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

const ensureLibs = async () => {
  if (!window.html2canvas) {
    await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  }
  if (!window.JSZip) {
    await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
  }
  if (!window.saveAs) {
    await loadScript("https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js");
  }
};

// Portrait poster size for better social share/print
const CANVAS_W = 900;
const CANVAS_H = 1400;

const clean = (v) => {
  const s = (v ?? "").toString().trim();
  return s && s.toLowerCase() !== "null" ? s : "-";
};

const safe = (name) =>
  String(name || "poster")
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

/**
 * @param {{
 *   team: { id:number, name:string, logo?:string },
 *   tournamentName?: string,
 *   tournamentLogo?: string, // raw filename in ImageKit bucket
 *   background?: string // path within /public, default '/goldbg.jpg'
 * }} ctx
 */
export function getTeamPosterExporter(ctx) {
  const {
    team,
    tournamentName = "",
    tournamentLogo = "",
    background = "/goldbg.jpg",
  } = ctx;

  const buildContainer = (player) => {
    const container = document.createElement("div");
    Object.assign(container.style, {
      width: `${CANVAS_W}px`,
      height: `${CANVAS_H}px`,
      position: "fixed",
      left: "-100000px",
      top: "0",
      zIndex: "-1",
      padding: "20px",
      borderRadius: "16px",
      overflow: "hidden",
      background: `
        radial-gradient(1200px 700px at 0% 0%, rgba(250, 204, 21, 0.12), transparent 60%),
        radial-gradient(900px 500px at 100% 0%, rgba(168, 85, 247, 0.12), transparent 60%),
        linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
      `,
      border: "2px solid rgba(250, 204, 21, 0.35)",
      boxShadow: "0 16px 60px rgba(0,0,0,.55)",
      boxSizing: "border-box",
      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      color: "white",
    });

    // faint tournament/brand watermark
    const wm = document.createElement("img");
    wm.src = "/AuctionArena2.png";
    Object.assign(wm.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      opacity: ".05",
      pointerEvents: "none",
    });
    container.appendChild(wm);

    // Header: tournament + team
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: "10px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(250,204,21,.28)",
      borderRadius: "12px",
      padding: "10px 12px",
    });

    const left = document.createElement("div");
    Object.assign(left.style, { display: "flex", alignItems: "center", gap: "8px" });
    if (tournamentLogo) {
      const tLogo = document.createElement("img");
      tLogo.src = `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-80,h-80`;
      tLogo.alt = tournamentName || "Tournament";
      Object.assign(tLogo.style, { height: "28px", objectFit: "contain" });
      tLogo.crossOrigin = "anonymous";
      left.appendChild(tLogo);
    }
    if (tournamentName) {
      const tName = document.createElement("div");
      Object.assign(tName.style, { fontWeight: 800, color: "#FDE68A" });
      tName.textContent = tournamentName;
      left.appendChild(tName);
    }

    const center = document.createElement("div");
    Object.assign(center.style, { textAlign: "center", fontWeight: 900, fontSize: "18px" });
    center.textContent = team?.name || "Team";

    const right = document.createElement("div");
    if (team?.logo) {
      const teamSmall = document.createElement("img");
      teamSmall.src = `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}?tr=w-120,h-120`;
      teamSmall.alt = team?.name || "Team Logo";
      Object.assign(teamSmall.style, { height: "32px", objectFit: "contain" });
      teamSmall.crossOrigin = "anonymous";
      right.appendChild(teamSmall);
    }

    header.appendChild(left);
    header.appendChild(center);
    header.appendChild(right);
    container.appendChild(header);

    // Main hero area
    const hero = document.createElement("div");
    Object.assign(hero.style, {
      position: "relative",
      marginTop: "14px",
      borderRadius: "14px",
      border: "1px solid rgba(250,204,21,.28)",
      overflow: "hidden",
      minHeight: `${CANVAS_H - 20 - 56 - 14 - 120}px`, // container padding + header + gap + footer approx
      backgroundImage: `url('${background}')`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    });

    const dim = document.createElement("div");
    Object.assign(dim.style, { position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" });
    hero.appendChild(dim);

    // big team watermark
    if (team?.logo) {
      const wmTeam = document.createElement("img");
      wmTeam.src = `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}?tr=w-1000,h-1000,q-60,bl-6`;
      wmTeam.alt = team?.name || "Team";
      Object.assign(wmTeam.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-8deg)",
        width: "80%",
        opacity: ".10",
        filter: "drop-shadow(0 4px 14px rgba(0,0,0,.45))",
        pointerEvents: "none",
      });
      wmTeam.crossOrigin = "anonymous";
      hero.appendChild(wmTeam);
    }

    // player image centered
    const pimg = document.createElement("img");
    pimg.src = `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-1100,q-92,e-sharpen,f-webp`;
    pimg.alt = clean(player.name);
    Object.assign(pimg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      filter: "drop-shadow(0 10px 24px rgba(0,0,0,.6))",
    });
    pimg.crossOrigin = "anonymous";
    hero.appendChild(pimg);

    // Player name ribbon at bottom
    const ribbonWrap = document.createElement("div");
    Object.assign(ribbonWrap.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "12px",
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
      zIndex: 2,
    });
    const ribbon = document.createElement("div");
    Object.assign(ribbon.style, {
      background: "linear-gradient(90deg,#facc15,#f97316)",
      color: "#111",
      fontWeight: 900,
      fontSize: "28px",
      letterSpacing: ".5px",
      padding: "8px 16px",
      borderRadius: "999px",
      boxShadow: "0 6px 18px rgba(0,0,0,.35)",
      maxWidth: "82%",
      textAlign: "center",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    ribbon.textContent = clean(player.name);
    ribbonWrap.appendChild(ribbon);
    hero.appendChild(ribbonWrap);

    container.appendChild(hero);

    // Footer
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      marginTop: "14px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(168,85,247,.28)",
      color: "#FDE68A",
      fontSize: "12px",
      textAlign: "center",
      padding: "8px 10px",
      borderRadius: "10px",
    });
    footer.textContent = "Auction Arena \u007F +91-9547652702";
    container.appendChild(footer);

    document.body.appendChild(container);
    return container;
  };

  const waitImages = async (root) => {
    const imgs = root.querySelectorAll("img");
    await Promise.all(
      Array.from(imgs).map(
        (img) =>
          new Promise((res) => {
            if (img.complete && img.naturalWidth) return res();
            const to = setTimeout(res, 2000);
            img.onload = () => {
              clearTimeout(to);
              res();
            };
            img.onerror = () => {
              clearTimeout(to);
              res();
            };
          })
      )
    );
  };

  const renderBlob = async (player) => {
    await ensureLibs();
    const container = buildContainer(player);
    await waitImages(container);
    const canvas = await window.html2canvas(container, {
      scale: 1,
      useCORS: true,
      backgroundColor: null,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    document.body.removeChild(container);
    return { blob };
  };

  const downloadOne = async (player) => {
    const { blob } = await renderBlob(player);
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `team-poster-${safe(team?.name)}-${safe(player.name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = async (players) => {
    await ensureLibs();
    const zip = new window.JSZip();
    for (let i = 0; i < players.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { blob } = await renderBlob(players[i]);
      // eslint-disable-next-line no-await-in-loop
      const buf = await blob.arrayBuffer();
      zip.file(`team-poster-${safe(team?.name)}-${safe(players[i].name)}.png`, buf);
    }
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
      ts.getDate()
    ).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(
      2,
      "0"
    )}`;
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const tour = safe(tournamentName || "tournament");
    window.saveAs(zipBlob, `auctionarena-${tour}-${safe(team?.name)}-team-posters-${stamp}.zip`);
  };

  return { renderBlob, downloadOne, downloadAll };
}

