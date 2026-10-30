// Render the poster independently of the viewport so mobile and fullscreen exports match.
const COLORS = ["#78d7ff", "#c3a0ff", "#ffba78", "#83e5ba", "#ff91b7", "#ffe18a"];
const initials = name => String(name || "").split(" ").map(word => word[0]).join("").slice(0, 3).toUpperCase();
function loadLogo(src) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 4000);
    image.crossOrigin = "anonymous";
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = src;
  });
}
function wrap(context, text, width) {
  const lines = [];
  let line = "";
  for (const character of String(text || "")) {
    if (line && context.measureText(line + character).width > width) {
      const space = line.lastIndexOf(" ");
      if (space > 0) { lines.push(line.slice(0, space).trim()); line = line.slice(space + 1); }
      else { lines.push(line.trim()); line = ""; }
    }
    line += character;
  }
  if (line) lines.push(line.trim());
  return lines.length ? lines : [""];
}
function contain(context, image, x, y, size) {
  const ratio = Math.min(size / image.width, size / image.height);
  context.drawImage(image, x + (size - image.width * ratio) / 2, y + (size - image.height * ratio) / 2, image.width * ratio, image.height * ratio);
}
export async function downloadGroupDrawPoster({ title, slug, tournamentLogo, groups, orderIndex = {} }) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Poster downloads are unavailable in this browser.");
  const entries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  const logos = new Map(await Promise.all(entries.flatMap(([, teams]) => teams).map(async team => [String(team.id), await loadLogo(team.logo ? `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}` : null)])));
  const logo = await loadLogo(tournamentLogo ? `https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournamentLogo}` : null);
  const width = 1800, padding = 80, gap = 30, columns = entries.length <= 4 ? Math.min(entries.length, 2) || 1 : 3;
  const cardWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  context.font = "600 28px Arial";
  const cards = entries.map(([letter, teams], index) => {
    const members = [...teams].sort((a, b) => (orderIndex[a.id] ?? Infinity) - (orderIndex[b.id] ?? Infinity));
    const rows = members.map(team => ({ team, lines: wrap(context, team.name, cardWidth - 128) }));
    return { letter, rows, color: COLORS[index % COLORS.length], height: 150 + rows.reduce((sum, row) => sum + Math.max(88, row.lines.length * 36 + 30), 0) };
  });
  context.font = "800 68px Arial";
  const titleLines = wrap(context, title || slug, width - padding * 2 - (logo ? 160 : 0));
  const headerHeight = 170 + titleLines.length * 80;
  const rowHeights = [];
  for (let i = 0; i < cards.length; i += columns) rowHeights.push(Math.max(...cards.slice(i, i + columns).map(card => card.height)));
  canvas.width = width;
  canvas.height = headerHeight + rowHeights.reduce((a, b) => a + b + gap, 0) + 130;
  context.fillStyle = "#0b121c"; context.fillRect(0, 0, width, canvas.height);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, width);
  glow.addColorStop(0, "#203443"); glow.addColorStop(1, "#0b121c");
  context.fillStyle = glow; context.fillRect(0, 0, width, canvas.height);
  context.fillStyle = "#e9ce89"; context.font = "700 24px Arial";
  context.fillText("THE OFFICIAL GROUP DRAW  /  FINAL LINEUP", padding, 80);
  context.fillStyle = "#f3f4f6"; context.font = "800 68px Arial";
  titleLines.forEach((line, index) => context.fillText(line, padding, 170 + index * 80));
  if (logo) contain(context, logo, width - padding - 130, 100, 130);
  let top = headerHeight;
  cards.forEach((card, index) => {
    const column = index % columns;
    if (index && !column) top += rowHeights[index / columns - 1] + gap;
    const x = padding + column * (cardWidth + gap);
    const height = rowHeights[Math.floor(index / columns)];
    context.fillStyle = "#14202d"; context.fillRect(x, top, cardWidth, height);
    context.fillStyle = card.color; context.fillRect(x, top, cardWidth, 5);
    context.font = "800 42px Arial"; context.fillText(`GROUP ${card.letter}`, x + 25, top + 68);
    context.fillStyle = "#b8c6d5"; context.font = "400 21px Arial";
    context.fillText(`${card.rows.length} TEAMS`, x + 25, top + 107);
    let y = top + 135;
    card.rows.forEach(({ team, lines }) => {
      const height = Math.max(88, lines.length * 36 + 30);
      context.fillStyle = "#1c2b3b"; context.fillRect(x + 20, y, cardWidth - 40, height - 10);
      const image = logos.get(String(team.id));
      if (image) contain(context, image, x + 32, y + (height - 66) / 2, 56);
      else { context.fillStyle = card.color; context.font = "700 19px Arial"; context.fillText(initials(team.name), x + 32, y + height / 2 + 2); }
      context.fillStyle = "#f3f4f6"; context.font = "600 28px Arial";
      lines.forEach((line, i) => context.fillText(line, x + 104, y + (height - lines.length * 36) / 2 + 26 + i * 36));
      y += height;
    });
  });
  context.fillStyle = "#e9ce89"; context.font = "700 24px Arial";
  context.fillText("EA ARENA", padding, canvas.height - 55);
  context.fillStyle = "#b8c6d5"; context.font = "400 22px Arial";
  context.textAlign = "right"; context.fillText("THE STAGE IS SET. LET RIVALRIES BEGIN.  /  eaarena.in", width - padding, canvas.height - 55);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Unable to create the poster. Please try again.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `${String(slug || "tournament").replace(/[^a-z0-9_-]/gi, "-")}-group-draw.png`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
