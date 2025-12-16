// src/utils/playerprofilecard.js
//
// Exports a factory `getPlayerProfileCardExporter(ctx)`
// Methods: renderBlob(player), downloadOne(player), downloadAll(players)
//
// Builds a branded Player Profile Card image in the browser and
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

// Print guidance: 300 DPI, 3mm bleed, 5mm safe margin inside trim.
const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const BLEED_MM = 3;
const SAFE_MM = 5;
const BLEED_PX = Math.round(BLEED_MM * MM_TO_PX); // ~36px
const SAFE_PX = Math.round(SAFE_MM * MM_TO_PX); // ~59px
const EXPORT_SCALE = DPI / 96; // html2canvas default is 96 CSS px per inch

// Trimmed size for the portrait design; canvas adds bleed on all sides.
const TRIM_W = 750;
const TRIM_H = 1050;
const CANVAS_W = TRIM_W + BLEED_PX * 2;
const CANVAS_H = TRIM_H + BLEED_PX * 2;

// CRC32 for PNG chunk creation
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const addPngDpi = async (blob, dpi = DPI) => {
  const buf = await blob.arrayBuffer();
  const src = new Uint8Array(buf);
  const ppm = Math.round(dpi / 0.0254); // pixels per meter for 300 DPI

  // PNG signature (8) + IHDR chunk (4+4+13+4)
  const insertAt = 8 + 4 + 4 + 13 + 4;

  const chunk = new Uint8Array(4 + 4 + 9 + 4); // length + type + data + crc
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); // length
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  dv.setUint32(8, ppm); // x ppm
  dv.setUint32(12, ppm); // y ppm
  chunk[16] = 1; // unit = meter
  const crc = crc32(chunk.slice(4, 17));
  dv.setUint32(17, crc);

  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.slice(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(src.slice(insertAt), insertAt + chunk.length);
  return new Blob([out], { type: "image/png" });
};

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
 *   background?: string      // kept for backward compatibility
 * }} ctx
 */
