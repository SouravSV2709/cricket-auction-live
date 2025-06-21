// backend/config.js
import dotenv from 'dotenv';
dotenv.config();

const CONFIG = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  TOURNAMENT_ID: Number(process.env.TOURNAMENT_ID || 1)
};

export default CONFIG;
