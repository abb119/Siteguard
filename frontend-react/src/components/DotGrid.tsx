import { useRef, useEffect, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';

const throttle = (func: (...args: unknown[]) => void, limit: number) => {
    let lastCall = 0;
    return function (this: unknown, ...args: unknown[]) {
        const now = performance.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            func.apply(this, args);
        }
    };
};

function hexToRgb(hex: string) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return {
        r: parseInt(m[1], 16),
        g: parseInt(m[2], 16),
        b: parseInt(m[3], 16),
    };
}

type DotGridProps = {
    dotSize?: number;
    gap?: number;
    baseColor?: string;
    activeColor?: string;
    proximity?: number;
    speedTrigger?: number;
    shockRadius?: number;
    shockStrength?: number;
    maxSpeed?: number;
    resistance?: number;
    returnDuration?: number;
    className?: string;
    style?: React.CSSProperties;
};

type Dot = {
    cx: number;
    cy: number;
    xOffset: number;
    yOffset: number;
    _inertiaApplied: boolean;
};

const DotGrid: React.FC<DotGridProps> = ({
    dotSize = 16,
    gap = 32,
    baseColor = '#5227FF',
    activeColor = '#5227FF',
    proximity = 150,
    speedTrigger = 100,
    shockRadius = 250,
    shockStrength = 5,
    maxSpeed = 5000,
    resistance = 750,
    returnDuration = 1.5,
    className = '',
    style,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dotsRef = useRef<Dot[]>([]);
    const sizeRef = useRef({ w: 0, h: 0 });
    const pointerRef = useRef({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        speed: 0,
        lastTime: 0,
        lastX: 0,
        lastY: 0,
    });

    const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
    const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

    const circlePath = useMemo(() => {
        if (typeof window === 'undefined' || !window.Path2D) return null;
        const p = new window.Path2D();
        p.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
        return p;
    }, [dotSize]);

    const buildGrid = useCallback(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const rect = container.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);
        if (width === 0 || height === 0) return;

        sizeRef.current = { w: width, h: height };

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Force display size to match container exactly
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        const cols = Math.floor((width + gap) / (dotSize + gap));
        const rows = Math.floor((height + gap) / (dotSize + gap));
        const cell = dotSize + gap;

        const gridW = cell * cols - gap;
        const gridH = cell * rows - gap;

        const extraX = width - gridW;
        const extraY = height - gridH;

        const startX = extraX / 2 + dotSize / 2;
        const startY = extraY / 2 + dotSize / 2;

        const dots: Dot[] = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cx = startX + x * cell;
                const cy = startY + y * cell;
                dots.push({ cx, cy, xOffset: 0, yOffset: 0, _inertiaApplied: false });
            }
        }
        dotsRef.current = dots;
    }, [dotSize, gap]);

    // Draw loop
    useEffect(() => {
        if (!circlePath) return;

        let rafId: number;
        const proxSq = proximity * proximity;

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const { w, h } = sizeRef.current;
            ctx.clearRect(0, 0, w, h);

            const { x: px, y: py } = pointerRef.current;

            for (const dot of dotsRef.current) {
                const ox = dot.cx + dot.xOffset;
                const oy = dot.cy + dot.yOffset;

                // Skip dots that are pushed way outside visible area
                if (ox < -dotSize || ox > w + dotSize || oy < -dotSize || oy > h + dotSize) continue;

                const dx = dot.cx - px;
                const dy = dot.cy - py;
                const dsq = dx * dx + dy * dy;

                let fillStyle = baseColor;
                if (dsq <= proxSq) {
                    const dist = Math.sqrt(dsq);
                    const t = 1 - dist / proximity;
                    const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
                    const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
                    const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
                    fillStyle = `rgb(${r},${g},${b})`;
                }

                ctx.save();
                ctx.translate(ox, oy);
                ctx.fillStyle = fillStyle;
                ctx.fill(circlePath);
                ctx.restore();
            }

            rafId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(rafId);
    }, [proximity, baseColor, activeRgb, baseRgb, circlePath, dotSize]);

    // Resize observer
    useEffect(() => {
        buildGrid();
        const ro = new ResizeObserver(buildGrid);
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, [buildGrid]);

    // Mouse/click interactions
    useEffect(() => {
        const pushDuration = Math.max(0.2, resistance / 2000);

        const applyPush = (dot: Dot, pushX: number, pushY: number) => {
            dot._inertiaApplied = true;
            gsap.killTweensOf(dot);
            gsap.to(dot, {
                xOffset: pushX,
                yOffset: pushY,
                duration: pushDuration,
                ease: 'power2.out',
                onComplete: () => {
                    gsap.to(dot, {
                        xOffset: 0,
                        yOffset: 0,
                        duration: returnDuration,
                        ease: 'elastic.out(1,0.75)',
                        onComplete: () => {
                            dot._inertiaApplied = false;
                        },
                    });
                },
            });
        };

        const onMove = (e: MouseEvent) => {
            const now = performance.now();
            const pr = pointerRef.current;
            const dt = pr.lastTime ? now - pr.lastTime : 16;
            const dxM = e.clientX - pr.lastX;
            const dyM = e.clientY - pr.lastY;
            let vx = (dxM / dt) * 1000;
            let vy = (dyM / dt) * 1000;
            let speed = Math.hypot(vx, vy);
            if (speed > maxSpeed) {
                const scale = maxSpeed / speed;
                vx *= scale;
                vy *= scale;
                speed = maxSpeed;
            }
            pr.lastTime = now;
            pr.lastX = e.clientX;
            pr.lastY = e.clientY;
            pr.vx = vx;
            pr.vy = vy;
            pr.speed = speed;

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            pr.x = e.clientX - rect.left;
            pr.y = e.clientY - rect.top;

            for (const dot of dotsRef.current) {
                const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
                if (speed > speedTrigger && dist < proximity && !dot._inertiaApplied) {
                    const pushX = (dot.cx - pr.x) + vx * 0.005;
                    const pushY = (dot.cy - pr.y) + vy * 0.005;
                    applyPush(dot, pushX, pushY);
                }
            }
        };

        const onClick = (e: MouseEvent) => {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            for (const dot of dotsRef.current) {
                const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
                if (dist < shockRadius && !dot._inertiaApplied) {
                    const falloff = Math.max(0, 1 - dist / shockRadius);
                    const pushX = (dot.cx - cx) * shockStrength * falloff;
                    const pushY = (dot.cy - cy) * shockStrength * falloff;
                    applyPush(dot, pushX, pushY);
                }
            }
        };

        const throttledMove = throttle(onMove as (...args: unknown[]) => void, 50);
        window.addEventListener('mousemove', throttledMove as EventListener, { passive: true });
        window.addEventListener('click', onClick);

        return () => {
            window.removeEventListener('mousemove', throttledMove as EventListener);
            window.removeEventListener('click', onClick);
        };
    }, [maxSpeed, speedTrigger, proximity, resistance, returnDuration, shockRadius, shockStrength]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                }}
            />
        </div>
    );
};

export default DotGrid;
