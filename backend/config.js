// config.js (ESM format for backend)
import dotenv from 'dotenv';
dotenv.config();

const CONFIG = {
  TOURNAMENT_ID: Number(process.env.TOURNAMENT_ID || 1)
};

export default CONFIG;
