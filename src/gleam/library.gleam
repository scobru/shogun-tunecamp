import gleam/int
import gleam/string
import gleam/string_utils

pub fn format_audio_filename(
  track_num: Int,
  title: String,
  extension: String,
) -> String {
  let num_str = case track_num > 0 {
    True -> string_utils.pad_left(int.to_string(track_num), 2, "0") <> " - "
    False -> ""
  }

  num_str <> title <> "." <> extension
}

pub fn format_album_directory(
  artist: String,
  album: String,
  year: Int,
) -> String {
  let year_str = case year > 0 {
    True -> " (" <> int.to_string(year) <> ")"
    False -> ""
  }

  artist <> " - " <> album <> year_str
}

pub fn get_standard_cover_filename(original_ext: String) -> String {
  case string.lowercase(original_ext) {
    "png" -> "cover.png"
    _ -> "cover.jpg"
  }
}
