"""Read the client's audio aliases as data, without executing its ActionScript."""
from pathlib import Path
import re
import struct
import zlib

from retro_swf import read, exports, tags


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


def normalize_sound(name):
    """SOMA.playSound, loader unit 20879 (not a filename sanitizer)."""
    return name.replace(' ', '_').replace('é', 'e').replace('à', 'a').replace('-', '_').upper()


def action_strings(data, inherited_pool=()):
    """Read AVM1 literals, including function bodies, without running scripts."""
    offset, pool, strings = 0, inherited_pool, []
    while offset < len(data):
        op = data[offset]
        offset += 1
        size = 0
        if op >= 128:
            size = struct.unpack_from('<H', data, offset)[0]
            offset += 2
        payload = data[offset:offset + size]
        offset += size
        if op == 0x88:
            pool = [s.decode('utf-8', 'replace') for s in payload[2:].split(b'\0')[:-1]]
            strings.extend(pool)
        elif op == 0x96:
            # Register references are runtime values, not literal cue names.
            cursor = 0
            while cursor < len(payload):
                kind = payload[cursor]
                if kind == 4:
                    cursor += 2
                    continue
                end = (payload.index(0, cursor + 1) + 1 if kind == 0 else
                       cursor + {1: 5, 2: 1, 3: 1, 5: 2, 6: 9, 7: 5, 8: 2, 9: 3}[kind])
                strings.extend(v for v in push_values(payload[cursor:end], pool) if isinstance(v, str))
                cursor = end
        elif op in (0x9b, 0x8e):
            # DefineFunction/2 body follows, outside the action's header size.
            length = struct.unpack_from('<H', payload, len(payload) - 2)[0]
            strings.extend(action_strings(data[offset:offset + length], pool))
            offset += length
    return strings


def animation_sounds(items, audio):
    """Original cue names reachable from each exported animation.

    Silent exports remain empty; this lets the UI supply feedback only when
    both the caster gesture and the spell effect have no authored recording.
    """
    definitions = {struct.unpack_from('<H', d)[0]: list(tags(d, 4)) for c, d in items if c == 39}
    cache = {}

    def names(entries, ancestors=frozenset()):
        found = []
        for code, data in entries:
            if code == 12:
                strings = action_strings(data)
                if 'playSound' in strings:
                    found.extend(s for s in strings if normalize_sound(s) in audio['cues'] or s in audio['effects'])
            cid = None
            if code == 4:
                cid = struct.unpack_from('<H', data)[0]
            elif code in (26, 70) and data[0] & 2:
                start = 4 if code == 70 else 3
                if code == 70 and data[1] & 8:
                    start = data.index(0, start) + 1
                cid = struct.unpack_from('<H', data, start)[0]
            if cid in definitions and cid not in ancestors:
                if cid not in cache:
                    cache[cid] = names(definitions[cid], ancestors | {cid})
                found.extend(cache[cid])
        return list(dict.fromkeys(found))

    exported = {label: names(definitions.get(cid, []), frozenset({cid})) for label, cid in exports(items).items()}
    # Spell effects may attach exports dynamically (projectile/impact/trail).
    all_names = list(dict.fromkeys(names(items) + [s for cues in exported.values() for s in cues]))
    return exported, all_names


def import_animation_sounds(manifest, client):
    audio = manifest['audio']
    for aid, actor in manifest['actors'].items():
        source = client / f'clips/sprites/{aid}.swf'
        if source.is_file():
            actor['sounds'] = animation_sounds(read(source)[2], audio)[0]
    effects = {}
    for spell in manifest['spells'].values():
        effect = spell.get('effect')
        if effect and effect not in effects:
            source = client / 'clips/spells' / Path(effect).name
            effects[effect] = animation_sounds(read(source)[2], audio)[1] if source.is_file() else []
        spell['sounds'] = effects.get(effect, [])
    # GameActionsEx 301/304 -> sound unit 20776 method 0x191805 -> BIP;
    # 302/305 -> 0x191806 -> COUP_CRITIQUE. The latter's name is misleading.
    audio['combat'] = {'criticalHit': 'BIP', 'criticalFailure': 'COUP_CRITIQUE'}
    audio['combatSource'] = {'loaderUnits': [20776, 20835, 20879],
        'silentAnimationFallbacks': 'Original client recordings; simulator fallback, not authored per monster'}
