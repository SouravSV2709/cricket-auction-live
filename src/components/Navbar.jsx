// components/Navbar.jsx
import React from "react";
import { Link } from "react-router-dom";

const Navbar = ({ tournamentSlug }) => {
  return (
    <nav className="w-full bg-black text-white py-2 px-4 flex justify-between items-center fixed top-0 z-50 shadow-md">
      <div className="flex items-center gap-2">
        <img
          src="/AuctionArena2.png"
          alt="Auction Arena"
          className="w-10 h-10 object-contain animate-pulse"
        />
      </div>
      <div className="flex gap-6">
        <Link to={`/secret-bid/${tournamentSlug}`} className="hover:text-yellow-400">Secret Bid</Link>
        <Link to={`/tournament/${tournamentSlug}`} className="hover:text-yellow-400">Dashboard</Link>
        <Link to={`/player-cards/${tournamentSlug}`} className="hover:text-yellow-400">Players</Link>
        <Link to={`/team-cards/${tournamentSlug}`} className="hover:text-yellow-400">Teams</Link>
      </div>
    </nav>
  );
};

export default Navbar;
