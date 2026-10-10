"""Compare all 72 in-game characteristic tables against Ankama's online SWF."""
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path
from retro_data import data_tables

URL = 'https://dofusretro.cdn.ankama.com/static-data/612/lang/swf/classes_fr_1391.swf'
CLASSES = ['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP',
           'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']
STATS = {'force': 10, 'vitalite': 11, 'sagesse': 12, 'chance': 13,
         'agilite': 14, 'intelligence': 15}


def array(value):
    return [value[key] for key in sorted(value)]


def main():
    raw = urllib.request.urlopen(URL, timeout=30).read()
    with tempfile.TemporaryDirectory() as temporary:
        swf = Path(temporary) / 'classes.swf'
        swf.write_bytes(raw)
        online = data_tables(swf)['G']
    local = json.loads((Path(__file__).resolve().parents[1] / 'src/engine/equipmentData.json').read_text())
    errors = []
    for number, class_id in enumerate(CLASSES, 1):
        for stat, stat_id in STATS.items():
            tiers = [array(row) for row in array(online[number][f'b{stat_id}'])]
            if tiers != local['caps'][class_id][stat]:
                errors.append(f'{class_id}.{stat}: online={tiers}, local={local["caps"][class_id][stat]}')
    print(json.dumps({'source': URL, 'sha256': hashlib.sha256(raw).hexdigest(),
                      'checked': 72, 'differences': errors}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
