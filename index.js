const parseArgs = require('minimist');
const fs = require('fs-extra');
const path = require('path');
const spawnSync = require('child_process').spawnSync;
const winston = require('winston');
const moment = require('moment');
const args = parseArgs(process.argv.splice(2), {
  '--': true,
  string: ['output', 'cache','overwrite'],
  boolean: ['help', 'verbose', 'debug', 'dry'],
  alias: {
    output: 'o',
    cache: 'c',
    help: 'h',
    verbose: 'v',
    overwrite: 'O',
    dry: 'd'
  }
});

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      level: 'info',
      colorize: true,
      timestamp: () => {
        return `[${moment().format('HH:mm')}]`;
      }
    })
  ]
});
if (args.debug && args.verbose) {
  logger.error(`Please use either '--debug' or '--verbose', not both!`);
  return;
}
logger.transports.console.level = args.debug ? 'debug' : args.verbose ? 'verbose' : 'info';

const DEFAULT_CACHE = path.join(__dirname, 'cache');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'output');
const CACHE = args.cache ? args.cache : DEFAULT_CACHE;
const OUTPUT_DIR = args.output ? args.output : DEFAULT_OUTPUT_DIR;
args.path = args['--'].join(' ');

if (args.help || !args.path) {
  logger.log('debug', `Printing usage... (help: ${args.help}, path: ${!args.path})`);
  usage();
  return;
}
logger.log('debug', JSON.stringify(args));

fs.ensureDirSync(CACHE);
fs.ensureDirSync(OUTPUT_DIR);
fs.ensureDirSync(args.path);

logger.info(`Running osu-extract...`);
logger.log('verbose', `Input Directory:  ${args.path}`);
logger.log('verbose', `Output Directory: ${OUTPUT_DIR}`);
logger.log('verbose', `Cache Directory:  ${CACHE}`);

var oldConvId = Math.pow(2, 30);
var addedPaths = [];
var musicData = {};
var currentNum;
var maxNum;

fs.walk(args.path)
  .on('data', (item) => {
    if (path.extname(item.path) == '.osu' && addedPaths.indexOf(path.dirname(item.path)) < 0) {
      addedPaths.push(path.dirname(item.path));
      fs.readFile(item.path, (err, data) => {
        var d = data.toString().match(/(AudioFilename|Title|Artist)\s*:\s*(.*)/gmi);
        var o = {};
        for (var i = 0; i < d.length; i++) {
          var s = d[i];
          var index = d[i].indexOf(':');
          o[d[i].substring(0, index).toLowerCase()] = d[i].substring(index + 1).trim();
        }
        o.path = path.join(path.dirname(item.path), o.audiofilename);
        var thumbmatch = data.toString().match(/^\d+,\d+,?\d?,"(.*)(\.png|\.jpg|\.jpeg)"((,\d+,\d+)|$)/gmi);
        if (thumbmatch) {
          o.thumbnail = path.join(path.dirname(item.path), thumbmatch[0].match(/^\d+,\d+,?\d?,"(.*)"((,\d+,\d+)|$)/)[1]);
        } else {
          logger.log('debug', 'No thumbnail: ' + item.path);
        }

        delete o.audiofilename;
        var split = o.path.split(path.sep);
        var match = split[split.length - 2].match(/(\d+)\s*.*/);
        if (!match) {
          musicData[oldConvId++] = o;
        } else {
          musicData[match[1]] = o;
        }

      });
    }
  }).on('end', () => {
    maxNum = Object.keys(musicData).length;
    currentNum = 0;
    for (var song_id in musicData) {
      if (!musicData.hasOwnProperty(song_id)) return;
      var song = musicData[song_id];
      var title = path.join(OUTPUT_DIR, `${song.artist.replace(/\*|\?|\\|<|>|:|\"|\||\//g)} - ${song.title.replace(/\*|\?|\\|<|>|:|\"|\||\//g)}.mp3`);
      try {
        if (args.overwrite)
          throw new Error();
        fs.lstatSync(title);
        currentNum++;
        logger.log('debug', `[${currentNum}/${maxNum}] File ${title} already exists. Skipping ...`);
      } catch (e) {
        currentNum++;
        if (!args.dry) {
          var convert = spawnSync('convert', [
            '-define', 'jpeg:size=400x400', song.thumbnail,
            '-thumbnail', '400x400^',
            '-gravity', 'center',
            '-extent', '400x400',
            '+profile', '"*"',
            path.join(CACHE, song_id + '.jpg')
          ]);
        }
        logger.log('debug', `[${currentNum}/${maxNum}] Converted thumbnail ${song_id}.jpg.`);
        logger.log('debug', `[${currentNum}/${maxNum}] Embedding metadata: ${title}`);
        if (!args.dry) {
          var ffmpeg = spawnSync('ffmpeg', [
            '-i', song.path,
            '-i', path.join(CACHE, song_id + '.jpg'),
            '-map', '0:0',
            '-map', '1:0',
            '-c', 'copy',
            '-id3v2_version', '3',
            '-metadata:s:v', 'title="Album Cover"',
            '-metadata:s:v', 'comment="Cover (Front)"',
            '-metadata', 'artist=' + song.artist,
            '-metadata', 'title=' + song.title,
            '-metadata', 'album=osu!',
            title,
          ]);
        }
        logger.log('verbose', `[${currentNum}/${maxNum}] Embedded metadata: ${song.artist} - ${song.title}`);
        if (!args.dry)
          fs.removeSync(path.join(CACHE, song_id + '.jpg'));
      }
    }
  });

function usage() {
  var usage = `Usage:
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
    Really verbose console output.`;
  console.log(usage);
}
