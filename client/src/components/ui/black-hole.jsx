import { useEffect, useRef } from "react";
import { createRenderer } from "./black-hole-utils/renderer";

export function BlackHole({ className = "" }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer({ canvas });
    rendererRef.current = renderer;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(scrollY / maxScroll, 1.0) : 0;
      renderer.setScroll(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      renderer.dispose();
    };
  }, []);

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}

export default BlackHole;
