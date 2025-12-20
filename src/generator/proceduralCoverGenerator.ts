/**
 * Procedural Cover Generator for Tunecamp
 * Creates AI-free, algorithmically generated cover art
 */

/**
 * Generate SVG cover art based on release metadata
 * Uses hash-based deterministic generation for consistency
 */
export class ProceduralCoverGenerator {
    /**
     * Simple hash function for strings
     */
    private hash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Generate HSL color from hash
     */
    private hashToHsl(hash: number, offset: number = 0): string {
        const h = ((hash + offset * 137) % 360);
        const s = 60 + (hash % 30); // 60-90%
        const l = 40 + ((hash >> 4) % 25); // 40-65%
        return `hsl(${h}, ${s}%, ${l}%)`;
    }

    /**
     * Generate procedural cover SVG
     */
    generateCover(
        title: string,
        artistName: string,
        releaseDate?: string,
        genres?: string[]
    ): string {
        const seed = this.hash(title + artistName + (releaseDate || ""));
        const width = 500;
        const height = 500;

        // Choose a pattern based on hash
        const patternType = seed % 5;

        let pattern: string;
        switch (patternType) {
            case 0:
                pattern = this.generateWavePattern(seed, width, height);
                break;
            case 1:
                pattern = this.generateCirclePattern(seed, width, height);
                break;
            case 2:
                pattern = this.generateGridPattern(seed, width, height);
                break;
            case 3:
                pattern = this.generateGradientPattern(seed, width, height);
                break;
            default:
                pattern = this.generateGeometricPattern(seed, width, height);
        }

        // Background gradient
        const bgColor1 = this.hashToHsl(seed, 0);
        const bgColor2 = this.hashToHsl(seed, 100);

        // Text styling
        const textColor = this.getContrastColor(seed);
        const titleSize = Math.min(36, Math.max(24, 500 / (title.length * 0.7)));

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor1}"/>
      <stop offset="100%" style="stop-color:${bgColor2}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg)"/>
  
  <!-- Pattern -->
  ${pattern}
  
  <!-- Text overlay with shadow -->
  <g filter="url(#shadow)">
    <text x="${width / 2}" y="${height - 100}" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="${titleSize}" 
          font-weight="700"
          fill="${textColor}" 
          text-anchor="middle">
      ${this.escapeXml(title)}
    </text>
    <text x="${width / 2}" y="${height - 60}" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="18" 
          fill="${textColor}" 
          text-anchor="middle"
          opacity="0.8">
      ${this.escapeXml(artistName)}
    </text>
  </g>
</svg>`;
    }

    /**
     * Wave pattern
     */
    private generateWavePattern(seed: number, w: number, h: number): string {
        const color1 = this.hashToHsl(seed, 50);
        const color2 = this.hashToHsl(seed, 150);
        const waves: string[] = [];
        const numWaves = 4 + (seed % 4);

        for (let i = 0; i < numWaves; i++) {
            const amplitude = 30 + (seed >> (i * 2)) % 40;
            const freq = 0.02 + ((seed >> (i * 3)) % 20) / 1000;
            const yOffset = (h / (numWaves + 1)) * (i + 1);
            const opacity = 0.3 + (i * 0.1);

            let d = `M 0 ${yOffset}`;
            for (let x = 0; x <= w; x += 10) {
                const y = yOffset + Math.sin(x * freq + i) * amplitude;
                d += ` L ${x} ${y}`;
            }
            d += ` L ${w} ${h} L 0 ${h} Z`;

            waves.push(`<path d="${d}" fill="${i % 2 === 0 ? color1 : color2}" opacity="${opacity}"/>`);
        }

        return waves.join("\n  ");
    }

    /**
     * Circle pattern
     */
    private generateCirclePattern(seed: number, w: number, h: number): string {
        const circles: string[] = [];
        const numCircles = 5 + (seed % 8);

        for (let i = 0; i < numCircles; i++) {
            const cx = ((seed >> (i * 5)) % w);
            const cy = ((seed >> (i * 3 + 1)) % h);
            const r = 30 + ((seed >> (i * 2)) % 80);
            const color = this.hashToHsl(seed + i * 47, i * 30);
            const opacity = 0.2 + (i % 4) * 0.1;

            circles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
        }

        return circles.join("\n  ");
    }

    /**
     * Grid pattern
     */
    private generateGridPattern(seed: number, w: number, h: number): string {
        const rects: string[] = [];
        const cellSize = 50 + (seed % 50);
        const cols = Math.ceil(w / cellSize);
        const rows = Math.ceil(h / cellSize);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if ((seed + row * cols + col) % 3 === 0) {
                    const color = this.hashToHsl(seed + row * cols + col, 0);
                    const opacity = 0.1 + ((seed >> ((row + col) % 16)) % 3) * 0.1;
                    rects.push(`<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}" opacity="${opacity}"/>`);
                }
            }
        }

        return rects.join("\n  ");
    }

    /**
     * Gradient pattern with shapes
     */
    private generateGradientPattern(seed: number, w: number, h: number): string {
        const color1 = this.hashToHsl(seed, 200);
        const color2 = this.hashToHsl(seed, 300);
        const rotation = seed % 360;

        return `
    <defs>
      <radialGradient id="overlay">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:0.4"/>
        <stop offset="100%" style="stop-color:${color2};stop-opacity:0.1"/>
      </radialGradient>
    </defs>
    <circle cx="${w * 0.3}" cy="${h * 0.4}" r="${w * 0.6}" fill="url(#overlay)"/>
    <circle cx="${w * 0.7}" cy="${h * 0.6}" r="${w * 0.4}" fill="url(#overlay)"/>
    `;
    }

    /**
     * Geometric pattern
     */
    private generateGeometricPattern(seed: number, w: number, h: number): string {
        const shapes: string[] = [];
        const numShapes = 6 + (seed % 6);

        for (let i = 0; i < numShapes; i++) {
            const x = ((seed >> (i * 4)) % w);
            const y = ((seed >> (i * 3 + 2)) % h);
            const size = 40 + ((seed >> (i * 2)) % 60);
            const color = this.hashToHsl(seed + i * 71, i * 45);
            const opacity = 0.15 + (i % 3) * 0.1;
            const rotation = (seed + i * 30) % 360;

            // Alternate between triangles, hexagons, and diamonds
            if (i % 3 === 0) {
                // Triangle
                const points = `${x},${y - size / 2} ${x - size / 2},${y + size / 2} ${x + size / 2},${y + size / 2}`;
                shapes.push(`<polygon points="${points}" fill="${color}" opacity="${opacity}" transform="rotate(${rotation} ${x} ${y})"/>`);
            } else if (i % 3 === 1) {
                // Diamond
                const points = `${x},${y - size / 2} ${x + size / 2},${y} ${x},${y + size / 2} ${x - size / 2},${y}`;
                shapes.push(`<polygon points="${points}" fill="${color}" opacity="${opacity}"/>`);
            } else {
                // Hexagon approximation
                shapes.push(`<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${color}" opacity="${opacity}"/>`);
            }
        }

        return shapes.join("\n  ");
    }

    /**
     * Get contrasting text color
     */
    private getContrastColor(seed: number): string {
        const lightness = 40 + ((seed >> 4) % 25);
        return lightness > 50 ? "#1e293b" : "#f8fafc";
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }
}
