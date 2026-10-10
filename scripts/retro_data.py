"""Decode original client static-data assignments without executing client code."""
from pathlib import Path
import re
import struct
import zlib
from retro_swf import read


def push_values(data, pool):
    values, offset = [], 0
    while offset < len(data):
        kind = data[offset]
        offset += 1
        if kind == 0:
            end = data.index(0, offset)
            value, offset = data[offset:end].decode('utf-8'), end + 1
        elif kind in (2, 3):
            value = None
        elif kind in (1, 7):
            value = struct.unpack_from('<f' if kind == 1 else '<i', data, offset)[0]
            offset += 4
        elif kind == 5:
            value, offset = bool(data[offset]), offset + 1
        elif kind == 6:
            value = struct.unpack('<d', data[offset + 4:offset + 8] + data[offset:offset + 4])[0]
            offset += 8
        elif kind in (8, 9):
            index = data[offset] if kind == 8 else struct.unpack_from('<H', data, offset)[0]
            value, offset = pool[index], offset + (1 if kind == 8 else 2)
        else:
            raise ValueError(f'Unsupported static data value {kind}')
        values.append(value)
    return values


def data_tables(path):
    """Decode the linear assignments in lang/swf/*_*.swf.

    Only data construction is supported. The standard allowDomain preamble
    is consumed as a no-op; function definitions, jumps and other calls fail.
    Arrays are represented as dictionaries because their IDs are sparse.
    """
    variables = {}
    for code, data in read(path)[2]:
        if code != 12:
            continue
        offset, stack, pool = 0, [], []
        while offset < len(data):
            op = data[offset]
            offset += 1
            size = 0
            if op >= 128:
                size = struct.unpack_from('<H', data, offset)[0]
                offset += 2
            payload = data[offset:offset + size]
            offset += size
            if op == 0:
                break
            if op == 0x88:
                pool = [s.decode('utf-8') for s in payload[2:].split(b'\0')[:-1]]
                if len(pool) != struct.unpack_from('<H', payload)[0]:
                    raise ValueError('Invalid static constant pool')
            elif op == 0x96:
                stack.extend(push_values(payload, pool))
            elif op == 0x1c:
                stack.append(variables.get(stack.pop()))
            elif op == 0x1d:
                value, name = stack.pop(), stack.pop()
                variables[name] = value
            elif op == 0x40:
                name, count = stack.pop(), stack.pop()
                if name not in ('Object', 'Array') or count != 0:
                    raise ValueError(f'Unsupported constructor {name}')
                stack.append({})
            elif op == 0x43:
                result = {}
                for _ in range(stack.pop()):
                    value, key = stack.pop(), stack.pop()
                    result[key] = value
                stack.append(result)
            elif op == 0x42:
                stack.append({i: stack.pop() for i in range(stack.pop())})
            elif op == 0x4e:
                key, obj = stack.pop(), stack.pop()
                stack.append(obj.get(key) if isinstance(obj, dict) else None)
            elif op == 0x4f:
                value, key, obj = stack.pop(), stack.pop(), stack.pop()
                obj[key] = value
            elif op == 0x52:
                method, obj, count = stack.pop(), stack.pop(), stack.pop()
                if method != 'allowDomain' or count != 1 or obj is not None:
                    raise ValueError(f'Unsupported static data call {method}')
                stack.pop()
                stack.append(None)
            elif op == 0x47:  # Add2: concatenate the split condition strings.
                right, left = stack.pop(), stack.pop()
                stack.append(str(left) + str(right) if isinstance(left, str) or isinstance(right, str) else left + right)
            elif op == 0x17:
                stack.pop()
            else:
                raise ValueError(f'Unsupported static data opcode {op:#x}')
        if stack:
            raise ValueError('Unbalanced static data stack')
    return variables


def cached_tables(names, destination, client=None):
    """Import just identified SWF assets from the local game's cache.

    Prefer the newest French version, preserve its provenance and SHA256,
    and keep a portable copy. No cache headers or account data are exported.
    """
    import hashlib
    found = {name: [] for name in names}
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    roots = [destination]
    if client:
        roots.append(Path(client) / 'lang/swf')
    for root in roots:
        for name in names:
            for file in root.glob(f'{name}_fr_*.swf'):
                version = int(file.stem.rsplit('_', 1)[1])
                found[name].append((version, file.read_bytes()))
    cache = Path.home() / 'Library/Application Support/Dofus Retro/Cache'
    pattern = (rb'https://dofusretro\.cdn\.ankama\.com/static-data/\d+/lang/swf/('
               + b'|'.join(n.encode() for n in names) + rb')_fr_(\d+)\.swf')
    for file in cache.glob('*'):
        if not file.is_file():
            continue
        contents = file.read_bytes()
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
                    found[match[1].decode()].append((int(match[2]), contents[start:end]))
            except (zlib.error, struct.error):
                continue
    tables, sources = {}, {}
    for name, candidates in found.items():
        if not candidates:
            raise FileNotFoundError(f'Missing {name}_fr_*.swf in client cache or {destination}')
        version, data = max(candidates, key=lambda entry: entry[0])
        filename = f'{name}_fr_{version}.swf'
        path = destination / filename
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
        tables[name] = data_tables(path)
        sources[name] = {'file': filename, 'version': version, 'sha256': hashlib.sha256(data).hexdigest()}
    return tables, sources
