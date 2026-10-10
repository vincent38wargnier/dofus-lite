#!/usr/bin/env python3
"""Import Retro bosses, Poutchs and their recursive summon rosters.

The installed client owns levels, HP, AP, MP, initiative, resistances and spells.
Elemental characteristics/target masks are server data: legacy values and gaps
are explicitly identified. No server AI or dungeon scripts are in these SWFs.
"""
import copy
import hashlib
import json
import sys
from pathlib import Path

from retro_data import cached_tables
from retro_audio import import_animation_sounds
from retro_swf import adapt_static, adapt_sprite, display_bounds, exports, read, tags, place
from import_client_spells import array, client_grade, monster_rows, TARGET_RULES
from extract_spells import EFFECTS, derive_meta, load_sorts, monster_emoji, SQL
from import_retro_client import DEFAULT_CLIENT, OUT

ROOT = Path(__file__).resolve().parent.parent
ENCOUNTERS_FILE = ROOT / 'scripts/dungeon_encounters.json'
ELEMENTS = ['neutre', 'terre', 'feu', 'eau', 'air']
STATS = ['force', 'sagesse', 'intelligence', 'chance', 'agilite']
# Direct equivalents of effects_fr descriptions; no dungeon-specific guesses.
EFFECTS.update({
    78: {'kind': 'buffPm'}, 152: {'kind': 'debuffStat', 'stat': 'chance'},
    153: {'kind': 'debuffStat', 'stat': 'vitalite'},
    156: {'kind': 'debuffStat', 'stat': 'sagesse'},
    157: {'kind': 'debuffStat', 'stat': 'force'},
    179: {'kind': 'debuffStat', 'stat': 'heal'},
    219: {'kind': 'resistDebuff', 'element': 'neutre'},
    220: {'kind': 'damageReflection'},
    2112: {'kind': 'debuffStat', 'stat': 'summons'},
})


def boss_ids(tables):
    # The explicit Boss race also includes Grozilla and Grasmera, without d.
    return sorted(mid for mid, raw in tables['monsters']['M'].items()
                  if raw.get('d') or raw.get('b') == 1)


def complete_grades(raw):
    return sorted(int(k[1:]) for k, g in raw.items() if k.startswith('g') and k[1:].isdigit()
                  and all(field in g for field in ('l', 'lp', 'ap', 'mp', 'i', 'r', 's')))


def import_monster_actor(gfx):
    source = DEFAULT_CLIENT / f'clips/sprites/{gfx}.swf'
    _, _, items = read(source)
    definitions = [(c, p) for c, p in items if c not in (0, 1, 4, 5, 9, 12, 24, 26, 28, 43, 69, 70, 77)]
    poses = [display_bounds(definitions + list(tags(place(cid))) + [(1, b'')], all_frames=True)
             for name, cid in exports(items).items() if name.startswith('static')]
    # Preserve the foot origin and the 200:180 stage ratio used by BoardView.
    # Large animated bosses need space below/around that origin as well.
    factor = max([1] + [max(-left / 94, right / 94, -top / 134, bottom / 34)
                        for left, right, top, bottom in poses])
    bounds = tuple(value * factor for value in (-100, 100, -140, 40))
    actor = adapt_sprite(source, OUT / f'actors/{gfx}.swf', bounds=bounds)
    return {'url': f'actors/{gfx}.swf', **actor, 'standingBounds': [list(p) for p in poses]} if actor else None


def grade_sources(raw, row=None):
    grades = {grade: {**raw[f'g{grade}'], 'source': 'client'} for grade in complete_grades(raw)}
    # Some summoned creatures only expose level/resistances in the client.
    # Use the already-local server templates, never overwrite client values.
    if row:
        for grade in range(1, 7):
            if grade in grades:
                continue
            try:
                hp = int(row[8].split('|')[grade - 1])
                ap, mp = map(int, row[9].split('|')[grade - 1].split(';'))
                lvl, resistances = row[4].split('|')[grade - 1].split('@')
                entries = [dict(zip(('i', 'l'), map(int, s.split('@'))))
                           for s in row[7].split('|')[grade - 1].split(';') if '@' in s]
                if hp <= 10 and not entries:
                    continue  # Empty emulator placeholder, not usable evidence.
                source = {'l': int(lvl), 'lp': hp, 'ap': ap, 'mp': mp, 'i': 0,
                          'r': dict(enumerate(map(int, resistances.split(';')))),
                          's': dict(enumerate(entries))}
                source.update(raw.get(f'g{grade}', {}))
                source['source'] = 'client+AncestraRemake'
                if len(source['r']) >= 7:
                    grades[grade] = source
            except (ValueError, IndexError):
                pass
    return dict(sorted(grades.items()))


