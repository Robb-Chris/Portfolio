/**
 * Gravity Mesh – Dot-grid that only appears near the cursor
 * Inner dots near cursor center are vibrant blue (#4285F4), fading to white at outer edge.
 * Grid lines and dots are invisible except in the cursor's vicinity.
 * Content elements get a noticeable parallax push from the cursor (desktop only).
 */

(() => {
    // Detect touch-primary devices — disable parallax to prevent jitter
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    const canvas = document.createElement('canvas');
    canvas.id = 'gravity-canvas';
    Object.assign(canvas.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: '0',
        pointerEvents: 'none'
    });
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let W, H, dpr;
    let cols, rows;
    const spacing = 95;
    const dotBase = 2.4;

    // Mouse / touch position
    const mouse = { x: -9999, y: -9999, active: false };
    const GRAVITY_RADIUS = 520;      // deeper gravity warp zone
    const GRAVITY_STRENGTH = 92;     // deeper pull
    const VISIBILITY_RADIUS = 800;   // fade distance around cursor

    let points = [];
    let stars = [];

    // Use a stable viewport height (avoids constant canvas rebuilds from mobile URL-bar resize)
    let stableH = window.innerHeight;

    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        // On touch devices, anchor height to avoid rebuild on mobile chrome bar show/hide
        if (!isTouchDevice || Math.abs(window.innerHeight - stableH) > 150) {
            stableH = window.innerHeight;
        }
        H = isTouchDevice ? stableH : window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildGrid();
    }

    function buildGrid() {
        points = [];
        cols = Math.ceil(W / spacing) + 4;
        rows = Math.ceil(H / spacing) + 4;
        const offX = -((cols * spacing - W) / 2);
        const offY = -((rows * spacing - H) / 2);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                points.push({
                    rx: offX + c * spacing,
                    ry: offY + r * spacing,
                    x: offX + c * spacing,
                    y: offY + r * spacing,
                    col: c,
                    row: r
                });
            }
        }

        // Generate ambient universe stars
        stars = [];
        const numStars = Math.floor((W * H) / 8500);
        for (let i = 0; i < numStars; i++) {
            const rx = Math.random() * W;
            const ry = Math.random() * H;
            const rand = Math.random();
            const color = rand < 0.12 ? 'blue' : rand < 0.2 ? 'gold' : 'white';
            stars.push({
                rx, ry, x: rx, y: ry,
                size: Math.random() * 1.6 + 0.6,
                baseAlpha: Math.random() * 0.28 + 0.08,
                twinkleSpeed: Math.random() * 2 + 1,
                twinklePhase: Math.random() * Math.PI * 2,
                color
            });
        }
    }

    // Pointer tracking – pointermove fires for both mouse and touch
    window.addEventListener('pointermove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
        if (!isTouchDevice) {
            applyContentParallax(e.clientX, e.clientY);
        }
    });

    // Only reset on true pointer-leave (mouse leaving window) — ignore touch pointerleave
    window.addEventListener('pointerleave', e => {
        if (e.pointerType === 'mouse') {
            mouse.active = false;
            mouse.x = -9999;
            mouse.y = -9999;
            resetContentParallax();
        }
    });

    // On touch end, smoothly fade back instead of snapping
    window.addEventListener('pointerup', e => {
        if (e.pointerType === 'touch') {
            // Gradually move mouse position off-screen so gravity fades naturally
            let steps = 0;
            const fade = setInterval(() => {
                steps++;
                if (steps > 20) {
                    clearInterval(fade);
                    mouse.active = false;
                    mouse.x = -9999;
                    mouse.y = -9999;
                }
            }, 50);
        }
    });

    // ===== Content parallax (desktop only) =====
    let parallaxEls = [];
    let parallaxRaf = null;

    function gatherParallaxElements() {
        if (isTouchDevice) return; // no parallax on touch
        parallaxEls = document.querySelectorAll('.glass, .chip, .btn, .sec-head, .edu-item, .tl-card, .hero-photo, .photo-ring, .photo-inner, .scorecard, .tl-company-logo, h1, h2, h3, p');
    }

    // Gather after DOM loads and on resize
    window.addEventListener('DOMContentLoaded', () => setTimeout(gatherParallaxElements, 200));
    window.addEventListener('load', () => setTimeout(gatherParallaxElements, 500));

    function applyContentParallax(mx, my) {
        if (isTouchDevice) return;
        if (parallaxEls.length === 0) gatherParallaxElements();
        if (parallaxRaf) return; // throttle

        parallaxRaf = requestAnimationFrame(() => {
            parallaxRaf = null;
            parallaxEls.forEach(el => {
                const rect = el.getBoundingClientRect();
                const elCX = rect.left + rect.width / 2;
                const elCY = rect.top + rect.height / 2;

                // Distance from cursor to element center
                const dx = mx - elCX;
                const dy = my - elCY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = 550;

                if (dist < maxDist) {
                    const factor = (1 - dist / maxDist) * 0.35; // gentle, subtle influence
                    const pushX = -(dx / (dist || 1)) * factor * 6;
                    const pushY = -(dy / (dist || 1)) * factor * 6;
                    el.style.transform = `translate(${pushX}px, ${pushY}px)`;
                } else {
                    el.style.transform = '';
                }
            });
        });
    }

    function resetContentParallax() {
        parallaxEls.forEach(el => {
            el.style.transform = '';
        });
    }

    // Pause when hidden
    let paused = false;
    document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
        if (!paused) { lastTime = performance.now(); raf(); }
    });

    let lastTime = performance.now();

    function update(dt) {
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            let dx = 0, dy = 0;

            if (mouse.active) {
                const mx = mouse.x - p.rx;
                const my = mouse.y - p.ry;
                const dist = Math.sqrt(mx * mx + my * my);
                if (dist < GRAVITY_RADIUS && dist > 1) {
                    // Smooth sine wave falloff so the center tip is rounded/smooth and doesn't spike
                    const factor = Math.sin((dist / GRAVITY_RADIUS) * Math.PI);
                    const strength = factor * GRAVITY_STRENGTH;
                    // Positive direction pulls dots inward toward cursor (gravity well bulging away)
                    dx = (mx / dist) * strength;
                    dy = (my / dist) * strength;
                }
            }

            p.x += (p.rx + dx - p.x) * Math.min(1, 10 * dt);
            p.y += (p.ry + dy - p.y) * Math.min(1, 10 * dt);
        }

        // Update ambient stars with gravity
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            let dx = 0, dy = 0;
            if (mouse.active) {
                const mx = mouse.x - s.rx;
                const my = mouse.y - s.ry;
                const dist = Math.sqrt(mx * mx + my * my);
                if (dist < GRAVITY_RADIUS * 1.15 && dist > 1) {
                    const factor = Math.sin((dist / (GRAVITY_RADIUS * 1.15)) * Math.PI);
                    const strength = factor * (GRAVITY_STRENGTH * 1.1);
                    dx = (mx / dist) * strength;
                    dy = (my / dist) * strength;
                }
            }
            s.x += (s.rx + dx - s.x) * Math.min(1, 6 * dt);
            s.y += (s.ry + dy - s.y) * Math.min(1, 6 * dt);
        }
    }

    function draw(time) {
        ctx.clearRect(0, 0, W, H);

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        // 1. Draw ambient universe stars (always visible, twinkle over time)
        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            const twinkle = Math.sin((time || 0) * 0.003 * s.twinkleSpeed + s.twinklePhase) * 0.12;
            let alpha = s.baseAlpha + twinkle;
            if (mouse.active) {
                const d = Math.hypot(mouse.x - s.x, mouse.y - s.y);
                if (d < VISIBILITY_RADIUS) {
                    alpha += (1 - d / VISIBILITY_RADIUS) * 0.35;
                }
            }
            alpha = Math.max(0.04, Math.min(0.85, alpha));

            if (isLight) {
                ctx.fillStyle = s.color === 'blue' ? `rgba(26, 115, 232, ${alpha * 0.75})` :
                                s.color === 'gold' ? `rgba(217, 119, 6, ${alpha * 0.65})` :
                                `rgba(100, 116, 139, ${alpha * 0.65})`;
            } else {
                ctx.fillStyle = s.color === 'blue' ? `rgba(160, 200, 255, ${alpha})` :
                                s.color === 'gold' ? `rgba(255, 232, 176, ${alpha})` :
                                `rgba(255, 255, 255, ${alpha})`;
            }
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        if (!mouse.active || mouse.x < -9000) return; // nothing visible without cursor

        // Draw edges – only if both endpoints are within visibility radius
        ctx.lineWidth = 0.8;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            // right neighbour
            if (p.col < cols - 1) {
                drawEdge(p, points[i + 1]);
            }
            // bottom neighbour
            if (p.row < rows - 1) {
                drawEdge(p, points[i + cols]);
            }
        }

        // Draw dots
        for (let i = 0; i < points.length; i++) {
            const p = points[i];

            // Distance from cursor to this dot's current position
            const dxM = p.x - mouse.x;
            const dyM = p.y - mouse.y;
            const distMouse = Math.sqrt(dxM * dxM + dyM * dyM);

            if (distMouse > VISIBILITY_RADIUS) continue; // not visible

            // Visibility factor: 0 at edge, 1 at cursor
            const vis = 1 - distMouse / VISIBILITY_RADIUS;
            const visEased = vis * vis; // quadratic falloff

            // Displacement magnitude
            const disp = Math.sqrt(
                (p.x - p.rx) ** 2 + (p.y - p.ry) ** 2
            );
            const scale = 1 + disp * 0.05;

            // Color: inner nodes (vis near 1) are vibrant blue, outer nodes fade to white (dark mode) or slate (light mode)
            const outerR = isLight ? 148 : 255;
            const outerG = isLight ? 163 : 255;
            const outerB = isLight ? 184 : 255;
            const innerR = isLight ? 26 : 66;
            const innerG = isLight ? 115 : 133;
            const innerB = isLight ? 232 : 244;

            const r = Math.round(outerR - (outerR - innerR) * vis);
            const g = Math.round(outerG - (outerG - innerG) * vis);
            const b = Math.round(outerB - (outerB - innerB) * vis);

            const alpha = visEased * (0.18 + disp * 0.008);

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotBase * scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // Subtle cursor glow
        const grad = ctx.createRadialGradient(
            mouse.x, mouse.y, 0, mouse.x, mouse.y, 250
        );
        const glowColor = isLight ? 'rgba(26, 115, 232, 0.03)' : 'rgba(66, 133, 244, 0.02)';
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'rgba(66, 133, 244, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 250, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawEdge(p, q) {
        // Average distance of both endpoints from cursor
        const dpx = p.x - mouse.x, dpy = p.y - mouse.y;
        const dqx = q.x - mouse.x, dqy = q.y - mouse.y;
        const distP = Math.sqrt(dpx * dpx + dpy * dpy);
        const distQ = Math.sqrt(dqx * dqx + dqy * dqy);
        const avgDist = (distP + distQ) * 0.5;

        if (avgDist > VISIBILITY_RADIUS) return;

        const vis = 1 - avgDist / VISIBILITY_RADIUS;
        const visEased = vis * vis;

        // Displacement for brightness boost
        const dispP = Math.sqrt((p.x - p.rx) ** 2 + (p.y - p.ry) ** 2);
        const dispQ = Math.sqrt((q.x - q.rx) ** 2 + (q.y - q.ry) ** 2);
        const disp = (dispP + dispQ) * 0.5;

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const outerR = isLight ? 148 : 255;
        const outerG = isLight ? 163 : 255;
        const outerB = isLight ? 184 : 255;
        const innerR = isLight ? 26 : 66;
        const innerG = isLight ? 115 : 133;
        const innerB = isLight ? 232 : 244;

        const r = Math.round(outerR - (outerR - innerR) * vis);
        const g = Math.round(outerG - (outerG - innerG) * vis);
        const b = Math.round(outerB - (outerB - innerB) * vis);

        const alpha = visEased * (0.05 + disp * 0.0025);

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
    }

    function raf(now) {
        if (paused) return;
        now = now || performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        update(dt);
        draw(now);
        requestAnimationFrame(raf);
    }

    window.addEventListener('resize', () => {
        resize();
        gatherParallaxElements();
    });
    resize();
    raf(performance.now());
})();
