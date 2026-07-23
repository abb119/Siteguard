import React, { useEffect, useRef, useState } from "react";
import { apiFetch, staticUrl } from "../lib/api";

/**
 * Renders a backend evidence snapshot (driver events, PPE violations…).
 *
 * It fetches the image THROUGH apiFetch so the `ngrok-skip-browser-warning`
 * header (and auth) travel with the request. A plain <img src> can't send that
 * header, so on the public (ngrok) deployment ngrok returns its warning page
 * instead of the JPEG and the thumbnail breaks. The fetch is deferred until the
 * element scrolls into view, so a long list doesn't download everything at once.
 */
export const EvidenceImg: React.FC<{ path: string; className?: string; alt?: string }> = ({
    path,
    className,
    alt,
}) => {
    const holderRef = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [src, setSrc] = useState<string | null>(null);

    // Start fetching only once the placeholder is (nearly) in view.
    useEffect(() => {
        if (visible) return;
        const el = holderRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { rootMargin: "200px" },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        let objectUrl: string | null = null;
        let cancelled = false;
        apiFetch(staticUrl(path))
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
            .then((blob) => {
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setSrc(objectUrl);
            })
            .catch(() => { if (!cancelled) setSrc(null); });
        return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [visible, path]);

    if (src) return <img src={src} alt={alt ?? ""} className={className} />;
    return <div ref={holderRef} className={`${className ?? ""} bg-hud-bg`} />;
};
