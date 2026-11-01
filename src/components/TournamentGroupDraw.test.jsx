import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import TournamentGroupDraw from "./TournamentGroupDraw";
import { downloadGroupDrawPoster } from "../utils/groupDrawPoster";

jest.mock("react-router-dom", () => ({ useParams: () => ({ tournamentSlug: "kcl1" }) }), { virtual: true });

jest.mock("../utils/groupDrawPoster", () => ({ downloadGroupDrawPoster: jest.fn() }));

const teams = [{ id: 1, name: "Titans" }, { id: 2, name: "Royals" }];
function mount() {
  return render(<TournamentGroupDraw />);
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
async function advance(ms) { await act(async () => { jest.advanceTimersByTime(ms); }); }
beforeEach(() => {
  jest.useFakeTimers();
  window.scrollTo = jest.fn();
  downloadGroupDrawPoster.mockReset();
  downloadGroupDrawPoster.mockResolvedValue(undefined);
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => {
    if (url.includes("/slug/")) return { id: 1, title: "KCL Season 1" };
    if (url.includes("/assign-one")) return { team: teams[0], letter: "B" };
    if (url.includes("/groups")) return { groups: {}, orderIndex: {} };
    if (url.includes("/reset-groups")) return { ok: true };
    return teams;
  } }));
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); delete global.fetch; });

test("keeps the result off the board until the reveal lands and prevents overlapping draws", async () => {
  mount(); await flush();
  const button = screen.getByRole("button", { name: /draw next team/i });
  fireEvent.click(button); fireEvent.click(button);
  await flush();
  expect(global.fetch.mock.calls.filter(([url]) => url.includes("assign-one"))).toHaveLength(1);
  const group = screen.getByRole("article", { name: "Group B" });
  expect(group).toHaveClass("draw-group-active");
  expect(within(group).getByRole("status")).toHaveTextContent("DRAWING INTO THIS GROUP");
  expect(screen.getByRole("article", { name: "Group A" })).not.toHaveClass("draw-group-active");
  expect(within(group).queryByText("Titans")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reset draw/i })).toBeDisabled();
  await advance(1900); await advance(850);
  expect(screen.getByRole("heading", { name: "Titans" })).toBeInTheDocument();
  expect(within(group).queryByText("Titans")).not.toBeInTheDocument();
  await advance(1700); await advance(850);
  expect(within(group).getByText("Titans")).toBeInTheDocument();
  expect(within(group).getByRole("status")).toHaveTextContent("LATEST TEAM ADDED");
  expect(screen.getByRole("button", { name: /draw next team/i })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: /number of groups/i })).toBeDisabled();
});

test("failed assignments leave the board unchanged and recover controls", async () => {
  const fetchMock = global.fetch;
  mount(); await flush();
  fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: "Draw unavailable" }) }));
  fireEvent.click(screen.getByRole("button", { name: /draw next team/i }));
  await flush();
  expect(screen.getByRole("alert")).toHaveTextContent("Draw unavailable");
  expect(screen.getByRole("button", { name: /draw next team/i })).toBeEnabled();
  const board = screen.getByRole("region", { name: "Tournament groups" });
  expect(within(board).queryByText("Titans")).not.toBeInTheDocument();
});


test("updates progress and the remaining lineup only after landing", async () => {
  mount(); await flush();
  const remaining = screen.getByRole("region", { name: "Remaining teams" });
  expect(within(remaining).getByText("Titans")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  fireEvent.click(screen.getByRole("button", { name: /draw next team/i }));
  await flush(); await advance(1900); await advance(850);
  expect(within(remaining).getByText("Titans")).toBeInTheDocument();
  await advance(1700); await advance(850);
  expect(within(remaining).queryByText("Titans")).not.toBeInTheDocument();
  expect(within(remaining).getByText("Royals")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByRole("heading", { name: "Titans" })).toBeInTheDocument();
});

test("presentation hides host setup and Escape restores it when fullscreen is unavailable", async () => {
  mount(); await flush();
  fireEvent.click(screen.getByRole("button", { name: /present fullscreen/i }));
  await flush();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /reset draw/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /draw next team/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /exit presentation/i })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Fullscreen is unavailable");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("combobox")).toBeInTheDocument();
});

test("synchronizes presentation mode when the browser exits fullscreen", async () => {
  const requestFullscreen = jest.fn(async function () {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: this });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
  try {
    mount(); await flush();
    fireEvent.click(screen.getByRole("button", { name: /present fullscreen/i }));
    await flush();
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    act(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  } finally {
    delete HTMLElement.prototype.requestFullscreen;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  }
});


test("the final team skips shuffling and lands quickly before transitioning to the final lineup", async () => {
  const initialFetch = global.fetch;
  global.fetch = jest.fn((url, options) => url.endsWith("/groups")
    ? Promise.resolve({ ok: true, json: async () => ({ groups: { A: [teams[1]] }, orderIndex: { 2: 0 } }) })
    : initialFetch(url, options));
  mount(); await flush();
  fireEvent.click(screen.getByRole("button", { name: /draw next team/i }));
  expect(screen.getByRole("button", { name: /assigning final team/i })).toBeDisabled();
  await flush(); await advance(0);
  const group = screen.getByRole("article", { name: "Group B" });
  expect(group).toHaveClass("draw-group-active");
  expect(screen.getByRole("heading", { name: "Titans" })).toBeInTheDocument();
  expect(within(group).queryByText("Titans")).not.toBeInTheDocument();
  await advance(500); await advance(850);
  expect(within(group).getByText("Titans")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Titans" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /download draw poster/i })).not.toBeInTheDocument();
  await advance(1400);
  expect(screen.getByRole("heading", { name: "The final lineup" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Team draw stage" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Remaining teams" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /download draw poster/i }));
  await flush();
  expect(downloadGroupDrawPoster).toHaveBeenCalledWith(expect.objectContaining({ slug: "kcl1", groups: { A: [teams[1]], B: [teams[0]] } }));
  downloadGroupDrawPoster.mockRejectedValueOnce(new Error("Download failed"));
  fireEvent.click(screen.getByRole("button", { name: /download draw poster/i })); await flush();
  expect(screen.getByRole("alert")).toHaveTextContent("Download failed");
  expect(screen.getByRole("button", { name: /download draw poster/i })).toBeEnabled();
  jest.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: /reset draw/i })); await flush();
  expect(screen.getByRole("button", { name: /draw next team/i })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /download draw poster/i })).not.toBeInTheDocument();
});
