// Central themes registry (single source of truth)
const THEMES = {
  default:  { bg: "from-black to-purple-900",  text: "text-white" },
  fire:     { bg: "from-orange-600 to-red-900", text: "text-white" },
  ocean:    { bg: "from-blue-800 to-cyan-700",  text: "text-white" },
  forest:   { bg: "from-green-800 to-lime-600", text: "text-black" },
  sunset:   { bg: "from-pink-500 to-yellow-500",text: "text-black" },
  royal:    { bg: "from-indigo-800 to-yellow-200", text: "text-black" },
  cyberpunk:{ bg: "from-pink-700 to-purple-900", text: "text-white" },
  steel:    { bg: "from-gray-700 to-gray-900", text: "text-white" },
  sunrise:  { bg: "from-yellow-300 to-orange-500", text: "text-black" },
  velvet:   { bg: "from-purple-800 to-pink-700", text: "text-white" },
  kcpl:     { bg: "from-blue-900 to-red-700",   text: "text-white" },

  // ABPL palettes (optional; safe to keep even if unused yet)
  abpl_night:    { bg: "from-[#0B1C39] via-[#143B7A] to-[#1E6ADF]", text: "text-white" },
  abpl_gold:     { bg: "from-[#0F2A5A] via-[#1F3E73] to-[#0F2A5A]", text: "text-yellow-50" },
  abpl_electric: { bg: "from-[#0E3C8A] via-[#1E6ADF] to-[#3EC9F5]", text: "text-white" },
  abpl_turf:     { bg: "from-[#0A1426] via-[#0B1C39] to-[#0A1426]", text: "text-white" },
};

// App-wide default theme key used by Admin/Spectator fallbacks
export const DEFAULT_THEME_KEY = "abpl_night"; // change to "kcpl" or "default" if you prefer

export default THEMES;
