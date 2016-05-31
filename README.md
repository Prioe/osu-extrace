```Usage:
node index.js [options] -- <osu-song-directory>

Options:
-h, --help
  Show this page.
-o, --ouput <path>
  Set the path where the extracted mp3's will be saved.
  [default: ${DEFAULT_OUTPUT_DIR}]
-c, --cache <path>
  Set the path where the thumbnails will be cached.
  They get removed after the merge of the metadata.
  [default: ${DEFAULT_CACHE}]
-d, --dry
  Perform a dry run, nothing will be written to the disk.
-o, --overwrite
  Overwrite existing files.
-v, --verbose
  Pretty verbose console output.
--debug
  Really verbose console output.```
