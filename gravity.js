/**
 * Gravity Mesh
 * Desktop : dot-grid + content parallax driven by cursor position.
 * Mobile  : dot-grid driven by scroll progress (no finger tracking).
 * Stars are always visible and always twinkle.
 */

(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    /* ── Canvas setup ─────────────────────────────────────────────── */
    const canvas = document.createElement('canvas');
    canvas.id = 'gravity-canvas';
    Object.assign(canvas.style, {
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: '0',
        pointerEvents: 'none'
    });
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let W, H, dpr, cols, rows;
    const spacing      = 95;
    const dotBase      = 2.4;
    const GRAV_RADIUS  = 520;
    const GRAV_STR     = 92;
    const VIS_RADIUS   = 800;

    let points = [], stars = [];

    /* ── Resize / grid ────────────────────────────────────────────── */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W   = window.innerWidth;
        H   = window.innerHeight;
        canvas.width  = W * dpr;
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
                    rx: offX + c * spacing, ry: offY + r * spacing,
                    x:  offX + c * spacing, y:  offY + r * spacing,
                    col: c, row: r
                });
            }
        }
        stars = [];
        const n = Math.floor((W * H) / 8500);
        for (let i = 0; i < n; i++) {
            const rx = Math.random() * W, ry = Math.random() * H;
            const rand = Math.random();
            stars.push({
                rx, ry, x: rx, y: ry,
                size:        Math.random() * 1.6 + 0.6,
                baseAlpha:   Math.random() * 0.28 + 0.08,
                twinkleSpeed: Math.random() * 2 + 1,
                twinklePhase: Math.random() * Math.PI * 2,
                color: rand < 0.12 ? 'blue' : rand < 0.2 ? 'gold' : 'white'
            });
        }
    }

    /* ── Gravity source ───────────────────────────────────────────── */
    // 'mouse' is the logical gravity centre for both desktop and mobile
    const mouse = { x: -9999, y: -9999, active: false };

    if (isTouch) {
        /* ── Mobile: scroll-driven position ──────────────────────── */
        // Centre X fixed; Y glides from ~20 % to ~80 % of viewport as you scroll
        mouse.active = true;
        mouse.x = W / 2;
        mouse.y = H / 2;

        // Target for smooth lerp
        let targetY = H / 2;

        function updateScrollPos() {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            const progress   = scrollable > 0 ? window.scrollY / scrollable : 0;
            // Map 0→1 scroll to 20 %→80 % of viewport height
            targetY  = H * (0.2 + progress * 0.6);
            mouse.x  = W / 2;
        }

        window.addEventListener('scroll', updateScrollPos, { passive: true });
        window.addEventListener('resize', () => {
            mouse.x = W / 2;
            updateScrollPos();
        });
        updateScrollPos();

        // Smooth lerp applied each frame (inside update())
        function lerpMobile(dt) {
            mouse.y += (targetY - mouse.y) * Math.min(1, 4 * dt);
        }
        // Expose so update() can call it
        window._lerpMobile = lerpMobile;

    } else {
        /* ── Desktop: cursor-driven position ─────────────────────── */
        window.addEventListener('pointermove', e => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            mouse.active = true;
            applyContentParallax(e.clientX, e.clientY);
        });
        window.addEventListener('pointerleave', e => {
            if (e.pointerType === 'mouse') {
                mouse.active = false;
                mouse.x = -9999;
                mouse.y = -9999;
                resetContentParallax();
            }
        });
    }

    /* ── Content parallax (desktop only) ─────────────────────────── */
    let parallaxEls = [], parallaxRaf = null;

    function gatherParallaxElements() {
        if (isTouch) return;
        parallaxEls = document.querySelectorAll(
            '.glass, .chip, .btn, .sec-head, .edu-item, .tl-card, ' +
            '.hero-photo, .photo-ring, .photo-inner, .scorecard, ' +
            '.tl-company-logo, h1, h2, h3, p'
        );
    }
    window.addEventListener('DOMContentLoaded', () => setTimeout(gatherParallaxElements, 200));
    window.addEventListener('load',             () => setTimeout(gatherParallaxElements, 500));

    function applyContentParallax(mx, my) {
        if (parallaxEls.length === 0) gatherParallaxElements();
        if (parallaxRaf) return;
        parallaxRaf = requestAnimationFrame(() => {
            parallaxRaf = null;
            parallaxEls.forEach(el => {
                const rect = el.getBoundingClientRect();
                const dx   = mx - (rect.left + rect.width  / 2);
                const dy   = my - (rect.top  + rect.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 550) {
                    const f  = (1 - dist / 550) * 0.35;
                    const px = -(dx / (dist || 1)) * f * 6;
                    const py = -(dy / (dist || 1)) * f * 6;
                    el.style.transform = `translate(${px}px, ${py}px)`;
                } else {
                    el.style.transform = '';
                }
            });
        });
    }
    function resetContentParallax() {
        parallaxEls.forEach(el => { el.style.transform = ''; });
    }

    /* ── Visibility pause ─────────────────────────────────────────── */
    let paused = false, lastTime = performance.now();
    document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
        if (!paused) { lastTime = performance.now(); raf(); }
    });

    /* ── Update ───────────────────────────────────────────────────── */
    function update(dt) {
        // Smooth mobile lerp
        if (isTouch && window._lerpMobile) window._lerpMobile(dt);

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            let dx = 0, dy = 0;
            if (mouse.active) {
                const mx   = mouse.x - p.rx;
                const my   = mouse.y - p.ry;
                const dist = Math.sqrt(mx * mx + my * my);
                if (dist < GRAV_RADIUS && dist > 1) {
                    const factor   = Math.sin((dist / GRAV_RADIUS) * Math.PI);
                    const strength = factor * GRAV_STR;
                    dx = (mx / dist) * strength;
                    dy = (my / dist) * strength;
                }
            }
            p.x += (p.rx + dx - p.x) * Math.min(1, 10 * dt);
            p.y += (p.ry + dy - p.y) * Math.min(1, 10 * dt);
        }

        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            let dx = 0, dy = 0;
            if (mouse.active) {
                const mx   = mouse.x - s.rx;
                const my   = mouse.y - s.ry;
                const dist = Math.sqrt(mx * mx + my * my);
                if (dist < GRAV_RADIUS * 1.15 && dist > 1) {
                    const factor   = Math.sin((dist / (GRAV_RADIUS * 1.15)) * Math.PI);
                    const strength = factor * (GRAV_STR * 1.1);
                    dx = (mx / dist) * strength;
                    dy = (my / dist) * strength;
                }
            }
            s.x += (s.rx + dx - s.x) * Math.min(1, 6 * dt);
            s.y += (s.ry + dy - s.y) * Math.min(1, 6 * dt);
        }
    }

    /* ── Draw ─────────────────────────────────────────────────────── */
    function draw(time) {
        ctx.clearRect(0, 0, W, H);
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';

        // Stars (always rendered)
        for (let i = 0; i < stars.length; i++) {
            const s      = stars[i];
            const twinkle = Math.sin((time || 0) * 0.003 * s.twinkleSpeed + s.twinklePhase) * 0.12;
            let alpha    = s.baseAlpha + twinkle;
            if (mouse.active) {
                const d = Math.hypot(mouse.x - s.x, mouse.y - s.y);
                if (d < VIS_RADIUS) alpha += (1 - d / VIS_RADIUS) * 0.35;
            }
            alpha = Math.max(0.04, Math.min(0.85, alpha));
            if (isLight) {
                ctx.fillStyle = s.color === 'blue' ? `rgba(26,115,232,${alpha*0.75})` :
                                s.color === 'gold' ? `rgba(217,119,6,${alpha*0.65})`  :
                                                     `rgba(100,116,139,${alpha*0.65})`;
            } else {
                ctx.fillStyle = s.color === 'blue' ? `rgba(160,200,255,${alpha})` :
                                s.color === 'gold' ? `rgba(255,232,176,${alpha})` :
                                                     `rgba(255,255,255,${alpha})`;
            }
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        }

        if (!mouse.active || mouse.x < -9000) return;

        // Grid edges
        ctx.lineWidth = 0.8;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.col < cols - 1) drawEdge(p, points[i + 1],       isLight);
            if (p.row < rows - 1) drawEdge(p, points[i + cols],     isLight);
        }

        // Grid dots
        for (let i = 0; i < points.length; i++) {
            const p    = points[i];
            const dxM  = p.x - mouse.x, dyM = p.y - mouse.y;
            const dist = Math.sqrt(dxM * dxM + dyM * dyM);
            if (dist > VIS_RADIUS) continue;

            const vis     = 1 - dist / VIS_RADIUS;
            const visEd   = vis * vis;
            const disp    = Math.sqrt((p.x - p.rx) ** 2 + (p.y - p.ry) ** 2);
            const scale   = 1 + disp * 0.05;

            const oR = isLight ? 148 : 255, oG = isLight ? 163 : 255, oB = isLight ? 184 : 255;
            const iR = isLight ?  26 :  66, iG = isLight ? 115 : 133, iB = isLight ? 232 : 244;
            const r  = Math.round(oR - (oR - iR) * vis);
            const g  = Math.round(oG - (oG - iG) * vis);
            const b  = Math.round(oB - (oB - iB) * vis);
            const a  = visEd * (0.18 + disp * 0.008);

            ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotBase * scale, 0, Math.PI * 2);
            ctx.fill();
        }

        // Cursor glow
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 250);
        grad.addColorStop(0, isLight ? 'rgba(26,115,232,0.03)' : 'rgba(66,133,244,0.02)');
        grad.addColorStop(1, 'rgba(66,133,244,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 250, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawEdge(p, q, isLight) {
        const dpx = p.x - mouse.x, dpy = p.y - mouse.y;
        const dqx = q.x - mouse.x, dqy = q.y - mouse.y;
        const avg = (Math.sqrt(dpx*dpx+dpy*dpy) + Math.sqrt(dqx*dqx+dqy*dqy)) * 0.5;
        if (avg > VIS_RADIUS) return;

        const vis  = 1 - avg / VIS_RADIUS;
        const visEd = vis * vis;
        const disp  = (Math.sqrt((p.x-p.rx)**2+(p.y-p.ry)**2) + Math.sqrt((q.x-q.rx)**2+(q.y-q.ry)**2)) * 0.5;

        const oR = isLight ? 148 : 255, oG = isLight ? 163 : 255, oB = isLight ? 184 : 255;
        const iR = isLight ?  26 :  66, iG = isLight ? 115 : 133, iB = isLight ? 232 : 244;
        const r  = Math.round(oR - (oR - iR) * vis);
        const g  = Math.round(oG - (oG - iG) * vis);
        const b  = Math.round(oB - (oB - iB) * vis);

        ctx.strokeStyle = `rgba(${r},${g},${b},${visEd*(0.05+disp*0.0025)})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }

    /* ── RAF loop ─────────────────────────────────────────────────── */
    function raf(now) {
        if (paused) return;
        now = now || performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        update(dt);
        draw(now);
        requestAnimationFrame(raf);
    }

    window.addEventListener('resize', () => { resize(); gatherParallaxElements(); });
    resize();
    raf(performance.now());
})();
