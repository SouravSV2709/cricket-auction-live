import React from "react";
import "../styles/thing.scss"; // make sure this path is correct

const BackgroundEffect = () => (
  <div className="absolute inset-0 z-0 pointer-events-none">
    <div className="center">
      {[...Array(360)].map((_, i) => {
        const tx = (Math.random() - 0.5) * 200; // -100vw to +100vw
        const ty = (Math.random() - 0.5) * 200; // -100vh to +100vh
        const delay = Math.random() * 5;
        const duration = 20 + Math.random() * 20;

        return (
          <div
            key={i}
            className="thing"
            style={{
              top: "50%",
              left: "50%",
              '--tx': `${tx}vw`,
              '--ty': `${ty}vh`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  </div>
);

export default BackgroundEffect;
