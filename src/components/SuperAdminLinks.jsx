import React, { useEffect, useMemo, useState } from 'react';
import { normalizeSlug, renderSlugTemplate } from '../utils/slugUtils';
import CONFIG from './config';

const API = CONFIG.API_BASE_URL;
const STORAGE_KEY = 'eaArenaSelectedTournamentSlug';

const ADMIN_LINKS = [
  {
    id: 'admin-panel',
    description: 'Private-Panel for Admin to conduct the auction',
    hrefTemplate: 'https://live.eaarena.in/2709/{slug}',
  },
  {
    id: 'spectator-tv',
    description: 'Private- UI for television view[Used to cast on big screens or youtube]',
    hrefTemplate: 'https://live.eaarena.in/spectator4/{slug}',
  },
  {
    id: 'youtube-stream',
    description: 'UI for youtube overlay',
    hrefTemplate: 'https://live.eaarena.in/spectator5/{slug}',
  },
  {
    id: 'public-dashboard',
    description: 'Public-Share with auction team owners for live updates',
    hrefTemplate: 'https://live.eaarena.in/tournament/{slug}',
  },
  {
    id: 'admin-link-players',
    description: 'Private- Player link for admin to add, delete or update player details',
    hrefTemplate: 'https://registration.eaarena.in/super/{slug}/players',
  },
   {
    id: 'admin-link-teams',
    description: 'Private- Manage teams for a tournament',
    hrefTemplate: 'https://registration.eaarena.in/super/{slug}/teams',
  },
  {
    id: 'auctioneer-view',
    description: 'UI for Auctioneer to conduct the auction smoothly',
    hrefTemplate: 'https://live.eaarena.in/spectator6/{slug}',
  }
];

const pageStyle = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top, #0f172a, #020617)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
};

const cardStyle = {
  width: '100%',
  maxWidth: '760px',
  background: 'rgba(2, 6, 23, 0.9)',
  borderRadius: '22px',
  boxShadow: '0 25px 60px rgba(2, 6, 23, 0.65)',
  padding: '2.5rem',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  color: '#f1f5f9',
};

const selectStyle = {
  width: '100%',
  marginTop: '0.5rem',
  marginBottom: '1.5rem',
  borderRadius: '0.75rem',
  padding: '0.85rem',
  fontSize: '1rem',
  border: '1px solid rgba(148, 163, 184, 0.4)',
  background: '#0f172a',
  color: '#e2e8f0',
};

const linkGridStyle = {
  display: 'grid',
  gap: '1.25rem',
};

const linkCardStyle = {
  padding: '1.25rem',
  borderRadius: '1.25rem',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(15, 23, 42, 0.8)',
};

const linkDescriptionStyle = {
  fontSize: '0.8rem',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  marginBottom: '0.4rem',
};

const linkAnchorStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: '#38bdf8',
  fontWeight: 600,
  textDecoration: 'none',
  wordBreak: 'break-word',
};

const disabledTextStyle = {
  color: '#94a3b8',
  fontStyle: 'italic',
};

const statusTextStyle = {
  marginTop: '0.35rem',
  fontSize: '0.85rem',
};

const linkControlsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
  marginTop: '0.75rem',
};

const linkPillButtonStyle = {
  borderRadius: '999px',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'rgba(15, 23, 42, 0.7)',
  padding: '0.2rem 0.85rem',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#f8fafc',
  cursor: 'pointer',
  textDecoration: 'none',
};

const copyStatusStyle = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#34d399',
};

const getInitialSlug = () => {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const SuperAdminLinks = () => {
  const [tournaments, setTournaments] = useState([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(() => getInitialSlug());
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  useEffect(() => {
    if (!copiedLinkId) return;
    const timer = setTimeout(() => setCopiedLinkId(null), 1800);
    return () => clearTimeout(timer);
  }, [copiedLinkId]);

  const normalizedSlug = normalizeSlug(selectedSlug);

  useEffect(() => {
    try {
      if (normalizedSlug) {
        localStorage.setItem(STORAGE_KEY, normalizedSlug);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage write errors
    }
  }, [normalizedSlug]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadTournaments = async () => {
      setLoadingTournaments(true);
      setFetchError(null);

      try {
        const response = await fetch(`${API}/api/tournaments`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const data = await response.json();
        if (isMounted) {
          setTournaments(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!isMounted || error.name === 'AbortError') return;
        setFetchError(error.message || 'Unable to load tournaments');
        setTournaments([]);
      } finally {
        if (isMounted) {
          setLoadingTournaments(false);
        }
      }
    };

    loadTournaments();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const dropdownOptions = useMemo(() => {
    const dynamicOptions = tournaments
      .filter((tournament) => normalizeSlug(tournament?.slug))
      .map((tournament) => ({
        label: tournament?.title || tournament?.name || tournament?.slug,
        slug: normalizeSlug(tournament?.slug) ?? '',
      }));

    return [{ label: 'Select a tournament', slug: '' }, ...dynamicOptions];
  }, [tournaments]);

  const resolvedLinks = useMemo(
    () =>
      ADMIN_LINKS.map((link) => ({
        ...link,
        href: renderSlugTemplate(link.hrefTemplate, normalizedSlug),
      })),
    [normalizedSlug]
  );

  const handleCopyLink = async (href, linkId) => {
    if (!href) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = href;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        return;
      }
    }
    setCopiedLinkId(linkId);
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Super Admin - EA Arena</h1>
          <p style={{ color: '#cbd5f5' }}>
            Pick a tournament to quickly open the admin tools with the correct slug.
          </p>
        </header>

        <label htmlFor="ea-arena-tournament-select" style={{ fontWeight: 600 }}>
          Tournament
        </label>
        <select
          id="ea-arena-tournament-select"
          style={selectStyle}
          value={selectedSlug}
          onChange={(event) => setSelectedSlug(event.target.value)}
        >
          {dropdownOptions.map((option, index) => (
            <option key={option.slug || `placeholder-${index}`} value={option.slug}>
              {option.label}
            </option>
          ))}
        </select>
        {loadingTournaments && (
          <div style={{ ...statusTextStyle, color: '#cbd5f5' }}>Loading tournaments…</div>
        )}
        {!loadingTournaments && fetchError && (
          <div style={{ ...statusTextStyle, color: '#f87171' }}>
            {fetchError || 'Failed to load tournaments'}
          </div>
        )}

        <div style={{ marginBottom: '1.5rem', color: '#94a3b8' }}>
          <strong>Current slug: </strong>
          <code
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '0.3rem 0.5rem',
              borderRadius: '0.5rem',
            }}
          >
            {normalizedSlug || '{slug}'}
          </code>
        </div>

        <div style={linkGridStyle}>
          {resolvedLinks.map((link) => (
            <div key={link.id} style={linkCardStyle}>
              <div style={linkDescriptionStyle}>{link.description}</div>
              {normalizedSlug ? (
                <>
                  <a href={link.href} target="_blank" rel="noreferrer" style={linkAnchorStyle}>
                    {link.href}
                  </a>
                  <div style={linkControlsStyle}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      style={linkPillButtonStyle}
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      style={linkPillButtonStyle}
                      onClick={() => handleCopyLink(link.href, link.id)}
                    >
                      Copy
                    </button>
                    {copiedLinkId === link.id && <span style={copyStatusStyle}>Copied!</span>}
                  </div>
                </>
              ) : (
                <div style={disabledTextStyle}>Choose a tournament to activate the link.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLinks;
