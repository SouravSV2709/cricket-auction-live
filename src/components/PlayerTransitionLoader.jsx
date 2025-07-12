// components/PlayerTransitionLoader.jsx
import React from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

const PlayerTransitionLoader = () => {
  return (
    <div className="fixed flex flex-col inset-0 bg-black bg-opacity-80 z-[9999] flex items-center justify-center">
      <DotLottieReact
        src="/loading.lottie"
        autoplay
        loop
        style={{ width: 180, height: 180 }}
      />
      <h1 className="text-4xl text-red-300 font-bold animate-pulse">LOADING A STAR.....</h1>
    </div>
  );
};

export default PlayerTransitionLoader;
