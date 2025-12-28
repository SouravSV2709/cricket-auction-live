// src/utils/playerprofilecard.js
//
// Exports a factory `getPlayerProfileCardExporter(ctx)`
// Methods: renderBlob(player), downloadOne(player), downloadOnePdf(player), downloadAll(players), downloadAllPdf(players)
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
  if (!window.jspdf || !window.jspdf.jsPDF) {
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  }
};

// Print guidance: 600 DPI, 3mm bleed, 5mm safe margin inside trim for sharper output
const DPI = 600;
const MM_TO_PX = DPI / 25.4;
const BULK_DPI = 300; // lighter DPI for bulk ZIPs to speed up export
const BLEED_MM = 3;
const SAFE_MM = 5;
const BLEED_PX = Math.round(BLEED_MM * MM_TO_PX);
const SAFE_PX = Math.round(SAFE_MM * MM_TO_PX);
const EXPORT_SCALE = DPI / 96; // html2canvas default is 96 CSS px per inch
const BULK_EXPORT_SCALE = BULK_DPI / 96; // lower scale for faster bulk generation

// ID-1 (credit card) size: 54mm x 86mm; trim is the printable area inside bleed
const CARD_W_MM = 54;
const CARD_H_MM = 86;
const TRIM_W = Math.round(CARD_W_MM * MM_TO_PX); // ~1276px at 600 DPI
const TRIM_H = Math.round(CARD_H_MM * MM_TO_PX); // ~2032px at 600 DPI
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

