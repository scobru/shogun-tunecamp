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
    
    // If data is SVG string
    if (typeof data === 'string' && data.includes('<svg')) {
        const svgData = "data:image/svg+xml;base64," + btoa(data);
        
        return (
            <div 
                className="w-full h-full relative"
                style={{ height: `${height}px` }}
            >
                {/* Background (Remaining) */}
                <div 
                    className="absolute inset-0 w-full h-full"
                    style={{ 
                        maskImage: `url('${svgData}')`, 
                        maskSize: '100% 100%',
                        backgroundColor: colorRemaining
                    }}
                />
                
                {/* Foreground (Played) */}
                <div 
                    className="absolute inset-0 h-full transition-all duration-100 ease-linear"
                    style={{ 
                        width: `${progress * 100}%`,
                        maskImage: `url('${svgData}')`, 
                        maskSize: `${100 / progress}% 100%`, // Trick to keep mask static? No.
                        // Better approach: Use clip-path or simple overflow hidden container
                    }}
                />
                
                {/* Alternative: Two overlaid images with overflow hidden on top one */}
                 <div 
                    className="absolute inset-0 w-full h-full"
                    style={{ 
                        maskImage: `url('${svgData}')`, 
                        maskSize: '100% 100%',
                        backgroundColor: colorRemaining
                    }}
                />
                 <div 
                    className="absolute inset-0 h-full overflow-hidden"
                    style={{ width: `${progress * 100}%` }}
                >
                     <div 
                        className="absolute top-0 left-0 h-full"
                        style={{ 
                            width: `${100 / (progress || 0.01)}%`, // Counter-scale? No. 
                            // If we use mask on container, we need the inner div to be full width
                             width: '100vw', // Just make it huge?
                             // easy way: 
                             // Parent (width: progress) -> Child (width: 100 / progress)
                        }}
                    >
                         {/* This approach is complex with CSS masks. 
                             Simpler: Set CSS variable for progress? 
                             Or just standard mask-image on a div that is width 100% but background-image is a gradient?
                         */}
                    </div>
                </div>
            </div>
        );
    }
    
    // SVG APPROACH 2:
    // Render the SVG inline and use a mask/clipPath inside it? 
    // Or just use the SVG as a mask for a div with a gradient background.
    
    // Simplest robust way:
    // The SVG is black/transparent paths.
    // 1. Render SVG as mask for "Remaining" color div.
    // 2. Render SVG as mask for "Played" color div, wrapped in a container with width=progress.
    
    if (typeof data === 'string' && data.includes('<svg')) {
       // Clean up SVG string if needed (remove xml declaration for data URI) or use encodeURIComponent
       const encodedSvg = encodeURIComponent(data);
       const bgImage = `url("data:image/svg+xml;utf8,${encodedSvg}")`;

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
