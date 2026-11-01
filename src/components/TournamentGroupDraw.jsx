import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import CONFIG from "./config";
import { downloadGroupDrawPoster } from "../utils/groupDrawPoster";
import "./TournamentGroupDraw.css";

const API = CONFIG.API_BASE_URL;
const COLORS = ["#78d7ff", "#c3a0ff", "#ffba78", "#83e5ba", "#ff91b7", "#ffe18a"];
const FLAGS = ["Badgers", "Blasters", "Fighters", "Kings", "Knights", "Lions", "Royals", "Titans"];
const initials = (name = "") => name.split(" ").map(word => word[0]).join("").slice(0, 3).toUpperCase();
function Crest({ team, className = "" }) {
  const [failed, setFailed] = useState(false);
  const name = team?.name || "";
  const src = team?.logo
    ? `https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}`
    : FLAGS.includes(name) ? `${process.env.PUBLIC_URL || ""}/${name.toLowerCase()}-flag.png` : null;
  return <span className={`draw-crest ${className}`}>
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span>{initials(name) || "✦"}</span>}
  </span>;
}
async function request(path, options) {
  const response = await fetch(`${API}/api/${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load the draw. Please try again.");
  return data;
}
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function TournamentGroupDraw() {
  const { tournamentSlug } = useParams();
  const [tournament, setTournament] = useState(null);
  const [teams, setTeams] = useState([]);
  const [board, setBoard] = useState({ groups: {}, orderIndex: {} });
  const [groupsCount, setGroupsCount] = useState(6);
  const [phase, setPhase] = useState("idle");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(null);
  const [targetGroup, setTargetGroup] = useState(null);
  const [ticker, setTicker] = useState(0);
  const [flight, setFlight] = useState(null);
  const [presentation, setPresentation] = useState(false);
  const [sound, setSound] = useState(false);
  const [presentationNotice, setPresentationNotice] = useState("");
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const soundRef = useRef(false);
  const [finale, setFinale] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [posterError, setPosterError] = useState("");
  const exportBusy = useRef(false);
  const finaleRef = useRef(null);
  const busy = useRef(false);
  const version = useRef(0);
  const stageRef = useRef(null);
  const groupRefs = useRef({});
  const reducedMotion = useRef(false);
  const active = ["assigning", "shuffling", "slowing", "reveal", "flying", "resetting"].includes(phase);
  const assigned = useMemo(() => new Set(Object.values(board.groups).flat().map(team => String(team.id))), [board]);
  const pool = useMemo(() => teams.filter(team => !assigned.has(String(team.id))), [teams, assigned]);
  const letters = Array.from({ length: groupsCount }, (_, i) => String.fromCharCode(65 + i));
  const complete = ready && teams.length > 0 && pool.length === 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, reducedMotion.current ? Math.min(ms, 100) : ms));

  useEffect(() => {
    const current = ++version.current;
    const controller = new AbortController();
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    busy.current = false;
    setFinale(false); setCelebrating(false); setPosterError("");
    setReady(false); setError(""); setReveal(null); setTargetGroup(null); setFlight(null); setPhase("idle");
    setTournament(null); setTeams([]); setBoard({ groups: {}, orderIndex: {} }); setGroupsCount(6);
    (async () => {
      try {
        const options = { signal: controller.signal };
        const [info, groups] = await Promise.all([
          request(`tournaments/slug/${tournamentSlug}`, options),
          request(`tournaments/${tournamentSlug}/groups`, options),
        ]);
        const result = await request(`teams?tournament_id=${info.id}`, options);
        if (version.current !== current) return;
        setTournament(info); setTeams(Array.isArray(result) ? result : result.teams || []);
        setBoard({ groups: groups.groups || {}, orderIndex: groups.orderIndex || {} });
        const used = Object.keys(groups.groups || {});
        if (used.length) setGroupsCount(Math.max(2, ...used.map(letter => letter.charCodeAt(0) - 64)));
        setReady(true);
      } catch (err) { if (version.current === current && err.name !== "AbortError") setError(err.message); }
    })();
    return () => { controller.abort(); version.current = current + 1; };
  }, [tournamentSlug]);

  useEffect(() => {
    if (phase !== "shuffling" && phase !== "slowing") return;
    const timer = setInterval(() => setTicker(i => i + 1), phase === "slowing" ? 290 : 95);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const syncFullscreen = () => {
      if (document.fullscreenElement !== rootRef.current) setPresentation(false);
    };
    const handleEscape = event => {
      if (event.key === "Escape") setPresentation(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", handleEscape);
      if (audioRef.current) audioRef.current.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!complete) { setFinale(false); setCelebrating(false); return; }
    const timer = setTimeout(() => {
      setFinale(true);
      if (phase === "landed" && !reducedMotion.current) setCelebrating(true);
    }, phase === "landed" ? (reducedMotion.current ? 100 : 1400) : 0);
    return () => clearTimeout(timer);
  }, [complete, phase]);

  useEffect(() => {
    if (!finale) return;
    finaleRef.current?.focus({ preventScroll: true });
    rootRef.current?.scrollTo?.({ top: 0, behavior: "instant" });
    if (!document.fullscreenElement) window.scrollTo?.({ top: 0, behavior: "instant" });
  }, [finale]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = setTimeout(() => setCelebrating(false), 2600);
    return () => clearTimeout(timer);
  }, [celebrating]);

  async function downloadPoster() {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setExporting(true); setPosterError("");
    const current = version.current;
    try {
      await downloadGroupDrawPoster({ title: tournament?.title || tournamentSlug, slug: tournamentSlug,
        tournamentLogo: tournament?.logo, groups: Object.fromEntries(letters.map(letter => [letter, board.groups[letter] || []])), orderIndex: board.orderIndex });
    } catch (err) { if (current === version.current) setPosterError(err.message || "Unable to download the poster. Please try again."); }
    finally { exportBusy.current = false; if (current === version.current) setExporting(false); }
  }

  async function togglePresentation() {
    setPresentationNotice("");
    if (presentation) {
      setPresentation(false);
      if (document.fullscreenElement === rootRef.current) {
        try { await document.exitFullscreen(); } catch { /* The in-page view is already restored. */ }
      }
      return;
    }
    setPresentation(true);
    try {
      if (!rootRef.current?.requestFullscreen) throw new Error("Fullscreen unavailable");
      await rootRef.current.requestFullscreen();
    } catch {
      setPresentationNotice("Fullscreen is unavailable. Presentation layout is active; press Esc or Exit presentation to return.");
    }
  }

  function unlockAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Audio unavailable");
      if (!audioRef.current) audioRef.current = new AudioContext();
      audioRef.current.resume().catch(() => {});
      return true;
    } catch {
      setSound(false);
      setPresentationNotice("Sound effects are unavailable in this browser.");
      return false;
    }
  }

  function playCue(kind) {
    const context = audioRef.current;
    if (!soundRef.current || !context || context.state !== "running") return;
    try {
      const notes = kind === "reveal" ? [523.25, 659.25, 783.99] : kind === "land" ? [1046.5] : [220, 330];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * .12;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.065, start + .015);
        gain.gain.exponentialRampToValueAtTime(.001, start + .35);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + .4);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Audio never interrupts the draw. */ }
  }

  async function draw() {
    if (busy.current || !ready || !pool.length) return;
    busy.current = true;
    if (sound) unlockAudio();
    playCue("draw");
    const current = version.current;
    const valid = () => version.current === current;
    const lastTeam = pool.length === 1;
    setError(""); setReveal(null); setTargetGroup(null); setPhase(lastTeam ? "assigning" : "shuffling");
    try {
      // Fetch the real result immediately, but keep it off the board until its reveal lands.
      const [result] = await Promise.all([
        request(`tournaments/${tournamentSlug}/assign-one`, post({ groupsCount })).then(result => {
          if (valid() && !result.done) setTargetGroup(result.letter);
          return result;
        }), sleep(lastTeam ? 0 : 1900),
      ]);
      if (!valid()) return;
      if (result.done) {
        const next = await request(`tournaments/${tournamentSlug}/groups`);
        if (valid()) { setBoard({ groups: next.groups || {}, orderIndex: next.orderIndex || {} }); setPhase("idle"); }
        return;
      }
      if (!lastTeam) { setPhase("slowing"); await sleep(850); }
      if (!valid()) return;
      setReveal(result); setPhase("reveal"); playCue("reveal");
      await sleep(lastTeam ? 500 : 1700);
      if (!valid()) return;
      const source = stageRef.current?.getBoundingClientRect();
      const destination = groupRefs.current[result.letter]?.getBoundingClientRect();
      if (source && destination && !reducedMotion.current) {
        setFlight({ team: result.team, x: source.x + source.width / 2 - 48, y: source.y + source.height / 2 - 48,
          dx: destination.x + destination.width / 2 - (source.x + source.width / 2),
          dy: destination.y + Math.min(destination.height / 2, 120) - (source.y + source.height / 2) });
      }
      setPhase("flying"); await sleep(850);
      if (!valid()) return;
      setBoard(previous => {
        const existing = previous.groups[result.letter] || [];
        return { groups: { ...previous.groups, [result.letter]: [...existing.filter(t => String(t.id) !== String(result.team.id)), result.team] },
          orderIndex: { ...previous.orderIndex, [result.team.id]: Object.keys(previous.orderIndex).length + teams.length } };
      });
      setGroupsCount(count => Math.max(count, result.letter.charCodeAt(0) - 64));
      setFlight(null); setPhase("landed"); playCue("land");
    } catch (err) { if (valid()) { setError(`${err.message} Reload the page before retrying if the connection was interrupted.`); setTargetGroup(null); setPhase("idle"); } }
    finally { if (valid()) busy.current = false; }
  }

  async function reset() {
    if (busy.current || !window.confirm("Clear all group assignments for this tournament?")) return;
    busy.current = true;
    const current = version.current;
    setPhase("resetting"); setTargetGroup(null); setError("");
    try {
      await request(`tournaments/${tournamentSlug}/reset-groups`, post({}));
      if (current === version.current) { setBoard({ groups: {}, orderIndex: {} }); setReveal(null); }
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { if (current === version.current) { busy.current = false; setPhase("idle"); } }
  }

  const featured = reveal?.team || pool[ticker % Math.max(pool.length, 1)];
  const showingResult = reveal && ["reveal", "flying", "landed"].includes(phase);
  const drawNumber = Math.min(teams.length, assigned.size + (active && phase !== "resetting" ? 1 : 0));
  return <main ref={rootRef} className={`group-draw draw-board-layout ${presentation ? "draw-presentation" : ""} ${finale ? "draw-finale" : ""}`}>
    <div className="draw-video-background" aria-hidden="true">
      <video src={`${process.env.PUBLIC_URL || ""}/bg15.mp4`} autoPlay muted loop playsInline preload="metadata" tabIndex={-1} />
    </div>
    <header className="draw-header">
      <div className="draw-tournament">
        {tournament?.logo && <img className="draw-tournament-logo" src={`https://ik.imagekit.io/auctionarena2/uploads/tournaments/${tournament.logo}`} alt="Tournament logo" />}
        <div><p className="draw-eyebrow">THE OFFICIAL GROUP DRAW</p><h1>{tournament?.title || tournamentSlug}</h1></div>
      </div>
      <div className="draw-brand"><img src={`${process.env.PUBLIC_URL || ""}/AuctionArena2.png`} alt="EA Arena" /><span>POWERED BY <strong>EA ARENA</strong></span></div>
    </header>
    <div className="draw-host-toolbar" aria-label="Presentation controls">
      {!presentation && !finale && <div className="draw-settings"><label>Groups <select aria-label="Number of groups" value={groupsCount} onChange={event => setGroupsCount(Number(event.target.value))} disabled={!ready || active || assigned.size > 0}>{Array.from({ length: 11 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}</select></label><button onClick={reset} disabled={!ready || active || !assigned.size}>Reset draw</button></div>}
      <button className="draw-toolbar-button" aria-pressed={sound} onClick={() => {
        if (sound) { soundRef.current = false; setSound(false); audioRef.current?.suspend().catch(() => {}); }
        else if (unlockAudio()) { soundRef.current = true; setSound(true); }
      }}>Sound {sound ? "on" : "off"}</button>
      <button className="draw-toolbar-button" aria-pressed={presentation} onClick={togglePresentation}>{presentation ? "Exit presentation" : "Present fullscreen"}</button>
    </div>
    {presentationNotice && <p className="draw-presentation-notice" role="status">{presentationNotice}</p>}
    {error && <div className="draw-error" role="alert">{error}</div>}
    {finale && <section className="draw-finale-banner" aria-labelledby="draw-finale-title">
      <p className="draw-eyebrow">THE DRAW IS COMPLETE</p>
      <h2 id="draw-finale-title" ref={finaleRef} tabIndex={-1}>The groups are set.<br /><span>Let the rivalries begin.</span></h2>
      <p>{teams.length} teams. {groupsCount} groups. One trophy.</p>
      <div className="draw-finale-actions"><button className="draw-button" onClick={downloadPoster} disabled={exporting}>{exporting ? "Creating poster?" : "Download draw poster"}<span aria-hidden="true">?</span></button>
        {!presentation && <button className="draw-toolbar-button" onClick={reset} disabled={active || exporting}>Reset draw</button>}</div>
      {posterError && <p className="draw-error" role="alert">{posterError}</p>}
    </section>}
    {celebrating && <div className="draw-confetti draw-finale-confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ "--i": i / 2, "--confetti-color": COLORS[i % COLORS.length] }} />)}</div>}
    <div className="draw-layout" style={{ "--draw-side-rows": Math.ceil(groupsCount / 2) }}>
      {!finale && <section className={`draw-stage draw-phase-${phase}`} aria-label="Team draw stage">
        <div className="draw-progress" aria-live="polite" aria-atomic="true">
          <span>{!ready ? "Preparing draw" : complete ? `Draw complete ? ${teams.length} teams assigned` : `${drawNumber ? 'Draw ' + drawNumber : 'Ready'} of ${teams.length} ? ${pool.length} teams remaining`}</span>
          <div role="progressbar" aria-label="Teams assigned" aria-valuemin={0} aria-valuemax={Math.max(teams.length, 1)} aria-valuenow={assigned.size}><span style={{ width: `${teams.length ? assigned.size / teams.length * 100 : 0}%` }} /></div>
        </div>
        <div className="draw-stage-top"><span className="draw-eyebrow">THE DRAW STAGE</span><span className="draw-edition">GROUP SELECTION</span></div>
        <div className="draw-spotlight" aria-hidden="true" />
        <div className="draw-orbit draw-orbit-one" aria-hidden="true" /><div className="draw-orbit draw-orbit-two" aria-hidden="true" />
        <div className="draw-stage-content" ref={stageRef}>
          <p className="draw-stage-kicker">{showingResult ? "THE NEXT CHAPTER BEGINS" : phase === "shuffling" || phase === "slowing" ? "WHO WILL IT BE?" : "EVERY GREAT RIVALRY STARTS HERE"}</p>
          <div className="draw-carousel">
            {!showingResult && pool.length > 1 && <div className="draw-side-crest draw-side-left" aria-hidden="true"><Crest key={pool[(ticker + pool.length - 1) % pool.length]?.id} team={pool[(ticker + pool.length - 1) % pool.length]} /></div>}
            <div className="draw-hero-crest" key={showingResult ? `reveal-${featured?.id}` : `tick-${ticker}`}><Crest key={featured?.id} team={featured} /></div>
            {!showingResult && pool.length > 1 && <div className="draw-side-crest draw-side-right" aria-hidden="true"><Crest key={pool[(ticker + 1) % pool.length]?.id} team={pool[(ticker + 1) % pool.length]} /></div>}
          </div>
          <div className="draw-announcement" aria-live="polite" aria-atomic="true">
            <h2>{showingResult ? featured.name : phase === "shuffling" || phase === "slowing" ? "Finding their place…" : !ready ? "Preparing the stage" : complete ? "The groups are set" : "Let the draw begin"}</h2>
            {showingResult ? <p className="draw-destination" style={{ "--group-accent": COLORS[(reveal.letter.charCodeAt(0) - 65) % COLORS.length] }}>JOINS <strong>GROUP {reveal.letter}</strong></p> : <p className="draw-stage-hint">{complete ? "All teams have been assigned to their groups." : "One team. One reveal. A new rivalry."}</p>}
          </div>
        </div>
        {phase === "reveal" && <div className="draw-confetti" aria-hidden="true">{Array.from({ length: 20 }, (_, i) => <i key={i} style={{ "--i": i, "--confetti-color": COLORS[i % COLORS.length] }} />)}</div>}
        <div className="draw-controls">
          <button className="draw-button" onClick={draw} disabled={!ready || active || !pool.length}>{phase === "assigning" ? "Assigning final team..." : phase === "shuffling" || phase === "slowing" ? "Drawing a team…" : phase === "reveal" || phase === "flying" ? "Taking their place…" : complete ? "Draw complete" : "Draw next team"}<span aria-hidden="true">↗</span></button>
        </div>
      </section>}
      <section className="draw-board" aria-label="Tournament groups">
        <div className="draw-board-heading"><div><p className="draw-eyebrow">THE ROAD AHEAD</p><h2>{finale ? "The final lineup" : "Your groups. Your rivals."}</h2></div><span className="draw-board-mark" aria-hidden="true">✦</span></div>
        <div className="draw-groups">{letters.map((letter, index) => {
          const members = [...(board.groups[letter] || [])].sort((a, b) => (board.orderIndex[a.id] ?? Infinity) - (board.orderIndex[b.id] ?? Infinity));
          const capacity = Math.max(members.length, Math.floor(teams.length / groupsCount) + (index < teams.length % groupsCount ? 1 : 0));
          const highlighted = targetGroup === letter && (active || phase === "landed") && !finale;
          return <article key={letter} aria-label={`Group ${letter}`} ref={node => { groupRefs.current[letter] = node; }} className={`draw-group ${highlighted ? "draw-group-active" : ""} ${highlighted && active ? "draw-group-drawing" : ""}`} style={{ "--group-accent": COLORS[index % COLORS.length], "--group-index": index, "--draw-group-column": index < Math.ceil(groupsCount / 2) ? 1 : 3, "--draw-group-row": index % Math.ceil(groupsCount / 2) + 2 }}>
            <header><div><span className="draw-group-caption">GROUP</span><h3>{letter}</h3></div><span className="draw-group-count">{members.length} / {capacity} teams</span></header>
            {highlighted && <p className="draw-group-status" role="status">{phase === "landed" ? "LATEST TEAM ADDED" : "DRAWING INTO THIS GROUP"}</p>}
            <ul>{members.map(team => <li key={team.id} className={reveal?.team.id === team.id && phase === "landed" ? "draw-team-new" : ""}><Crest team={team} /><span>{team.name}</span>{!finale && reveal?.team.id === team.id && phase === "landed" && <span className="draw-new-tag">NEW</span>}</li>)}
              {Array.from({ length: Math.max(0, capacity - members.length) }, (_, slot) => <li className="draw-empty-slot" key={`empty-${slot}`}><span className="draw-slot-symbol">{String(members.length + slot + 1).padStart(2, "0")}</span><span>Open slot</span></li>)}
              {!teams.length && <li className="draw-empty-slot">{ready ? "No teams registered" : "Loading teams…"}</li>}
            </ul>
          </article>;
        })}</div>
      </section>
    </div>
    {!finale && <section className="draw-remaining" aria-label="Remaining teams">
      <div className="draw-remaining-heading"><h2>Still in the draw</h2><span>{pool.length} {pool.length === 1 ? "team" : "teams"} remaining</span></div>
      {pool.length ? <ul>{pool.map(team => <li key={team.id}><Crest team={team} /><span>{team.name}</span></li>)}</ul> : <p>{ready ? "Every team has found its group." : "Loading the team lineup?"}</p>}
    </section>}
    <footer className="draw-footer"><span>EA ARENA</span><span>THE STAGE IS SET. LET RIVALRIES BEGIN.</span><a href="https://www.eaarena.in" target="_blank" rel="noreferrer">eaarena.in ↗</a></footer>
    {flight && <div className="draw-flying-crest" style={{ left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px` }}><Crest team={flight.team} /></div>}
  </main>;
}
