/**
 * Earth Night Satellite Background
 * Renders an animated NASA Black Marble-style world night view
 * with twinkling city lights, aurora effects, and subtle globe motion.
 */
(function () {
  'use strict';

  // ── City light clusters (approx normalized coords 0..1) ──────────────────
  // [x, y, radius, intensity] — major populated regions seen from space at night
  const CITY_CLUSTERS = [
    // North America East Coast
    { x: 0.185, y: 0.34, r: 28, bright: 1.0 },
    { x: 0.175, y: 0.30, r: 18, bright: 0.85 },
    { x: 0.19,  y: 0.36, r: 14, bright: 0.75 },
    // North America Mid-West
    { x: 0.155, y: 0.335, r: 12, bright: 0.7 },
    { x: 0.145, y: 0.315, r: 10, bright: 0.6 },
    // Western USA
    { x: 0.11,  y: 0.33,  r: 14, bright: 0.8 },
    { x: 0.105, y: 0.355, r: 10, bright: 0.65 },
    // UK & Western Europe
    { x: 0.468, y: 0.275, r: 32, bright: 1.0 },
    { x: 0.49,  y: 0.28,  r: 22, bright: 0.9 },
    { x: 0.50,  y: 0.295, r: 18, bright: 0.85 },
    { x: 0.505, y: 0.32,  r: 14, bright: 0.75 },
    // Northern Italy / Po Valley
    { x: 0.513, y: 0.315, r: 12, bright: 0.8 },
    // Eastern Europe
    { x: 0.54,  y: 0.27,  r: 16, bright: 0.7 },
    { x: 0.56,  y: 0.26,  r: 12, bright: 0.65 },
    // Middle East
    { x: 0.59,  y: 0.36,  r: 18, bright: 0.85 },
    { x: 0.60,  y: 0.38,  r: 12, bright: 0.75 },
    // South Asia — India
    { x: 0.66,  y: 0.40,  r: 24, bright: 0.9 },
    { x: 0.675, y: 0.43,  r: 20, bright: 0.85 },
    { x: 0.68,  y: 0.38,  r: 16, bright: 0.75 },
    // East Asia — China / Korea / Japan
    { x: 0.765, y: 0.33,  r: 28, bright: 0.95 },
    { x: 0.785, y: 0.31,  r: 22, bright: 0.9 },
    { x: 0.80,  y: 0.315, r: 18, bright: 0.85 },
    { x: 0.805, y: 0.295, r: 14, bright: 0.8 },
    // South East Asia
    { x: 0.775, y: 0.46,  r: 18, bright: 0.75 },
    // Japan islands
    { x: 0.825, y: 0.305, r: 14, bright: 0.8 },
    // Australia SE
    { x: 0.825, y: 0.60,  r: 14, bright: 0.7 },
    // West Africa Nigeria
    { x: 0.49,  y: 0.445, r: 12, bright: 0.6 },
    // Egypt / Nile Delta
    { x: 0.555, y: 0.365, r: 14, bright: 0.7 },
    // South Africa
    { x: 0.555, y: 0.60,  r: 12, bright: 0.65 },
    // Brazil / South America
    { x: 0.27,  y: 0.52,  r: 18, bright: 0.75 },
    { x: 0.255, y: 0.50,  r: 12, bright: 0.65 },
    // Russia / Moscow
    { x: 0.565, y: 0.245, r: 14, bright: 0.7 },
    // Scandinavia
    { x: 0.50,  y: 0.22,  r: 10, bright: 0.6 },
  ];

  // Individual scattered lights (simulate small cities / industrial zones)
  const SCATTER_COUNT = 1200;
  const AURORA_BANDS = 3;

  let canvas, ctx, W, H, dpr, stars = [], scatterLights = [], auroraPoints = [];
  let animFrame, t = 0;
  let panOffsetX = 0; // slow pan to simulate Earth rotation

  function init() {
    // Remove any existing background canvas
    const existing = document.getElementById('earth-night-canvas');
    if (existing) existing.remove();

    canvas = document.createElement('canvas');
    canvas.id = 'earth-night-canvas';
    canvas.style.cssText = [
      'position:fixed',
      'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:-1',
      'pointer-events:none',
      'display:block',
    ].join(';');

    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    generateStars();
    generateScatterLights();
    generateAurora();

    if (animFrame) cancelAnimationFrame(animFrame);
    loop();
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Regenerate on resize
    generateStars();
    generateScatterLights();
    generateAurora();
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function generateStars() {
    stars = [];
    const count = Math.floor((W * H) / 1400);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand(0, W),
        y: rand(0, H * 0.55), // stars only in upper half (space)
        r: rand(0.2, 1.1),
        alpha: rand(0.3, 1.0),
        twinkleSpeed: rand(0.005, 0.03),
        twinklePhase: rand(0, Math.PI * 2),
      });
    }
  }

  function generateScatterLights() {
    scatterLights = [];
    for (let i = 0; i < SCATTER_COUNT; i++) {
      // Weighted toward cluster centres with random scatter
      const cluster = CITY_CLUSTERS[Math.floor(Math.random() * CITY_CLUSTERS.length)];
      const angle = rand(0, Math.PI * 2);
      const dist  = rand(0, cluster.r * rand(1.0, 3.5));
      scatterLights.push({
        x: cluster.x + Math.cos(angle) * dist / W,
        y: cluster.y + Math.sin(angle) * dist / H,
        r: rand(0.4, 2.0),
        alpha: rand(0.2, 0.9) * cluster.bright,
        twinkleSpeed: rand(0.01, 0.08),
        twinklePhase: rand(0, Math.PI * 2),
        hue: rand(30, 65), // warm amber-yellow city lights
      });
    }
  }

  function generateAurora() {
    auroraPoints = [];
    for (let b = 0; b < AURORA_BANDS; b++) {
      const band = [];
      const baseY = rand(0.06, 0.18);
      const segs  = 40;
      for (let s = 0; s <= segs; s++) {
        band.push({
          x: (s / segs),
          y: baseY + rand(-0.04, 0.04),
          phase: rand(0, Math.PI * 2),
          amp: rand(0.005, 0.025),
          speed: rand(0.003, 0.01),
          hue: b === 0 ? 150 : b === 1 ? 170 : 280,
        });
      }
      auroraPoints.push(band);
    }
  }

  function drawBackground() {
    // Deep space gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#000005');
    grad.addColorStop(0.25,'#010412');
    grad.addColorStop(0.55,'#050d1f');
    grad.addColorStop(0.80,'#080e16');
    grad.addColorStop(1,   '#0a0f18');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(now) {
    stars.forEach(s => {
      const flicker = 0.5 + 0.5 * Math.sin(s.twinklePhase + now * s.twinkleSpeed);
      ctx.save();
      ctx.globalAlpha = s.alpha * flicker;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawAurora(now) {
    auroraPoints.forEach(band => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Build path
      ctx.beginPath();
      band.forEach((pt, i) => {
        const px = (pt.x + panOffsetX) % 1.0 * W;
        const wave = Math.sin(pt.phase + now * pt.speed * 60) * pt.amp;
        const py = (pt.y + wave) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      // Close bottom
      ctx.lineTo(W + 10, H * 0.30);
      ctx.lineTo(-10, H * 0.30);
      ctx.closePath();

      const aGrad = ctx.createLinearGradient(0, 0, 0, H * 0.3);
      const h = band[0].hue;
      aGrad.addColorStop(0,   `hsla(${h},100%,60%,0.00)`);
      aGrad.addColorStop(0.3, `hsla(${h},100%,55%,0.04)`);
      aGrad.addColorStop(0.7, `hsla(${h},90%,50%,0.06)`);
      aGrad.addColorStop(1,   `hsla(${h},100%,60%,0.00)`);
      ctx.fillStyle = aGrad;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawContinentGlow() {
    // Subtle teal/cyan "atmosphere" glow around Earth's surface area
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const atmGrad = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.08, W * 0.5, H * 0.6, H * 0.7);
    atmGrad.addColorStop(0,   'rgba(6,182,212,0.00)');
    atmGrad.addColorStop(0.55,'rgba(6,182,212,0.025)');
    atmGrad.addColorStop(0.8, 'rgba(16,185,129,0.018)');
    atmGrad.addColorStop(1,   'rgba(16,185,129,0.00)');
    ctx.fillStyle = atmGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawCityLights(now) {
    scatterLights.forEach(lt => {
      const twinkle = 0.6 + 0.4 * Math.sin(lt.twinklePhase + now * lt.twinkleSpeed * 60);
      // Pan: wrap x around screen with slow drift
      let lx = ((lt.x + panOffsetX) % 1.0) * W;
      if (lx < 0) lx += W;
      const ly = lt.y * H;

      ctx.save();
      ctx.globalAlpha = lt.alpha * twinkle;
      ctx.globalCompositeOperation = 'screen';

      // Glow halo
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, lt.r * 4);
      glow.addColorStop(0, `hsla(${lt.hue},100%,90%,0.9)`);
      glow.addColorStop(0.4,`hsla(${lt.hue},95%,70%,0.3)`);
      glow.addColorStop(1,  `hsla(${lt.hue},80%,60%,0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly, lt.r * 4, 0, Math.PI * 2);
      ctx.fill();

      // Core bright dot
      ctx.globalAlpha = Math.min(lt.alpha * twinkle * 1.5, 1);
      ctx.fillStyle = `hsl(${lt.hue},100%,95%)`;
      ctx.beginPath();
      ctx.arc(lx, ly, lt.r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  function drawClusterHalos(now) {
    CITY_CLUSTERS.forEach(cl => {
      const pulse = 0.85 + 0.15 * Math.sin(now * 0.3 + cl.x * 10);
      let cx = ((cl.x + panOffsetX) % 1.0) * W;
      if (cx < 0) cx += W;
      const cy = cl.y * H;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cl.r * 3.5 * pulse);
      halo.addColorStop(0,   `rgba(255,220,120,${0.18 * cl.bright * pulse})`);
      halo.addColorStop(0.35,`rgba(255,180,80,${0.10 * cl.bright * pulse})`);
      halo.addColorStop(0.7, `rgba(255,140,50,${0.04 * cl.bright * pulse})`);
      halo.addColorStop(1,   'rgba(255,100,20,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, cl.r * 3.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawOverlayDark() {
    // Subtle dark vignette to keep UI readable
    const vign = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, H * 0.9);
    vign.addColorStop(0,   'rgba(0,0,0,0)');
    vign.addColorStop(0.7, 'rgba(0,0,0,0.15)');
    vign.addColorStop(1,   'rgba(0,0,0,0.55)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, W, H);

    // Top atmosphere glow (space blue edge)
    const topAtm = ctx.createLinearGradient(0, 0, 0, H * 0.15);
    topAtm.addColorStop(0,   'rgba(0,5,30,0.6)');
    topAtm.addColorStop(0.6, 'rgba(0,5,25,0.1)');
    topAtm.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = topAtm;
    ctx.fillRect(0, 0, W, H * 0.15);
  }

  function loop() {
    animFrame = requestAnimationFrame(loop);
    const now = performance.now() / 1000;

    // Very slow pan — Earth rotation effect (1 full cycle ~280 seconds)
    panOffsetX = (now / 280) % 1.0;

    ctx.clearRect(0, 0, W, H);

    drawBackground();
    drawAurora(now);
    drawStars(now);
    drawContinentGlow();
    drawClusterHalos(now);
    drawCityLights(now);
    drawOverlayDark();
  }

  // ── Initialise on DOM ready ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
