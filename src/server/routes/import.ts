import { Router } from "express";
import fetch from "node-fetch";
import { isSafeUrl } from "../../utils/networkUtils.js";

export function createImportRoutes() {
  const router = Router();

  router.post("/bandcamp", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Invalid Bandcamp URL" });
      }

      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        const isBandcamp =
          hostname === "bandcamp.com" || hostname.endsWith(".bandcamp.com");
        const isBcbits =
          hostname === "bcbits.com" || hostname.endsWith(".bcbits.com");

        if (!isBandcamp && !isBcbits) {
          return res.status(400).json({ error: "Invalid Bandcamp URL" });
        }

        // Check for SSRF against local network
        if (!(await isSafeUrl(url))) {
          return res.status(400).json({ error: "Invalid Bandcamp URL" });
        }
      } catch (e) {
        return res.status(400).json({ error: "Invalid Bandcamp URL" });
      }

      const response = await fetch(url.split("?")[0]);
      const html = await response.text();

      let tralbumData = null;

      // Method 1: data-tralbum attribute (common in modern Bandcamp pages)
      const match = html.match(/data-tralbum="([^"]+)"/);
      if (match && match[1]) {
        try {
          const decoded = match[1].replace(/&quot;/g, '"');
          tralbumData = JSON.parse(decoded);
        } catch (e) {
          console.error("Parse error for tralbum data attribute", e);
        }
      }

      // Method 2: var TralbumData (older/alternative page structures)
      if (!tralbumData) {
        const scriptMatch = html.match(
          /var\s+TralbumData\s*=\s*({(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*});/s,
        );
        if (scriptMatch && scriptMatch[1]) {
          try {
            // Extracting the JSON-like object string.
            // Because it's a JS object, we might need a safer parse or eval,
            // but usually it's close enough to JSON if we trim comments or function calls.
            // Actually, capturing the trackinfo specifically is more stable.
          } catch (e) {
            console.error("Parse error for TralbumData var", e);
          }
        }
      }

      // Method 3: JSON-LD
      if (!tralbumData) {
        const ldMatch = html.match(
          /<script type="application\/ld\+json">\s*({.*?})\s*<\/script>/s,
        );
        if (ldMatch && ldMatch[1]) {
          try {
            const ldData = JSON.parse(ldMatch[1]);
            if (ldData.albumRelease) {
              tralbumData = {
                current: {
                  title: ldData.name,
                  release_date: ldData.datePublished,
                },
                trackinfo: (ldData.track?.itemListElement || []).map(
                  (t: any) => ({
                    title: t.item.name,
                    track_num: t.position,
                  }),
                ),
              };
              // We might miss duration here if it's not well exposed in LD
            }
          } catch (e) {}
        }
      }

      // Final fallback: Regex for trackinfo explicitly
      if (!tralbumData) {
        const trackMatch = html.match(
          /trackinfo:\s*(\[.*?\]),\s*playing_from/s,
        );
        if (trackMatch && trackMatch[1]) {
          try {
            const tracks = JSON.parse(trackMatch[1]);
            tralbumData = { trackinfo: tracks };
          } catch (e) {}
        }

        if (tralbumData) {
          const titleMatch = html.match(
            /<meta property="og:title" content="([^"]+)"/,
          );
          if (titleMatch)
            tralbumData.current = { title: titleMatch[1].split(", by")[0] };
        }
      }

      if (!tralbumData) {
        return res
          .status(404)
          .json({ error: "Could not extract metadata from Bandcamp page" });
      }

      const title = tralbumData.current?.title || "";
      const artist = tralbumData.artist || "";
      const dateStr = tralbumData.current?.release_date || "";
      const year = dateStr
        ? new Date(dateStr).getFullYear()
        : new Date().getFullYear();

      const coverArtId = tralbumData.art_id || "";
      const cover = coverArtId
        ? `https://f4.bcbits.com/img/a${coverArtId}_10.jpg`
        : ""; // _10 is original quality

      // If cover is not found, try og:image
      let finalCover = cover;
      if (!finalCover) {
        const imgMatch = html.match(
          /<meta property="og:image" content="([^"]+)"/,
        );
        if (imgMatch) finalCover = imgMatch[1];
      }

      const trackinfo = tralbumData.trackinfo || [];
      const tracks = trackinfo
        .map((t: any) => ({
          title: t.title || t.name,
          duration: t.duration || 0,
          position: t.track_num || t.position,
          lyrics: t.lyrics || null,
        }))
        .filter((t: any) => t.title);

      res.json({ title, artist, year, cover: finalCover, tracks });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to import" });
    }
  });

  return router;
}
