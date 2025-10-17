// src/utils/teamRosterPoster.js
// Builds a single team poster that includes ALL players of the team
// in a nice grid with team name/logo and tournament branding.

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
};

const clean = (v) => {
  const s = (v ?? "").toString().trim();
  return s && s.toLowerCase() !== "null" ? s : "-";
};

const safe = (name) =>
  String(name || "poster")
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

// Portrait canvas (2:3 aspect). Tuned for social/print.
const CANVAS_W = 1080;

/**
 * @param {{
 *   team: { id:number, name:string, logo?:string },
 *   tournamentName?: string,
 *   tournamentLogo?: string,
 *   background?: string
 * }} ctx
 */
export function getTeamRosterPosterExporter(ctx) {
  const {
    team,
    tournamentName = "",
    tournamentLogo = "",
    background = "/goldbg.jpg",
  } = ctx;

  const buildContainer = (players) => {
    const list = [...players]; // only actual team players
    const count = list.length;
    const cols = 3; // consistent 3-column layout like the reference

    const container = document.createElement("div");
    Object.assign(container.style, {
      width: `${CANVAS_W}px`,
      position: "absolute",
      left: "-100000px",
      top: "0",
      zIndex: "-1",
      padding: "30px 26px 26px",
      borderRadius: "18px",
      overflow: "hidden",
      background: `
        radial-gradient(1300px 760px at 0% 0%, rgba(250, 204, 21, .12), transparent 60%),
        radial-gradient(900px 520px at 100% 0%, rgba(168, 85, 247, .12), transparent 60%),
        linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
      `,
      border: "2px solid rgba(250, 204, 21, .35)",
      boxShadow: "0 16px 60px rgba(0,0,0,.55)",
      boxSizing: "border-box",
      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      color: "white",
    });

    // Watermark
    const wm = document.createElement("img");
    wm.src = "/AuctionArena2.png";
    Object.assign(wm.style, {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain",
      opacity: ".05",
      pointerEvents: "none",
    });
    container.appendChild(wm);

    // Header
    const hdr = document.createElement("div");
    Object.assign(hdr.style, {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: "12px",
      background: "linear-gradient(90deg, rgba(250,204,21,.18), rgba(168,85,247,.18))",
      border: "1px solid rgba(250,204,21,.28)",
      borderRadius: "12px",
      padding: "10px 14px",
    });

    const hdrLeft = document.createElement("div");
    Object.assign(hdrLeft.style, { display: "flex", alignItems: "center", gap: "8px" });
    if (tournamentLogo) {
      const tLogo = document.createElement("img");
      tLogo.src = `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-96,h-96`;
      tLogo.alt = tournamentName || "Tournament";
      Object.assign(tLogo.style, { height: "32px", objectFit: "contain" });
      tLogo.crossOrigin = "anonymous";
      hdrLeft.appendChild(tLogo);
    }
    if (tournamentName) {
      const tName = document.createElement("div");
      Object.assign(tName.style, { fontWeight: 800, color: "#FDE68A", fontSize: "16px" });
      tName.textContent = tournamentName;
      hdrLeft.appendChild(tName);
    }

    const hdrCenter = document.createElement("div");
    Object.assign(hdrCenter.style, { textAlign: "center", fontWeight: 900, fontSize: "26px", letterSpacing: ".6px" });
    hdrCenter.textContent = `TEAM - ${clean(team?.name)}`;

    const hdrRight = document.createElement("div");
    if (team?.logo) {
      const teamLogo = document.createElement("img");
      teamLogo.src = `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}?tr=w-160,h-160`;
      teamLogo.alt = team?.name || "Team";
      Object.assign(teamLogo.style, { height: "42px", objectFit: "contain" });
      teamLogo.crossOrigin = "anonymous";
      hdrRight.appendChild(teamLogo);
    }

    hdr.appendChild(hdrLeft);
    hdr.appendChild(hdrCenter);
    hdr.appendChild(hdrRight);
    container.appendChild(hdr);

    // Grid wrapper
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      marginTop: "18px",
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: "20px",
    });

    const tile = (player) => {
      // Gradient shell for a nice border edge
      const shell = document.createElement("div");
      Object.assign(shell.style, {
        background: "linear-gradient(135deg, rgba(250,204,21,.85), rgba(168,85,247,.85))",
        padding: "1px",
        borderRadius: "14px",
      });

      const card = document.createElement("div");
      Object.assign(card.style, {
        background: "rgba(12,15,26,.82)",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: "13px",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        minHeight: "240px",
        boxShadow: "0 8px 28px rgba(0,0,0,.35)",
      });

      const imgWrap = document.createElement("div");
      Object.assign(imgWrap.style, {
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundImage: `url('${background}')`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        position: "relative",
        border: "1px solid rgba(250,204,21,.22)",
      });

      const dim = document.createElement("div");
      Object.assign(dim.style, { position: "absolute", inset: 0, background: "rgba(0,0,0,.25)" });
      imgWrap.appendChild(dim);

      const img = document.createElement("img");
      if (player) {
        img.src = `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-600,h-600,q-90,e-sharpen,f-webp`;
        img.alt = clean(player.name);
      } else {
        img.src = "/no-image-found.png";
        img.alt = "Empty";
      }
      Object.assign(img.style, {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,.5))",
      });
      img.crossOrigin = "anonymous";
      imgWrap.appendChild(img);

      const name = document.createElement("div");
      Object.assign(name.style, {
        marginTop: "10px",
        padding: "0 6px",
        fontWeight: 800,
        fontSize: "18px",
        lineHeight: "1.2",
        whiteSpace: "normal",
        wordBreak: "break-word",
        width: "100%",
        minHeight: "44px", // reserve space for up to ~2 lines
      });
      name.textContent = player ? clean(player.name) : "-";

      card.appendChild(imgWrap);
      card.appendChild(name);
      shell.appendChild(card);
      return shell;
    };

    list.forEach((p) => grid.appendChild(tile(p)));
    container.appendChild(grid);

    // Footer
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      marginTop: "16px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(168,85,247,.28)",
      color: "#FDE68A",
      fontSize: "12px",
      textAlign: "center",
      padding: "8px 10px",
      borderRadius: "10px",
    });
    footer.textContent = "EA ARENA | +91-9547652702";
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

  const renderBlob = async (players) => {
    await ensureLibs();
    const container = buildContainer(players);
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

  const download = async (players) => {
    const { blob } = await renderBlob(players);
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `team-roster-${safe(team?.name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return { renderBlob, download };
}
