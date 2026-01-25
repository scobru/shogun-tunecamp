import gleam/string
import gleam/int
import gleam/list

/// Escapes HTML special characters to prevent XSS attacks
/// Converts: & -> &amp;, < -> &lt;, > -> &gt;, " -> &quot;, ' -> &#039;
pub fn escape_html(text: String) -> String {
  escape_html_recursive(text, "")
}

fn escape_html_recursive(remaining: String, acc: String) -> String {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      let escaped = case char {
        "&" -> "&amp;"
        "<" -> "&lt;"
        ">" -> "&gt;"
        "\"" -> "&quot;"
        "'" -> "&#039;"
        _ -> char
      }
      escape_html_recursive(rest, acc <> escaped)
    }
    Error(_) -> acc
  }
}

/// Converts text to a URL-safe slug
/// Example: "Hello World!" -> "hello-world"
pub fn slugify(text: String) -> String {
  let lower = string.lowercase(text)
  let with_dashes = slugify_replace_non_alnum(lower, "")
  trim_dashes(with_dashes)
}

/// Generates a track slug from album title and track title
/// Example: ("My Album", "Track 1") -> "my-album-track-1"
pub fn generate_track_slug(album_title: String, track_title: String) -> String {
  let track = case track_title {
    "" -> "untitled"
    t -> t
  }
  let combined = album_title <> "-" <> track
  slugify(combined)
}

fn slugify_replace_non_alnum(remaining: String, acc: String) -> String {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      let processed = case is_alphanumeric(char) {
        True -> char
        False -> "-"
      }
      slugify_replace_non_alnum(rest, acc <> processed)
    }
    Error(_) -> acc
  }
}

fn is_alphanumeric(char: String) -> Bool {
  case char {
    "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" |
    "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" |
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" -> True
    _ -> False
  }
}

fn trim_dashes(text: String) -> String {
  let trimmed_start = trim_start_dashes(text)
  trim_end_dashes(trimmed_start)
}

fn trim_start_dashes(text: String) -> String {
  case string.pop_grapheme(text) {
    Ok(#(char, rest)) -> case char {
      "-" -> trim_start_dashes(rest)
      _ -> text
    }
    Error(_) -> text
  }
}

fn trim_end_dashes(text: String) -> String {
  trim_end_dashes_recursive(text, "")
}

fn trim_end_dashes_recursive(remaining: String, acc: String) -> String {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      case char {
        "-" -> {
          // Check if there are more non-dash characters after
          case string.pop_grapheme(rest) {
            Ok(_) -> trim_end_dashes_recursive(rest, acc <> char)
            Error(_) -> acc  // This was the last char, skip it
          }
        }
        _ -> trim_end_dashes_recursive(rest, acc <> char)
      }
    }
    Error(_) -> acc
  }
}

/// Formats a timestamp (in milliseconds) as relative time
/// Returns: "just now", "5m ago", "2h ago", "3d ago", or empty string for dates
/// Note: For dates older than a week, returns empty string (let JS handle formatting)
/// Requires current_time_ms parameter (Date.now() from JavaScript)
pub fn format_time_ago(timestamp_ms: Int, current_time_ms: Int) -> String {
  let diff_ms = current_time_ms - timestamp_ms
  let diff_seconds = diff_ms / 1000
  
  case diff_seconds {
    s if s < 60 -> "just now"
    s if s < 3600 -> {
      let minutes = s / 60
      int.to_string(minutes) <> "m ago"
    }
    s if s < 86400 -> {
      let hours = s / 3600
      int.to_string(hours) <> "h ago"
    }
    s if s < 604800 -> {
      let days = s / 86400
      int.to_string(days) <> "d ago"
    }
    _ -> ""  // Let JavaScript handle date formatting for older dates
  }
}

/// Sanitizes a filename by keeping only safe characters
/// Keeps: a-zA-Z0-9._-, replaces everything else with _
pub fn sanitize_filename(filename: String) -> String {
  sanitize_filename_recursive(filename, "")
}

fn sanitize_filename_recursive(remaining: String, acc: String) -> String {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      let processed = case is_safe_filename_char(char) {
        True -> char
        False -> "_"
      }
      sanitize_filename_recursive(rest, acc <> processed)
    }
    Error(_) -> acc
  }
}

fn is_safe_filename_char(char: String) -> Bool {
  case char {
    "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" |
    "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" |
    "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" |
    "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" |
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" |
    "." | "_" | "-" -> True
    _ -> False
  }
}

/// Normalizes a URL by removing trailing slash
/// Example: "https://example.com/" -> "https://example.com"
pub fn normalize_url(url: String) -> String {
  normalize_url_recursive(url, "")
}

fn normalize_url_recursive(remaining: String, acc: String) -> String {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      case char {
        "/" -> {
          // Check if this is the last character
          case string.pop_grapheme(rest) {
            Ok(_) -> normalize_url_recursive(rest, acc <> char)  // Not last, keep it
            Error(_) -> acc  // Last char, skip trailing slash
          }
        }
        _ -> normalize_url_recursive(rest, acc <> char)
      }
    }
    Error(_) -> acc
  }
}

/// Extracts file extension from filename (without the dot, lowercase)
/// Example: "song.mp3" -> "mp3", "FILE.WAV" -> "wav"
pub fn get_file_extension(filename: String) -> String {
  let parts = string.split(filename, on: ".")
  case list.reverse(parts) {
    [ext, ..] -> string.lowercase(ext)
    [] -> ""
  }
}

/// Validates username format
/// Returns Ok(username) if valid, Error(message) if invalid
/// Rules: 3-20 characters, only a-zA-Z0-9_
pub fn validate_username(username: String) -> Result(String, String) {
  let len = string.length(username)
  case len {
    l if l < 3 -> Error("Username must be at least 3 characters")
    l if l > 20 -> Error("Username must be at most 20 characters")
    _ -> {
      case is_valid_username_chars(username) {
        True -> Ok(username)
        False -> Error("Username must contain only letters, numbers, and underscores")
      }
    }
  }
}

fn is_valid_username_chars(username: String) -> Bool {
  is_valid_username_chars_recursive(username)
}

fn is_valid_username_chars_recursive(remaining: String) -> Bool {
  case string.pop_grapheme(remaining) {
    Ok(#(char, rest)) -> {
      case is_alphanumeric_or_underscore(char) {
        True -> is_valid_username_chars_recursive(rest)
        False -> False
      }
    }
    Error(_) -> True  // Reached end, all chars were valid
  }
}

fn is_alphanumeric_or_underscore(char: String) -> Bool {
  case char {
    "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" |
    "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" |
    "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" |
    "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z" |
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "_" -> True
    _ -> False
  }
}
