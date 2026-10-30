import React, { useEffect, useState } from 'react';
import './IdleTeamShowcase.css';

export function getIdleTeamGroups(teams) {
    if (teams.length <= 16) {
        const midpoint = Math.ceil(teams.length / 2);
        return [teams.slice(0, midpoint), teams.slice(midpoint)];
    }
    const teamsPerSide = teams.length === 24 ? 6 : 8;
    const groupCount = Math.ceil(teams.length / teamsPerSide);
    const groupSize = Math.ceil(teams.length / groupCount);
    return Array.from({ length: groupCount }, (_, index) =>
        teams.slice(index * groupSize, (index + 1) * groupSize));
}

export default function IdleTeamShowcase({ teams, children }) {
    const [step, setStep] = useState(0);
    const rosterKey = teams.map(team => team.id).join(',');
    const groups = getIdleTeamGroups(teams);

    useEffect(() => {
        setStep(0);
        if (groups.length <= 2) return undefined;
        const timer = setInterval(() => setStep(value => value + 1), 6000);
        return () => clearInterval(timer);
    }, [rosterKey, groups.length]);

    // Alternate sides, advancing through the roster without showing a group twice.
    const leftIndex = (2 * Math.ceil(step / 2)) % groups.length;
    const rightIndex = (1 + 2 * Math.floor(step / 2)) % groups.length;

    const renderSide = (index, side) => (
        <div className={`aa-idle-teams aa-idle-teams-${side}`}>
            <div key={`${side}-${index}-${rosterKey}`} className="aa-idle-team-group">
                {groups[index].map((team, position) => (
                    <div key={team.id} className="aa-idle-team" style={{ '--team-delay': `${position * 45}ms` }}>
                        <div className="aa-idle-team-badge">
                            {team.logo ? (
                                <img
                                    src={`https://ik.imagekit.io/auctionarena2/uploads/teams/logos/${team.logo}?tr=w-240,h-240`}
                                    alt={team.name}
                                    onError={event => {
                                        event.currentTarget.onerror = null;
                                        event.currentTarget.src = '/AuctionArena2.png';
                                    }}
                                />
                            ) : <span>{team.name?.slice(0, 2).toUpperCase() || 'EA'}</span>}
                        </div>
                        <div className="aa-idle-team-name">{team.name}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="aa-idle-showcase absolute inset-0 z-10">
            {renderSide(leftIndex, 'left')}
            {children}
            {renderSide(rightIndex, 'right')}
            <div className="aa-idle-roster-label">
                {teams.length} TEAMS {groups.length > 2 && <span> · TEAM SHOWCASE</span>}
            </div>
        </div>
    );
}
