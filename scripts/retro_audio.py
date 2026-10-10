"""Read the client's audio aliases as data, without executing its ActionScript."""
from pathlib import Path
import re
import struct
import zlib

from retro_swf import read


from retro_data import push_values, data_tables


def audio_tables(path):
    variables = data_tables(path)
    if not variables.get('AUEC') or not variables.get('AUE'):
        raise ValueError('Missing audio effect definitions')
    return variables


def find_audio_data(client, destination, explicit=None):
    if explicit:
        data = explicit.expanduser().read_bytes()
    else:
        # Keep a portable copy once imported. Only inspect the game's asset
        # cache, and only extract an audio SWF identified by its CDN filename.
        candidates = list((client / 'lang/swf').glob('audio_*.swf'))
        if destination.is_file():
            candidates.append(destination)
        if candidates:
            chosen = max(candidates, key=lambda p: audio_tables(p).get('VERSION', 0))
            data = chosen.read_bytes()
        else:
            cache = Path.home() / 'Library/Application Support/Dofus Retro/Cache'
            found = []
            for file in cache.glob('*'):
                if not file.is_file():
                    continue
                contents = file.read_bytes()
                pattern = rb'https://dofusretro\.cdn\.ankama\.com/static-data/\d+/lang/swf/audio_[a-z]+_(\d+)\.swf'
                for match in re.finditer(pattern, contents):
                    start = contents.find(b'CWS', match.end())
                    if start < 0:
                        continue
                    try:
                        inflater = zlib.decompressobj()
                        body = inflater.decompress(contents[start + 8:])
                        expected = struct.unpack_from('<I', contents, start + 4)[0] - 8
                        if inflater.eof and len(body) == expected:
                            end = len(contents) - len(inflater.unused_data)
                            found.append((int(match[1]), contents[start:end]))
                    except (zlib.error, struct.error):
                        continue
            if not found:
                raise FileNotFoundError('Audio aliases missing: pass --audio-data /path/to/audio_fr_VERSION.swf')
            data = max(found, key=lambda item: item[0])[1]
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return audio_tables(destination)


def sound_cues(tables, effects):
    cues, missing = {}, []
    # A few legacy definitions differ from their exports only by letter case.
    files = {name.lower(): url for name, url in effects.items()}
    for name, sound_id in tables['AUEC'].items():
        definition = tables['AUE'].get(sound_id, {})
        filename = definition.get('f')
        url = files.get(str(filename).lower())
        if not url:
            missing.append(name)
            continue
        cue = {'url': url, 'volume': definition.get('v', 100) / 100,
               'offset': definition.get('o', 0)}
        cues[name.upper()] = cue
        cues[str(sound_id)] = cue
    return cues, missing
