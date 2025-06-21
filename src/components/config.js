// src/components/config.js (Frontend only)

const TOURNAMENT_ID =
  process.env.REACT_APP_TOURNAMENT_ID || process.env.TOURNAMENT_ID || 1;

const CONFIG = {
  TOURNAMENT_ID: Number(TOURNAMENT_ID)
};

export default CONFIG;
