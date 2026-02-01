import gleam/int
import gleam/string
import gleam/string_utils

pub fn format_audio_filename(
  track_num: Int,
  title: String,
  extension: String,
) -> String {
  let num_str = case track_num > 0 {
    True -> string_utils.pad_left(int.to_string(track_num), 2, "0") <> "-"
    False -> ""
  }

  num_str <> string_utils.slugify(title) <> "." <> string.lowercase(extension)
}

pub fn format_album_directory(artist: String, album: String) -> String {
  string_utils.slugify(artist) <> "/" <> string_utils.slugify(album)
}

pub fn get_standard_cover_filename(original_ext: String) -> String {
  case string.lowercase(original_ext) {
    "png" -> "cover.png"
    _ -> "cover.jpg"
  }
}
