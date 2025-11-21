import React from "react";
import "../styles/thing.scss"; // already imported

const BackgroundEffect = ({ theme }) => {
  const PUB = process.env.PUBLIC_URL || '';

  // Allow theme to specify a background video via `video:filename.mp4` or full URL
  if (typeof theme === 'string' && theme.startsWith('video:')) {
    const file = theme.slice(6).trim();
    const src = file.startsWith('http') ? file : `${PUB}/${file}`;
    return (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }}>
        <video
          key={src}
          className="w-full h-full object-cover pointer-events-none"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </div>
    );
  }
  if (theme === "neon") {
    return <div className="neon-background absolute inset-0 z-0 pointer-events-none" />;
  }

  if (theme === "grid") {
    return <div className="grid-background absolute inset-0 z-0 pointer-events-none" />;
  }

  if (theme === "fireflies") {
    return (
      <div className="firefly-container">
        {[...Array(200)].map((_, i) => {
          const tx = (Math.random() - 0.5) * 400;
          const ty = (Math.random() - 0.5) * 400;
          const duration = 6 + Math.random() * 10;
          const size = 2 + Math.random() * 4; // 2px to 6px
          const colors = ["#ffff66", "#00ffff", "#ffffff", "#ff66cc"];
          const color = colors[Math.floor(Math.random() * colors.length)];

          return (
            <div
              key={i}
              className="firefly"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                '--tx': `${tx}px`,
                '--ty': `${ty}px`,
                animationDuration: `${duration}s`,
                width: `${size}px`,
                height: `${size}px`,
                background: color,
                boxShadow: `0 0 8px ${color}, 0 0 15px ${color}`
              }}
            />
          );
        })}
      </div>


    );
  }

  if (theme === "aurora") {
  return (
    <div className="aurora-background">
  {[...Array(10)].map((_, i) => {
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const size = 150 + Math.random() * 100; // 150px–250px
    const colorOptions = ['#00ffe1', '#ff00ff', '#ffcc00', '#66ffff'];
    const color = colorOptions[i % colorOptions.length];
    const tx = (Math.random() - 0.5) * 100; // -50 to +50
    const ty = (Math.random() - 0.5) * 100;
    const delay = Math.random() * 5;
    const duration = 10 + Math.random() * 10;

    return (
      <div
        key={i}
        className="aurora-light"
        style={{
          top: `${top}%`,
          left: `${left}%`,
          width: `${size}px`,
          height: `${size}px`,
          background: `radial-gradient(circle, ${color}, transparent 60%)`,
          animation: `floatAurora ${duration}s ease-in-out ${delay}s infinite alternate`,
          '--tx': `${tx}px`,
          '--ty': `${ty}px`,
        }}
      />
    );
  })}
</div>

  );
}


  if (theme === "stars") {
    return (
      <div className="absolute inset-0 z-0 pointer-events-none starfield">
        {[...Array(100)].map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
            }}
          />
        ))}
      </div>
    );
  }

  if (theme === "meteor") {
  return (
    <div className="meteor-container absolute inset-0 z-0 pointer-events-none">
      {[...Array(30)].map((_, i) => {
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const delay = Math.random() * 10;
        const duration = 2 + Math.random() * 2;
        const angle = -45 + Math.random() * 20; // small angle variation

        return (
          <div
            key={i}
            className="meteor"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              transform: `rotate(${angle}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}



  // Default: current animated particles
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <div className="center">
        {[...Array(360)].map((_, i) => {
          const tx = (Math.random() - 0.5) * 200;
          const ty = (Math.random() - 0.5) * 200;
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
};

export default BackgroundEffect;
