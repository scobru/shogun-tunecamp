import { StringUtils } from './stringUtils.js';
export const LibraryUtils = {
    /**
     * Formats an audio filename: "01 - Title.mp3"
     */
    formatAudioFilename: (trackNum, title, extension) => {
        let numStr = "";
        if (trackNum > 0) {
            numStr = StringUtils.padLeft(trackNum.toString(), 2, "0") + "-";
        }
        return numStr + StringUtils.slugify(title) + "." + StringUtils.getFileExtension(`file.${extension}`) || extension.toLowerCase();
    },
    /**
     * Formats an album directory: "Artist - Album"
     * Actually Gleam implementation was: string_utils.slugify(artist) <> "/" <> string_utils.slugify(album)
     * It seems to create a path?
     */
    formatAlbumDirectory: (artist, album) => {
        return StringUtils.slugify(artist) + "/" + StringUtils.slugify(album);
    },
    /**
     * Returns the standard cover filename: "cover.jpg" or "cover.png"
     */
    getStandardCoverFilename: (originalExt) => {
        if (originalExt.toLowerCase() === "png") {
            return "cover.png";
        }
        return "cover.jpg";
    }
};
