// Konfetti! Kleines Canvas-Partikelsystem für Erfolgsmomente.

const COLORS = ['#5b5bd6', '#b14ef5', '#12a594', '#f5a524', '#e5484d', '#0b84e3', '#2f9e5b', '#d6409f'];

export function confetti({ count = 140, origin = { x: 0.5, y: 0.35 }, spread = 1 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x: origin.x * W, y: origin.y * H,
      vx: Math.cos(angle) * speed * (0.6 + Math.random() * 0.6),
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
      tilt: Math.random() * Math.PI,
    };
  });
  const start = performance.now();
  const DURATION = 2600;
  function frame(t) {
    const el = t - start;
    g.clearRect(0, 0, W, H);
    const fade = Math.max(0, 1 - Math.max(0, el - DURATION * 0.6) / (DURATION * 0.4));
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.tilt += 0.1;
      g.save();
      g.globalAlpha = fade;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.shape === 'circle') {
        g.beginPath();
        g.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-p.w / 2, (-p.h / 2) * Math.abs(Math.cos(p.tilt)), p.w, p.h * Math.abs(Math.cos(p.tilt)));
      }
      g.restore();
    }
    if (el < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
