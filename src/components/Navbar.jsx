// components/Navbar.jsx
import React, { useState } from "react";
import { Link } from "react-router-dom";

const Navbar = ({ tournamentSlug }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="w-full bg-black text-white py-2 px-4 fixed top-0 z-50 shadow-md">
      <div className="flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center gap-3">
  <img
    src="/AuctionArena2.png"
    alt="Auction Arena"
    className="w-10 h-10 object-contain animate-pulse"
  />
  <span className="text-xsm md:text-lg uppercase font-bold tracking-wide text-yellow-300 drop-shadow-sm italic animate-fade-in">
    Bid.. <span className="text-white">Win..</span> <span className="text-yellow-500">Conquer..</span>
  </span>
</div>


        {/* Hamburger Icon */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden focus:outline-none"
        >
          <svg
            className="w-6 h-6 transition-transform duration-300 transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>

        {/* Desktop Links */}
        <div className="hidden md:flex gap-6">
          {/* <Link to={`/secret-bid/${tournamentSlug}`} className="hover:text-yellow-400">Secret Bid</Link> */}
          <Link to={`/tournament/${tournamentSlug}`} className="hover:text-yellow-400">Dashboard</Link>
          <Link to={`/player-cards/${tournamentSlug}`} className="hover:text-yellow-400">Players</Link>
          <Link to={`/team-cards/${tournamentSlug}`} className="hover:text-yellow-400">Teams</Link>
        </div>
      </div>

      {/* Mobile Dropdown Links with Animation */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
          }`}
      >
        <div className="flex flex-col text-right mt-2 gap-2">
          {/* <Link to={`/secret-bid/${tournamentSlug}`} className="hover:text-yellow-400">Secret Bid</Link> */}
          <Link to={`/tournament/${tournamentSlug}`} className="hover:text-yellow-400">Dashboard</Link>
          <Link to={`/player-cards/${tournamentSlug}`} className="hover:text-yellow-400">Players</Link>
          <Link to={`/team-cards/${tournamentSlug}`} className="hover:text-yellow-400">Teams</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