def import_monsters(tables):
    originals = tables['monsters']['M']
    legacy, legacy_spells = monster_rows(), load_sorts()
    bosses = set(boss_ids(tables))
    encounters = json.loads(ENCOUNTERS_FILE.read_text())['encounters']
    queue = [494, *(mid for mid in sorted(bosses) if complete_grades(originals[mid])),
             *(member['monsterId'] for room in encounters for member in room['members'])]
    result = {}

    def spell_data(sid, level, parents=()):
        source = tables['spells']['S'][sid]
        old = legacy_spells.get(sid, {})
        parsed = client_grade(source[f'l{level}'], old.get('effectTarget', ''))
        parsed.update(derive_meta(sid, source['n'], parsed, {}))
        parsed.update(id=sid, name=source['n'], description=source.get('d', ''),
                      key=f'monster_spell_{sid}', grade=level,
                      targetSource='AncestraRemake' if old.get('effectTarget') else 'unspecified')
        if parsed['rangeMax'] == 0:
            parsed['targetMode'] = 'self'
        elif parsed['targetMode'] == 'enemy':
            parsed['targetMode'] = 'cell'
        for effect in parsed['effects'] + parsed['critEffects']:
            if sid == 411:
                effect['targetMask'] = 2
                parsed['targetSource'] = 'client-description-reconstruction'
            if effect['kind'] in ('summon', 'staticSummon'):
                queue.append(effect['p1'])
            if effect['kind'] in ('glyph', 'trap', 'delayedSpell'):
                child = (effect['p1'], effect['p2'])
                raw_child = tables['spells']['S'].get(child[0], {})
                if child not in parents and raw_child.get(f'l{child[1]}'):
                    effect['trigger'] = copy.deepcopy(spell_data(*child, (*parents, (sid, level))))
                else:
                    effect['kind'] = 'unknown_trigger'
        for effects in (parsed['effects'], parsed['critEffects']):
            for index, effect in enumerate(effects):
                masks = TARGET_RULES.get(sid, [])
                if index < len(masks):
                    effect['targetMask'] = masks[index]
                    parsed['targetSource'] = 'shared-player-target-rules'
                if sid == 251:
                    # The legacy mask is empty. Abolissement only damages
                    # summons (historical Tainela guide), not player fighters.
                    effect['targetMask'] = 8
                    parsed['targetSource'] = 'historical-guide-reconstruction'
        return parsed

    visited = set()
    for mid in queue:
        if mid in visited:
            continue
        visited.add(mid)
        raw = originals.get(mid)
        if not raw:
            continue
        grades = {}
        for grade, source in grade_sources(raw, legacy.get(mid) if mid not in bosses else None).items():
            stats, stats_source = dict.fromkeys(STATS, 0), 'unavailable-zero-default'
            try:
                values = list(map(int, legacy[mid][6].split('|')[grade - 1].split(',')))
                if len(values) == 5:
                    stats, stats_source = dict(zip(STATS, values)), 'AncestraRemake'
            except (KeyError, ValueError, IndexError):
                pass
            if mid == 494:
                stats, stats_source = dict.fromkeys(STATS, 0), 'poutch-no-scaled-damage'
            entries = array(source['s'])
            described = [s for s in entries if tables['spells']['S'].get(s['i'], {}).get(f"l{s['l']}")]
            spells = [spell_data(s['i'], s['l']) for s in described]
            grades[str(grade)] = {
                'grade': grade, 'level': source['l'], 'baseHp': source['lp'],
                'basePa': source['ap'], 'basePm': source['mp'], 'initiative': source['i'],
                'resistances': dict(zip(ELEMENTS, array(source['r'])[:5])),
                'dodgePa': source['r'][5], 'dodgePm': source['r'][6],
                'stats': stats, 'statsSource': stats_source, 'spells': spells,
                'missingSpells': [s for s in entries if s not in described],
                'combatSource': source['source'],
            }
        if grades:
            result[str(mid)] = {
                'id': mid, 'name': raw['n'], 'gfx': raw['g'], 'boss': mid in bosses,
                'emoji': '🎯' if mid == 494 else monster_emoji(raw['n']),
                'behavior': 'poutch' if mid == 494 else 'utility', 'grades': grades,
            }
    def annotate(spell):
        missing = []
        for effect in spell['effects'] + spell['critEffects']:
            if effect['kind'] in ('summon', 'staticSummon') and str(effect['p2']) not in result.get(str(effect['p1']), {}).get('grades', {}):
                missing.append({'id': effect['p1'], 'grade': effect['p2']})
            if effect.get('trigger'):
                annotate(effect['trigger'])
        if missing:
            spell['missingSummons'] = missing
    for monster in result.values():
        for grade in monster['grades'].values():
            for spell in grade['spells']:
                annotate(spell)
    return result


