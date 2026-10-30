import React from 'react';
import { act, render, screen } from '@testing-library/react';
import IdleTeamShowcase from './IdleTeamShowcase';

const makeTeams = count => Array.from({ length: count }, (_, id) => ({
    id, name: `Team ${id + 1}`, logo: `${id}.png`,
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('shows all 24 teams over a cycle and changes only one side at a time', () => {
    const teams = makeTeams(24);
    const { container, unmount } = render(<IdleTeamShowcase teams={teams}><div>Tournament</div></IdleTeamShowcase>);
    const names = side => Array.from(container.querySelectorAll(`.aa-idle-teams-${side} img`), img => img.alt);
    const seen = new Set([...names('left'), ...names('right')]);
    let previous = { left: names('left'), right: names('right') };
    for (let tick = 0; tick < 6; tick += 1) {
        act(() => jest.advanceTimersByTime(6000));
        const current = { left: names('left'), right: names('right') };
        expect(current[tick % 2 === 0 ? 'right' : 'left']).toEqual(previous[tick % 2 === 0 ? 'right' : 'left']);
        expect(current.left).toHaveLength(6);
        expect(current.right).toHaveLength(6);
        expect(new Set([...current.left, ...current.right]).size).toBe(12);
        [...current.left, ...current.right].forEach(name => seen.add(name));
        previous = current;
    }
    expect(seen.size).toBe(24);
    expect(screen.getByText('Tournament')).toBeTruthy();
    unmount();
    expect(jest.getTimerCount()).toBe(0);
});

test('keeps all 16 teams visible with eight on each side', () => {
    const { container } = render(<IdleTeamShowcase teams={makeTeams(16)} />);
    const names = () => Array.from(container.querySelectorAll('img'), img => img.alt);
    const initial = names();
    container.querySelectorAll('.aa-idle-teams').forEach(side => {
        expect(side.querySelectorAll('img')).toHaveLength(8);
    });
    act(() => jest.advanceTimersByTime(24000));
    expect(names()).toEqual(initial);
    expect(jest.getTimerCount()).toBe(0);
});

test.each([0, 1, 8, 16, 17, 25, 40])('covers a roster of %i teams without exceeding eight per side', count => {
    const { container } = render(<IdleTeamShowcase teams={makeTeams(count)} />);
    const seen = new Set();
    for (let tick = 0; tick < 12; tick += 1) {
        container.querySelectorAll('.aa-idle-teams').forEach(side => {
            expect(side.querySelectorAll('img').length).toBeLessThanOrEqual(8);
            side.querySelectorAll('img').forEach(img => seen.add(img.alt));
        });
        act(() => jest.advanceTimersByTime(6000));
    }
    expect(seen.size).toBe(count);
});
