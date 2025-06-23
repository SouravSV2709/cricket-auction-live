// src/components/useDraggable.js
import { useRef, useEffect } from "react";

const useDraggable = (storageKey) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.position = "absolute";
    el.style.cursor = "grab";

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const { left, top } = JSON.parse(saved);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }

    let offsetX = 0, offsetY = 0, startX = 0, startY = 0;

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      offsetX = el.offsetLeft;
      offsetY = el.offsetTop;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${offsetX + dx}px`;
      el.style.top = `${offsetY + dy}px`;
    };

    const onMouseUp = () => {
      // Save position to localStorage
      localStorage.setItem(storageKey, JSON.stringify({
        left: el.offsetLeft,
        top: el.offsetTop
      }));
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [storageKey]);

  return ref;
};

export default useDraggable;