export function getPlayerProfileCardExporter(ctx) {
  const {
    serialResolver,
    tournamentName = "",
    tournamentLogo = "",
    background = "/goldbg.jpg", // background kept for API parity even though design is inline
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
      borderRadius: "22px",
      overflow: "hidden",
      boxSizing: "border-box",
      boxShadow: "0 18px 48px rgba(0,0,0,.55)",
      background: "linear-gradient(135deg,#0c162b 0%,#0a0f1f 50%,#0b192f 100%)",
      color: "#fff",
      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    });

    const frame = document.createElement("div");
    Object.assign(frame.style, {
      position: "absolute",
      inset: `${BLEED_PX}px`,
      width: `${TRIM_W}px`,
      height: `${TRIM_H}px`,
      borderRadius: "18px",
      overflow: "hidden",
      border: "1px solid rgba(158,240,26,.3)",
      background: "linear-gradient(180deg, rgba(20,30,50,.92) 0%, rgba(12,17,30,.95) 100%)",
      boxShadow: "0 14px 38px rgba(0,0,0,.45)",
    });
    container.appendChild(frame);

    const content = document.createElement("div");
    Object.assign(content.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      padding: `${SAFE_PX}px`,
      boxSizing: "border-box",
      gap: "0px",
    });
    frame.appendChild(content);

    const photoSection = document.createElement("div");
    Object.assign(photoSection.style, {
      position: "relative",
      flex: "1 1 68%",
      minHeight: "620px",
      overflow: "hidden",
      background: background || "#0f1a2b",
    });
    content.appendChild(photoSection);

    const pimg = document.createElement("img");
    pimg.src = `https://ik.imagekit.io/auctionarena2/uploads/players/profiles/${player.profile_image}?tr=fo-face,cm-pad_resize,w-1100,q-95,e-sharpen,f-webp`;
    pimg.alt = clean(player.name);
    Object.assign(pimg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      filter: "contrast(1.02) saturate(1.02)",
    });
    pimg.crossOrigin = "anonymous";
    photoSection.appendChild(pimg);

    const vignette = document.createElement("div");
    Object.assign(vignette.style, {
      position: "absolute",
      inset: "0",
      background:
        "linear-gradient(180deg, rgba(0,0,0,.08) 0%, rgba(0,0,0,.28) 50%, rgba(0,0,0,.55) 100%)",
    });
    photoSection.appendChild(vignette);

    const edgeGlow = document.createElement("div");
    Object.assign(edgeGlow.style, {
      position: "absolute",
      inset: "10px",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "14px",
      pointerEvents: "none",
      boxShadow: "0 0 0 1px rgba(0,0,0,.25)",
    });
    photoSection.appendChild(edgeGlow);

    const pattern = document.createElement("div");
    pattern.textContent = "+ + + + + + + + + + + + + +";
    Object.assign(pattern.style, {
      position: "absolute",
      left: "14px",
      top: "14px",
      color: "rgba(255,255,255,.35)",
      fontSize: "13px",
      letterSpacing: "6px",
      lineHeight: "18px",
      transform: "rotate(-6deg)",
      pointerEvents: "none",
    });
    photoSection.appendChild(pattern);

    const patternRight = pattern.cloneNode(true);
    Object.assign(patternRight.style, {
      right: "14px",
      left: "auto",
      bottom: "24px",
      top: "auto",
      transform: "rotate(6deg)",
      color: "rgba(255,255,255,.25)",
      textAlign: "right",
    });
    photoSection.appendChild(patternRight);

    const serialBadge = document.createElement("div");
    Object.assign(serialBadge.style, {
      position: "absolute",
      top: "16px",
      left: "16px",
      background: "linear-gradient(135deg,#8ef12a,#5ac81b)",
      color: "#0f1b2e",
      fontWeight: "900",
      fontSize: "22px",
      padding: "10px 16px",
      borderRadius: "14px",
      boxShadow: "0 8px 20px rgba(0,0,0,.38)",
      zIndex: "3",
      letterSpacing: "0.6px",
    });
    serialBadge.textContent = `#${serial}`;
    photoSection.appendChild(serialBadge);

    const tourTag = document.createElement("div");
    Object.assign(tourTag.style, {
      position: "absolute",
      top: "16px",
      right: "16px",
      background: "rgba(15,23,42,.82)",
      color: "#e2e8f0",
      fontWeight: "800",
      fontSize: "11px",
      padding: "6px 10px",
      borderRadius: "999px",
      border: "1px solid rgba(158,240,26,.3)",
      boxShadow: "0 6px 16px rgba(0,0,0,.35)",
      maxWidth: "280px",
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      letterSpacing: ".3px",
    });
    if (tournamentLogo) {
      const logoImg = document.createElement("img");
      logoImg.src = `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}?tr=w-36,h-36`;
      logoImg.alt = tournamentName || "Tournament";
      Object.assign(logoImg.style, {
        width: "26px",
        height: "26px",
        objectFit: "contain",
        borderRadius: "6px",
        background: "rgba(255,255,255,.08)",
      });
      logoImg.crossOrigin = "anonymous";
      tourTag.appendChild(logoImg);
    }
    const tourText = document.createElement("div");
    tourText.textContent = tournamentName || "Auction Arena";
    tourTag.appendChild(tourText);
    photoSection.appendChild(tourTag);

    const infoSection = document.createElement("div");
    Object.assign(infoSection.style, {
      padding: "18px 18px 14px",
      background:
        "linear-gradient(180deg, rgba(12,17,32,.94) 0%, rgba(9,13,24,.96) 100%)",
      borderTop: "1px solid rgba(255,255,255,.06)",
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: "12px",
    });
    content.appendChild(infoSection);

    const infoTitle = document.createElement("div");
    infoTitle.textContent = "Player Details";
    Object.assign(infoTitle.style, {
      gridColumn: "1 / span 2",
      fontSize: "13px",
      letterSpacing: ".6px",
      color: "#9ef01a",
      fontWeight: "800",
      textTransform: "uppercase",
    });
    infoSection.appendChild(infoTitle);

    const makeRow = (label, value) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "10px",
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(255,255,255,.05)",
        alignItems: "center",
      });

      const l = document.createElement("div");
      l.textContent = label;
      Object.assign(l.style, {
        color: "#cbd5e1",
        fontSize: "11px",
        letterSpacing: ".4px",
        textTransform: "uppercase",
        fontWeight: "700",
      });

      const v = document.createElement("div");
      v.textContent = clean(value);
      Object.assign(v.style, {
        fontWeight: "800",
        fontSize: "14px",
        color: "#f8fafc",
        letterSpacing: ".2px",
      });

      row.appendChild(l);
      row.appendChild(v);
      infoSection.appendChild(row);
    };

    makeRow("Full Name", player.name);
    makeRow("Nick Name", player.nickname);
    makeRow("Role", player.role);
    makeRow("Mobile", player.mobile);
    makeRow("Location", player.district || player.location);

    const footer = document.createElement("div");
    Object.assign(footer.style, {
      gridColumn: "1 / span 2",
      textAlign: "center",
      marginTop: "4px",
      color: "#94a3b8",
      fontSize: "11px",
      letterSpacing: ".5px",
      fontWeight: "600",
    });
    footer.textContent = "Auction Arena || +91-9547652702";
    infoSection.appendChild(footer);

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
      scale: EXPORT_SCALE,
      useCORS: true,
      backgroundColor: null,
    });
    const rawBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    const blob = await addPngDpi(rawBlob, DPI);
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