def main():
    tables, sources = cached_tables(['monsters', 'spells', 'effects'], OUT / 'monsters/source', DEFAULT_CLIENT)
    monsters = import_monsters(tables)
    bosses = boss_ids(tables)
    encounters = json.loads(ENCOUNTERS_FILE.read_text())
    for room in encounters['encounters']:
        for member in room['members']:
            if not monsters.get(str(member['monsterId']), {}).get('grades'):
                raise ValueError(f"Missing final-room monster: {room['name']} / {member['monsterId']}")
    (ROOT / 'src/engine/dungeonData.json').write_text(json.dumps({
        **encounters, 'source': {'file': str(ENCOUNTERS_FILE.relative_to(ROOT)),
        'sha256': hashlib.sha256(ENCOUNTERS_FILE.read_bytes()).hexdigest()}}, ensure_ascii=False, indent=2) + '\n')
    data = {'sources': sources, 'serverSource': {'file': str(SQL.relative_to(ROOT)),
            'sha256': hashlib.sha256(SQL.read_bytes()).hexdigest()},
        'notes': [
            'Levels, HP, AP, MP, initiative, resistances and spell rosters come from the client, per grade.',
            'Elemental characteristics and target masks use separately labelled legacy server data where available; unknown characteristics default to zero.',
            'Bosses use the simulator utility AI, not official server AI. Dungeon scripts are not reproduced.',
            'Monster summons use client grade stats without player-level scaling; the arena limits each monster to eight living summons.',
            'Incomplete legacy/event boss entries are retained in unavailableBosses, never assigned invented HP or spells.',
        ], 'bosses': [mid for mid in bosses if str(mid) in monsters],
        'unavailableBosses': [{'id': mid, 'name': tables['monsters']['M'][mid]['n'],
                              'reason': 'missing-client-combat-grades'} for mid in bosses if str(mid) not in monsters],
        'monsters': monsters}
    missing_summons, unsupported = set(), set()
    def audit_spell(spell):
        for effect in spell['effects'] + spell['critEffects']:
            if effect['kind'].startswith('unknown'):
                unsupported.add((spell['id'], spell['name'], effect['id']))
            if effect['kind'] in ('summon', 'staticSummon') and str(effect['p2']) not in monsters.get(str(effect['p1']), {}).get('grades', {}):
                missing_summons.add((effect['p1'], effect['p2']))
            if effect.get('trigger'):
                audit_spell(effect['trigger'])
    for monster in monsters.values():
        for grade in monster['grades'].values():
            for spell in grade['spells']:
                audit_spell(spell)
    data['missingSummons'] = sorted(missing_summons)
    data['unsupportedEffects'] = sorted(unsupported)
    data['targetEvidence'] = {'251': 'https://dofus.jeuxonline.info/article/7711/donjon-tainela'}
    (ROOT / 'src/engine/monsterData.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    manifest_path = OUT / 'manifest.json'
    if manifest_path.exists() and '--data-only' not in sys.argv:
        manifest = json.loads(manifest_path.read_text())
        imported_actors = set()
        for monster in monsters.values():
            gfx = str(monster['gfx'])
            if gfx not in imported_actors:
                actor = import_monster_actor(gfx)
                if actor:
                    manifest['actors'][gfx] = actor
                imported_actors.add(gfx)
            artwork = DEFAULT_CLIENT / f'clips/artworks/big/{gfx}.swf'
            if artwork.exists() and '--actors-only' not in sys.argv:
                adapt_static(artwork, OUT / f'static/portraits/{gfx}.swf')
            manifest['monsters'][str(monster['id'])] = gfx
        for sid in {spell['id'] for monster in monsters.values()
                    for grade in monster['grades'].values() for spell in grade['spells']}:
            if '--actors-only' in sys.argv:
                continue
            icon = tables['spells']['S'][sid]['i']['up']
            original = DEFAULT_CLIENT / f'clips/spells/icons/up/{icon}.swf'
            if not original.exists():
                continue
            source = f'static/icons/monster-{sid}.swf'
            adapt_static(original, OUT / source)
            manifest['spells'].setdefault(str(sid), {}).update({
                'icon': f'icons/{sid}.png', 'iconSource': source, 'iconNeedsRender': True,
            })
        import_animation_sounds(manifest, DEFAULT_CLIENT)
        manifest_path.write_text(json.dumps(manifest))
    print(f"Imported {len(data['bosses'])} bosses, {len(monsters)} monster templates; "
          f"{len(data['unavailableBosses'])} incomplete boss records retained in audit.")
    print(f'Missing summon grades: {len(missing_summons)}; unsupported spell/effect pairs: {len(unsupported)}.')


if __name__ == '__main__':
    main()
