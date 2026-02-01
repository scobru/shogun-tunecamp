// build/dev/javascript/prelude.mjs
var CustomType = class {
  withFields(fields) {
    let properties = Object.keys(this).map(
      (label) => label in fields ? fields[label] : this[label]
    );
    return new this.constructor(...properties);
  }
};
var Result = class _Result extends CustomType {
  static isResult(data2) {
    return data2 instanceof _Result;
  }
};
var Ok = class extends Result {
  constructor(value) {
    super();
    this[0] = value;
  }
  isOk() {
    return true;
  }
};
var Error = class extends Result {
  constructor(detail) {
    super();
    this[0] = detail;
  }
  isOk() {
    return false;
  }
};

// build/dev/javascript/gleam_stdlib/dict.mjs
var bits = 5;
var mask = (1 << bits) - 1;
var noElementMarker = Symbol();
var generationKey = Symbol();

// build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs
var Nil = void 0;
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
function pop_grapheme(string2) {
  let first;
  const iterator = graphemes_iterator(string2);
  if (iterator) {
    first = iterator.next().value?.segment;
  } else {
    first = string2.match(/./su)?.[0];
  }
  if (first) {
    return new Ok([first, string2.slice(first.length)]);
  } else {
    return new Error(Nil);
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
function is_alphanumeric(char) {
  if (char === "a") {
    return true;
  } else if (char === "b") {
    return true;
  } else if (char === "c") {
    return true;
  } else if (char === "d") {
    return true;
  } else if (char === "e") {
    return true;
  } else if (char === "f") {
    return true;
  } else if (char === "g") {
    return true;
  } else if (char === "h") {
    return true;
  } else if (char === "i") {
    return true;
  } else if (char === "j") {
    return true;
  } else if (char === "k") {
    return true;
  } else if (char === "l") {
    return true;
  } else if (char === "m") {
    return true;
  } else if (char === "n") {
    return true;
  } else if (char === "o") {
    return true;
  } else if (char === "p") {
    return true;
  } else if (char === "q") {
    return true;
  } else if (char === "r") {
    return true;
  } else if (char === "s") {
    return true;
  } else if (char === "t") {
    return true;
  } else if (char === "u") {
    return true;
  } else if (char === "v") {
    return true;
  } else if (char === "w") {
    return true;
  } else if (char === "x") {
    return true;
  } else if (char === "y") {
    return true;
  } else if (char === "z") {
    return true;
  } else if (char === "0") {
    return true;
  } else if (char === "1") {
    return true;
  } else if (char === "2") {
    return true;
  } else if (char === "3") {
    return true;
  } else if (char === "4") {
    return true;
  } else if (char === "5") {
    return true;
  } else if (char === "6") {
    return true;
  } else if (char === "7") {
    return true;
  } else if (char === "8") {
    return true;
  } else if (char === "9") {
    return true;
  } else {
    return false;
  }
}
function slugify_replace_non_alnum(loop$remaining, loop$acc) {
  while (true) {
    let remaining = loop$remaining;
    let acc = loop$acc;
    let $ = pop_grapheme(remaining);
    if ($ instanceof Ok) {
      let char = $[0][0];
      let rest = $[0][1];
      let _block;
      let $1 = is_alphanumeric(char);
      if ($1) {
        _block = char;
      } else {
        _block = "-";
      }
      let processed = _block;
      loop$remaining = rest;
      loop$acc = acc + processed;
    } else {
      return acc;
    }
  }
}
function trim_start_dashes(loop$text) {
  while (true) {
    let text = loop$text;
    let $ = pop_grapheme(text);
    if ($ instanceof Ok) {
      let char = $[0][0];
      let rest = $[0][1];
      if (char === "-") {
        loop$text = rest;
      } else {
        return text;
      }
    } else {
      return text;
    }
  }
}
function trim_end_dashes_recursive(loop$remaining, loop$acc) {
  while (true) {
    let remaining = loop$remaining;
    let acc = loop$acc;
    let $ = pop_grapheme(remaining);
    if ($ instanceof Ok) {
      let char = $[0][0];
      let rest = $[0][1];
      if (char === "-") {
        let $1 = pop_grapheme(rest);
        if ($1 instanceof Ok) {
          loop$remaining = rest;
          loop$acc = acc + char;
        } else {
          return acc;
        }
      } else {
        loop$remaining = rest;
        loop$acc = acc + char;
      }
    } else {
      return acc;
    }
  }
}
function trim_end_dashes(text) {
  return trim_end_dashes_recursive(text, "");
}
function trim_dashes(text) {
  let trimmed_start = trim_start_dashes(text);
  return trim_end_dashes(trimmed_start);
}
function slugify(text) {
  let lower = lowercase(text);
  let with_dashes = slugify_replace_non_alnum(lower, "");
  return trim_dashes(with_dashes);
}
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
    _block = pad_left(to_string(track_num), 2, "0") + "-";
  } else {
    _block = "";
  }
  let num_str = _block;
  return num_str + slugify(title) + "." + lowercase(
    extension
  );
}
function format_album_directory(artist, album) {
  return slugify(artist) + "/" + slugify(album);
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
