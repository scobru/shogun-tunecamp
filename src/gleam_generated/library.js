// build/dev/javascript/gleam_stdlib/dict.mjs
var bits = 5;
var mask = (1 << bits) - 1;
var noElementMarker = Symbol();
var generationKey = Symbol();

// build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs
function to_string(term) {
  return term.toString();
}
function string_length(string2) {
  if (string2 === "") {
    return 0;
  }
  const iterator = graphemes_iterator(string2);
  if (iterator) {
    let i = 0;
    for (const _ of iterator) {
      i++;
    }
    return i;
  } else {
    return string2.match(/./gsu).length;
  }
}
var segmenter = void 0;
function graphemes_iterator(string2) {
  if (globalThis.Intl && Intl.Segmenter) {
    segmenter ||= new Intl.Segmenter();
    return segmenter.segment(string2)[Symbol.iterator]();
  }
}
function lowercase(string2) {
  return string2.toLowerCase();
}
var unicode_whitespaces = [
  " ",
  // Space
  "	",
  // Horizontal tab
  "\n",
  // Line feed
  "\v",
  // Vertical tab
  "\f",
  // Form feed
  "\r",
  // Carriage return
  "\x85",
  // Next line
  "\u2028",
  // Line separator
  "\u2029"
  // Paragraph separator
].join("");
var trim_start_regex = /* @__PURE__ */ new RegExp(
  `^[${unicode_whitespaces}]*`
);
var trim_end_regex = /* @__PURE__ */ new RegExp(`[${unicode_whitespaces}]*$`);

// build/dev/javascript/tunecamp_gleam/gleam/string_utils.mjs
function pad_left(loop$text, loop$length, loop$char) {
  while (true) {
    let text = loop$text;
    let length2 = loop$length;
    let char = loop$char;
    let current_len = string_length(text);
    let $ = current_len < length2;
    if ($) {
      loop$text = char + text;
      loop$length = length2;
      loop$char = char;
    } else {
      return text;
    }
  }
}

// build/dev/javascript/tunecamp_gleam/gleam/library.mjs
function format_audio_filename(track_num, title, extension) {
  let _block;
  let $ = track_num > 0;
  if ($) {
    _block = pad_left(to_string(track_num), 2, "0") + " - ";
  } else {
    _block = "";
  }
  let num_str = _block;
  return num_str + title + "." + extension;
}
function format_album_directory(artist, album, year) {
  let _block;
  let $ = year > 0;
  if ($) {
    _block = " (" + to_string(year) + ")";
  } else {
    _block = "";
  }
  let year_str = _block;
  return artist + " - " + album + year_str;
}
function get_standard_cover_filename(original_ext) {
  let $ = lowercase(original_ext);
  if ($ === "png") {
    return "cover.png";
  } else {
    return "cover.jpg";
  }
}
export {
  format_album_directory,
  format_audio_filename,
  get_standard_cover_filename
};
