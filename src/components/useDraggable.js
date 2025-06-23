import { useRef, useEffect } from "react";

const useDraggable = (storageKey) => {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let el = null;
    let retries = 0;

    const tryInit = () => {
      el = ref.current;
      if (!el) {
        if (retries < 10) {
          retries++;
          setTimeout(tryInit, 100); // Retry after delay
        } else {
          console.warn(`[useDraggable] Failed to bind for key: ${storageKey}`);
        }
        return;
      }

      console.log(`[useDraggable] Mounted ${storageKey}`, el);

      el.style.position = "absolute";
      el.style.cursor = "grab";

      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const { left, top } = JSON.parse(saved);
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          console.log(`[useDraggable] Restored ${storageKey}: (${left}, ${top})`);
        } catch (err) {
          console.error(`[useDraggable] Failed to parse position for ${storageKey}`, err);
        }
      }

      let offsetX = 0, offsetY = 0, startX = 0, startY = 0;

      const onMouseDown = (e) => {
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        offsetX = el.offsetLeft;
        offsetY = el.offsetTop;
        console.log(`[useDraggable] Mouse down: ${storageKey}`);
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
        localStorage.setItem(storageKey, JSON.stringify({
          left: el.offsetLeft,
          top: el.offsetTop
        }));
        console.log(`[useDraggable] Saved position for ${storageKey}`);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      el.addEventListener("mousedown", onMouseDown);
    };

    tryInit();

    return () => {
      if (el) el.removeEventListener("mousedown", () => {});
    };
  }, [storageKey]);

  return ref;
};

export default useDraggable;