const blobToDataUrl = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

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
    background = "/redbg.jpg", // background kept for API parity even though design is inline
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
      background:
        "radial-gradient(1100px 650px at 0% 0%, rgba(255, 255, 255, .16), transparent 60%), radial-gradient(900px 550px at 100% 0%, rgba(255, 235, 235, .18), transparent 60%), linear-gradient(135deg, #d41424 0%, #f0493c 55%, #ff7c6b 100%)",
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
      border: "1px solid rgba(255,159,128,.35)",
      background:
        "linear-gradient(160deg, rgba(248,72,72,.95) 0%, rgba(232,44,54,.96) 55%, rgba(210,28,40,.97) 100%)",
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

    // Corner folded stripes
    const addFoldedCorner = (corner) => {
      const wrap = document.createElement("div");
      const isTop = corner === "tl";
      Object.assign(wrap.style, {
        position: "absolute",
        zIndex: "3",
        top: isTop ? `${SAFE_PX - 10}px` : "auto",
        left: isTop ? `${SAFE_PX - 10}px` : "auto",
        right: !isTop ? `${SAFE_PX - 10}px` : "auto",
        bottom: !isTop ? `${SAFE_PX - 10}px` : "auto",
        width: "120px",
        height: "60px",
        pointerEvents: "none",
      });

      const strip1 = document.createElement("div");
      Object.assign(strip1.style, {
        position: "absolute",
        width: "110px",
        height: "9px",
        backgroundImage: "linear-gradient(120deg, rgba(255,255,255,.18) 0%, rgba(255,159,128,.65) 50%, rgba(255,255,255,.14) 100%)",
        borderRadius: "999px",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))",
        transform: isTop ? "rotate(-12deg)" : "rotate(12deg)",
        top: isTop ? "4px" : "auto",
        bottom: !isTop ? "4px" : "auto",
        left: isTop ? "0px" : "auto",
        right: !isTop ? "0px" : "auto",
      });

      const strip2 = document.createElement("div");
      Object.assign(strip2.style, {
        position: "absolute",
        width: "70px",
        height: "9px",
        backgroundImage: "linear-gradient(120deg, rgba(255,255,255,.2) 0%, rgba(255,159,128,.75) 60%, rgba(255,255,255,.14) 100%)",
        borderRadius: "999px",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))",
        transform: isTop ? "rotate(28deg)" : "rotate(-28deg)",
        top: isTop ? "22px" : "auto",
        bottom: !isTop ? "22px" : "auto",
        left: isTop ? "34px" : "auto",
        right: !isTop ? "34px" : "auto",
      });

      wrap.appendChild(strip1);
      wrap.appendChild(strip2);
      frame.appendChild(wrap);
    };

    addFoldedCorner("tl");
    addFoldedCorner("br");

    const photoSection = document.createElement("div");
    const classyPhotoGradient =
      "linear-gradient(145deg, rgba(255,122,122,.9) 0%, rgba(240,74,74,.92) 60%, rgba(212,44,44,.94) 100%)";

    Object.assign(photoSection.style, {
      position: "relative",
      flex: "1 1 68%",
      minHeight: "1100px",
      overflow: "hidden",
      backgroundImage: background
        ? `${classyPhotoGradient}, url('${background}')`
        : classyPhotoGradient,
      backgroundSize: background ? "cover" : "auto",
      backgroundPosition: background ? "center" : "0 0",
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
        "linear-gradient(180deg, rgba(255,255,255,.04) 0%, rgba(255,140,140,.16) 50%, rgba(230,72,72,.32) 100%)",
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
      fontSize: "26px",
      padding: "12px 18px",
      borderRadius: "16px",
      boxShadow: "0 8px 20px rgba(0,0,0,.38)",
      zIndex: "3",
      letterSpacing: "0.8px",
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
      fontWeight: "900",
      fontSize: "12px",
      padding: "8px 12px",
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
      background: "linear-gradient(180deg, rgba(255,122,122,.9) 0%, rgba(240,84,84,.92) 100%)",
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
      fontSize: "16px",
      letterSpacing: ".8px",
      color: "#9ef01a",
      fontWeight: "900",
      textTransform: "uppercase",
    });
    infoSection.appendChild(infoTitle);

    const makeRow = (label, value) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: "14px",
        padding: "12px 14px",
        borderRadius: "14px",
        background: "rgba(255,255,255,.12)",
        border: "1px solid rgba(255,255,255,.07)",
        alignItems: "center",
      });

      const l = document.createElement("div");
      l.textContent = label;
      Object.assign(l.style, {
        color: "#cbd5e1",
        fontSize: "13px",
        letterSpacing: ".55px",
        textTransform: "uppercase",
        fontWeight: "800",
      });

      const v = document.createElement("div");
      v.textContent = clean(value);
      Object.assign(v.style, {
        fontWeight: "900",
        fontSize: "17px",
        color: "#f8fafc",
        letterSpacing: ".3px",
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
      fontSize: "12px",
      letterSpacing: ".6px",
      fontWeight: "700",
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

  const renderBlob = async (player, opts = {}) => {
    const { scale = EXPORT_SCALE, dpi = DPI } = opts;
    await ensureLibs();
    const serial = serialResolver(player);
    const container = buildContainer(player, serial);
    await waitImages(container);

    const canvas = await window.html2canvas(container, {
      scale,
      useCORS: true,
      backgroundColor: null,
    });
    const rawBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    const blob = await addPngDpi(rawBlob, dpi);
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

  const downloadOnePdf = async (player) => {
    const { blob, serial } = await renderBlob(player);
    const dataUrl = await blobToDataUrl(blob);
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error("jsPDF not loaded");
    const pdf = new jsPDF("portrait", "mm", [CARD_W_MM, CARD_H_MM]);
    pdf.addImage(dataUrl, "PNG", 0, 0, CARD_W_MM, CARD_H_MM, undefined, "FAST");
    pdf.save(`player-profile-card-${serial}-${safe(player.name)}.pdf`);
  };

  const downloadAll = async (players, options = {}) => {
    const { onProgress } = options;
    await ensureLibs();
    const zip = new window.JSZip();
    const total = players.length;
    if (onProgress) {
      onProgress({ phase: "render", current: 0, total, percent: 0 });
    }
    for (let i = 0; i < players.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { blob, serial } = await renderBlob(players[i], { scale: BULK_EXPORT_SCALE, dpi: BULK_DPI });
      // eslint-disable-next-line no-await-in-loop
      const buf = await blob.arrayBuffer();
      zip.file(`player-profile-card-${serial}-${safe(players[i].name)}.png`, buf);
      if (onProgress) {
        onProgress({
          phase: "render",
          current: i + 1,
          total,
          percent: total ? Math.round(((i + 1) / total) * 100) : 0,
          serial,
          name: players[i].name,
        });
      }
    }
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
      ts.getDate()
    ).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(
      2,
      "0"
    )}`;
    const tour = safe(tournamentName || "tournament");
    if (onProgress) {
      onProgress({ phase: "zip", percent: 0 });
    }
    const zipBlob = await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      },
      (metadata) => {
        if (onProgress) {
          onProgress({ phase: "zip", percent: Math.round(metadata.percent || 0) });
        }
      }
    );
    if (onProgress) {
      onProgress({ phase: "zip", percent: 100 });
    }
    window.saveAs(zipBlob, `auctionarena-player-profile-cards-${tour}-${stamp}.zip`);
  };

  const downloadAllPdf = async (players, options = {}) => {
    const { onProgress } = options;
    await ensureLibs();
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error("jsPDF not loaded");
    const zip = new window.JSZip();
    const total = players.length;
    if (onProgress) {
      onProgress({ phase: "render", current: 0, total, percent: 0 });
    }
    for (let i = 0; i < players.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const { blob, serial } = await renderBlob(players[i], { scale: BULK_EXPORT_SCALE, dpi: BULK_DPI });
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await blobToDataUrl(blob);
      const pdf = new jsPDF("portrait", "mm", [CARD_W_MM, CARD_H_MM]);
      pdf.addImage(dataUrl, "PNG", 0, 0, CARD_W_MM, CARD_H_MM, undefined, "FAST");
      const pdfBuffer = pdf.output("arraybuffer");
      zip.file(`player-profile-card-${serial}-${safe(players[i].name)}.pdf`, pdfBuffer);
      if (onProgress) {
        onProgress({
          phase: "render",
          current: i + 1,
          total,
          percent: total ? Math.round(((i + 1) / total) * 100) : 0,
          serial,
          name: players[i].name,
        });
      }
    }
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
      ts.getDate()
    ).padStart(2, "0")}-${String(ts.getHours()).padStart(2, "0")}${String(ts.getMinutes()).padStart(
      2,
      "0"
    )}`;
    const tour = safe(tournamentName || "tournament");
    if (onProgress) {
      onProgress({ phase: "zip", percent: 0 });
    }
    const zipBlob = await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      },
      (metadata) => {
        if (onProgress) {
          onProgress({ phase: "zip", percent: Math.round(metadata.percent || 0) });
        }
      }
    );
    if (onProgress) {
      onProgress({ phase: "zip", percent: 100 });
    }
    window.saveAs(zipBlob, `auctionarena-player-profile-cards-pdf-${tour}-${stamp}.zip`);
  };

  return { renderBlob, downloadOne, downloadOnePdf, downloadAll, downloadAllPdf };
}
