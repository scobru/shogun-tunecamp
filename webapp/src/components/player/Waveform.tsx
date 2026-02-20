import { useRef, useEffect, useMemo } from 'react';

interface WaveformProps {
    data: number[] | string | null | undefined;
    progress: number; // 0-1
    height?: number;
    colorPlayed?: string;
    colorRemaining?: string;
}

export const Waveform = ({ 
    data, 
    progress, 
    height = 64,
    colorPlayed = '#1db954',
    colorRemaining = 'rgba(255, 255, 255, 0.15)' 
}: WaveformProps) => {
    // Memoize the SVG background image if data is an SVG string
    const bgImage = useMemo(() => {
        if (typeof data === 'string' && data.includes('<svg')) {
            const encodedSvg = encodeURIComponent(data);
            return `url("data:image/svg+xml;utf8,${encodedSvg}")`;
        }
        return null;
    }, [data]);
    
    // Render SVG Waveform if memoized bgImage is available
    if (bgImage) {
       return (
            <div className="w-full h-full relative" style={{ height: `${height}px` }}>
                {/* Base layer (Remaining) */}
                <div 
                    className="absolute inset-0 w-full h-full"
                    style={{
                        maskImage: bgImage,
                        maskSize: '100% 100%',
                        WebkitMaskImage: bgImage,
                        WebkitMaskSize: '100% 100%',
                        backgroundColor: colorRemaining
                    }}
                />

                {/* Progress layer (Played) */}
                <div 
                    className="absolute inset-0 h-full overflow-hidden"
                    style={{ width: `${progress * 100}%` }}
                >
                     <div 
                        className="absolute inset-0 h-full"
                        style={{
                            width: `${100 / (progress || 0.001)}%`, // Counteract the width crop
                            maskImage: bgImage,
                            maskSize: '100% 100%',
                            WebkitMaskImage: bgImage,
                            WebkitMaskSize: '100% 100%',
                            backgroundColor: colorPlayed
                        }}
                    />
                </div>
            </div>
       );
    }

    // Fallback to Canvas for legacy numeric data
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // ... (rest of existing canvas logic)
    // Parse data safely and memoize
    const waveformData = useMemo(() => {
        if (!data) return null;
        try {
            return typeof data === 'string' && !data.includes('<svg') ? JSON.parse(data) : data;
        } catch (e) {
            console.error("Failed to parse waveform data", e);
            return null;
        }
    }, [data]);

    const draw = () => {
         // ... existing draw code ...
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // ...
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
        }

        const width = canvas.width;
        const heightPX = canvas.height;
        
        ctx.clearRect(0, 0, width, heightPX);

        if (!waveformData || !Array.isArray(waveformData) || waveformData.length === 0) {
           return;
        }

        const barWidth = 2 * dpr;
        const gap = 1 * dpr;
        const totalBars = Math.floor(width / (barWidth + gap));
        const step = waveformData.length / totalBars;
        
        for (let i = 0; i < totalBars; i++) {
            const dataIndex = Math.floor(i * step);
            const value = waveformData[dataIndex] || 0;
            
            const barHeight = Math.max(2 * dpr, value * heightPX * 0.9);
            const x = i * (barWidth + gap);
            const y = (heightPX - barHeight) / 2;

            const barPercent = i / totalBars;
            ctx.fillStyle = barPercent < progress ? colorPlayed : colorRemaining;
            
            const radius = 1 * dpr;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, radius);
            ctx.fill();
        }
    };

    useEffect(() => {
        if (!data || (typeof data === 'string' && data.includes('<svg'))) return;
        draw();
    }, [waveformData, progress, colorPlayed, colorRemaining]);

    if (!data) return null;

    return (
        <canvas 
            ref={canvasRef}
            className="w-full h-full pointer-events-none select-none"
            style={{ height: `${height}px`, display: 'block' }}
        />
    );
};
