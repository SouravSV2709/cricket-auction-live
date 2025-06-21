// src/components/config.js (Frontend only)

const isProduction = process.env.NODE_ENV === 'production';

const API_BASE_URL = isProduction
  ? 'https://cricket-backend.onrender.com'
  : 'http://localhost:5000';

const TOURNAMENT_ID =
  process.env.REACT_APP_TOURNAMENT_ID || process.env.TOURNAMENT_ID || 1;

const CONFIG = {
  TOURNAMENT_ID: Number(TOURNAMENT_ID),
  API_BASE_URL
};

export default CONFIG;
