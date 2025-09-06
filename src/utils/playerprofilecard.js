// src/utils/playerprofilecard.js
//
// Exports a factory `getPlayerProfileCardExporter(ctx)`
// Methods: renderBlob(player), downloadOne(player), downloadAll(players)
//
// This builds a branded Player Profile Card image in the browser and
// downloads either a single PNG or a ZIP of many PNGs.

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

// Default canvas size (landscape). Keep or change as you like.
const CANVAS_W = 1011;
const CANVAS_H = 638;

const clean = (v) => {
  const s = (v ?? "").toString().trim();
  return s && s.toLowerCase() !== "null" ? s : "-";
};

const safe = (name) =>
  String(name || "player")
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

/**
 * @param {{
 *   serialResolver: (player:any)=>string|number,
 *   tournamentName?: string,
 *   tournamentLogo?: string, // raw filename in your IK bucket
 *   background?: string      // path to bg image in /public (default '/goldbg.jpg')
 * }} ctx
 */
export function getPlayerProfileCardExporter(ctx) {
  const {
    serialResolver,
    tournamentName = "",
    tournamentLogo = "",
    background = "/goldbg.jpg",
  } = ctx;

  const buildContainer = (player, serial) => {
    const container = document.createElement("div");
    Object.assign(container.style, {
      width: `${CANVAS_W}px`,
      height: `${CANVAS_H}px`,
      position: "fixed",
      left: "-100000px",
      top: "0",
      zIndex: "-1",
      padding: "12px",
      borderRadius: "12px",
      overflow: "hidden",
      boxShadow: "0 10px 40px rgba(0,0,0,.55)",
      background: `
        radial-gradient(700px 380px at 0% 0%, rgba(250, 204, 21, .12), transparent 60%),
        radial-gradient(560px 320px at 100% 0%, rgba(168, 85, 247, .12), transparent 60%),
        linear-gradient(180deg, #0B1020 0%, #121028 48%, #1A1033 100%)
      `,
      border: "1px solid rgba(250,204,21,.32)",
      boxSizing: "border-box",
      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    });

    // subtle watermark
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

    // header
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: "8px",
      padding: "6px 8px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(250,204,21,.28)",
      borderRadius: "8px",
      color: "#FDE68A",
      fontSize: "12px",
      lineHeight: "1",
    });

    const hdrLeft = document.createElement("div");
    Object.assign(hdrLeft.style, { display: "flex", alignItems: "center", gap: "6px" });

    if (tournamentLogo) {
      const tourLogo = document.createElement("img");
      tourLogo.src = `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-44,h-44`;
      tourLogo.alt = tournamentName || "Tournament";
      Object.assign(tourLogo.style, { height: "20px", objectFit: "contain" });
      tourLogo.crossOrigin = "anonymous";
      hdrLeft.appendChild(tourLogo);
    }

    if (tournamentName) {
      const t = document.createElement("div");
      Object.assign(t.style, { color: "#FDE68A", fontWeight: "800" });
      t.textContent = tournamentName;
      hdrLeft.appendChild(t);
    }

    const hdrCenter = document.createElement("div");
    Object.assign(hdrCenter.style, { textAlign: "center", fontWeight: "800" });
    hdrCenter.textContent = `#${serial} — ${clean(player.name)}`;

    const hdrRight = document.createElement("div");
    Object.assign(hdrRight.style, { opacity: ".9" });
    hdrRight.textContent = "Auction Arena";

    header.appendChild(hdrLeft);
    header.appendChild(hdrCenter);
    header.appendChild(hdrRight);
    container.appendChild(header);

    // body
    const body = document.createElement("div");
    Object.assign(body.style, {
      display: "grid",
      gridTemplateColumns: "320px 1fr",
      gap: "10px",
      marginTop: "8px",
      height: `${CANVAS_H - 12 - 12 - 34 - 8 - 26}px`,
    });

    // left: photo panel
    const left = document.createElement("div");
    Object.assign(left.style, {
      position: "relative",
      borderRadius: "10px",
      overflow: "hidden",
      border: "1px solid rgba(250,204,21,.28)",
      backgroundImage: `url('${background}')`,
      backgroundPosition: "center",
      backgroundSize: "cover",
      minHeight: "100%",
    });

    const dim = document.createElement("div");
    Object.assign(dim.style, { position: "absolute", inset: "0", background: "rgba(0,0,0,.33)" });
    left.appendChild(dim);

    const serialPill = document.createElement("div");
    Object.assign(serialPill.style, {
      position: "absolute",
      top: "6px",
      left: "6px",
      background: "linear-gradient(90deg,#facc15,#f97316)",
      color: "#111",
      fontWeight: "900",
      fontSize: "10px",
      padding: "4px 7px",
      borderRadius: "999px",
      boxShadow: "0 2px 8px rgba(0,0,0,.35)",
      zIndex: "2",
    });
    serialPill.textContent = `#${serial}`;
    left.appendChild(serialPill);

    const pimg = document.createElement("img");
    pimg.src = `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-900,q-92,e-sharpen,f-webp`;
    pimg.alt = clean(player.name);
    Object.assign(pimg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      filter: "drop-shadow(0 8px 20px rgba(0,0,0,.55))",
    });
    pimg.crossOrigin = "anonymous";
    left.appendChild(pimg);

    body.appendChild(left);

    // right: single details block
    const right = document.createElement("div");
    Object.assign(right.style, { display: "flex", flexDirection: "column" });

    const details = document.createElement("div");
    Object.assign(details.style, {
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "10px",
      padding: "10px 12px",
      color: "white",
    });

    const title = document.createElement("div");
    title.textContent = "PLAYER DETAILS";
    Object.assign(title.style, {
      color: "#C0C0C0",
      fontSize: "10px",
      letterSpacing: ".7px",
      marginBottom: "6px",
      fontWeight: "700",
    });
    details.appendChild(title);

    const makeRow = (label, value) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: "10px",
        marginTop: "6px",
        alignItems: "baseline",
      });

      const l = document.createElement("div");
      l.textContent = label;
      Object.assign(l.style, { color: "#C0C0C0", fontSize: "11px", letterSpacing: ".4px" });

      const v = document.createElement("div");
      v.textContent = clean(value);
      Object.assign(v.style, { fontWeight: "800", fontSize: "13px", lineHeight: "1.1" });

      row.appendChild(l);
      row.appendChild(v);
      details.appendChild(row);
    };

    makeRow("Full Name", player.name);
    makeRow("Nick Name", player.nickname);
    makeRow("Role", player.role);
    makeRow("Mobile", player.mobile);

    right.appendChild(details);
    body.appendChild(right);
    container.appendChild(body);

    // footer (tiny brand line)
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      marginTop: "8px",
      background: "rgba(0,0,0,.35)",
      border: "1px solid rgba(168,85,247,.28)",
      color: "#FDE68A",
      fontSize: "10px",
      textAlign: "center",
      padding: "6px 8px",
      borderRadius: "8px",
    });
    footer.textContent = "EA ARENA • +91-9547652702";
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
    const serial = serialResolver(player);
    const container = buildContainer(player, serial);
    await waitImages(container);

    const canvas = await window.html2canvas(container, {
      scale: 1,
      useCORS: true,
      backgroundColor: null,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    document.body.removeChild(container);
    return { blob, serial };
  };

  const downloadOne = async (player) => {
    const { blob, serial } = await renderBlob(player);
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `player-profile-card-${serial}-${safe(player.name)}.png`;
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
      const { blob, serial } = await renderBlob(players[i]);
      // eslint-disable-next-line no-await-in-loop
      const buf = await blob.arrayBuffer();
      zip.file(`player-profile-card-${serial}-${safe(players[i].name)}.png`, buf);
    }
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
      ts.getDate()
    ).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(
      2,
      "0"
    )}`;
    const tour = safe(tournamentName || "tournament");
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    window.saveAs(zipBlob, `auctionarena-player-profile-cards-${tour}-${stamp}.zip`);
  };

  return { renderBlob, downloadOne, downloadAll };
}
