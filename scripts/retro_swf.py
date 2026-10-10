"""Small SWF container adapter. Artwork and nested animation timelines stay intact.

The generated root only selects exported clips and exposes an animation callback
to Ruffle. It contains no launcher, account, socket or game-server code.
"""
import struct
import zlib


def tags(data, offset=0):
    while offset < len(data):
        head = struct.unpack_from('<H', data, offset)[0]
        offset += 2
        code, size = head >> 6, head & 63
        if size == 63:
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
        if offset + size > len(data):
            raise ValueError('Truncated SWF tag')
        yield code, data[offset:offset + size]
        offset += size
        if code == 0:
            break


def tag(code, payload=b''):
    n = len(payload)
    return struct.pack('<H', (code << 6) | min(n, 63)) + (struct.pack('<I', n) if n >= 63 else b'') + payload


def read(path):
    data = path.read_bytes()
    if data[:3] not in (b'FWS', b'CWS'):
        raise ValueError(f'Unsupported SWF signature: {path}')
    body = zlib.decompress(data[8:]) if data[:3] == b'CWS' else data[8:]
    rect_len = (5 + 4 * (body[0] >> 3) + 7) // 8
    fps = struct.unpack_from('<H', body, rect_len)[0] / 256
    return data[3], fps, list(tags(body, rect_len + 4))


def exports(items):
    result = {}
    for code, p in items:
        if code != 56:
            continue
        offset = 2
        for _ in range(struct.unpack_from('<H', p)[0]):
            cid = struct.unpack_from('<H', p, offset)[0]
            end = p.index(0, offset + 2)
            result[p[offset + 2:end].decode('utf-8', 'replace')] = cid
            offset = end + 1
    return result


class Bits:
    def __init__(self, data, offset=0):
        self.data, self.bit = data, offset * 8

    def get(self, count, signed=False):
        value = 0
        for _ in range(count):
            value = (value << 1) | ((self.data[self.bit // 8] >> (7 - self.bit % 8)) & 1)
            self.bit += 1
        return value - (1 << count) if signed and count and value & (1 << (count - 1)) else value


def read_rect(data, offset=0):
    bits = Bits(data, offset)
    n = bits.get(5)
    return tuple(bits.get(n, True) / 20 for _ in range(4))


def read_matrix(data, offset):
    bits = Bits(data, offset)
    a, d, b, c = 1, 1, 0, 0
    if bits.get(1):
        n = bits.get(5)
        a, d = bits.get(n, True) / 65536, bits.get(n, True) / 65536
    if bits.get(1):
        n = bits.get(5)
        b, c = bits.get(n, True) / 65536, bits.get(n, True) / 65536
    n = bits.get(5)
    return a, b, c, d, bits.get(n, True) / 20, bits.get(n, True) / 20


def display_bounds(items, all_frames=False):
    """Bounds of display frames, including nested clip transforms."""
    definitions = {struct.unpack_from('<H', p)[0]: (c, p) for c, p in items
                   if c in (2, 22, 32, 83, 39, 11, 33, 46, 84)}
    cache = {}

    def union(rects):
        if not rects:
            return (0, 1, 0, 1)
        return min(r[0] for r in rects), max(r[1] for r in rects), min(r[2] for r in rects), max(r[3] for r in rects)

    def bounds(cid):
        if cid in cache:
            return cache[cid]
        if cid not in definitions:
            return (0, 1, 0, 1)
        code, p = definitions[cid]
        cache[cid] = (0, 1, 0, 1)
        cache[cid] = timeline(list(tags(p, 4))) if code == 39 else read_rect(p, 2)
        return cache[cid]

    def timeline(entries):
        display = {}
        snapshots = []
        for code, p in entries:
            if code == 1:
                if not all_frames:
                    break
                snapshots.append(dict(display))
                continue
            if code in (5, 28):
                display.pop(struct.unpack_from('<H', p, 2 if code == 5 else 0)[0], None)
                continue
            if code not in (4, 26, 70):
                continue
            if code == 4:
                cid, depth = struct.unpack_from('<HH', p)
                transform = read_matrix(p, 4)
            else:
                flags = p[0]
                start = 2 if code == 70 else 1
                depth = struct.unpack_from('<H', p, start)[0]
                cursor = start + 2
                cid, transform = display.get(depth, (None, (1, 0, 0, 1, 0, 0)))
                if code == 70 and p[1] & 8:
                    cursor = p.index(0, cursor) + 1
                if flags & 2:
                    cid = struct.unpack_from('<H', p, cursor)[0]
                    cursor += 2
                if flags & 4:
                    transform = read_matrix(p, cursor)
            if cid is not None:
                display[depth] = cid, transform
        rects = []
        for snapshot in snapshots + [display]:
            for cid, (a, b, c, d, tx, ty) in snapshot.values():
                left, right, top, bottom = bounds(cid)
                pts = [(a*x+c*y+tx, b*x+d*y+ty) for x in (left, right) for y in (top, bottom)]
                rects.append((min(x for x, _ in pts), max(x for x, _ in pts), min(y for _, y in pts), max(y for _, y in pts)))
        return union(rects)
    return timeline(items)


def adapt_static(path, target):
    _, fps, items = read(path)
    left, right, top, bottom = display_bounds(items)
    padding = max(right - left, bottom - top) * .04
    bounds = (left - padding, right + padding, top - padding, bottom + padding)
    # Isolate the first frame; original root scripts assume the game UI exists.
    out = []
    for code, p in items:
        if code == 1:
            break
        if code not in (0, 9, 12, 24, 69, 77):
            out.append(tag(code, p))
    out += [tag(12, b'\x07\0'), tag(1)]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(movie(out, bounds, fps))
    return bounds


def bits_pack(fields):
    bit_string = ''.join(format(v & ((1 << n) - 1), f'0{n}b') for v, n in fields if n)
    bit_string += '0' * (-len(bit_string) % 8)
    return int(bit_string, 2).to_bytes(len(bit_string) // 8, 'big')


def rect(bounds):
    values = [round(x * 20) for x in bounds]
    n = max(abs(x).bit_length() + 1 for x in values)
    return bits_pack([(n, 5)] + [(x, n) for x in values])


def matrix(x=0, y=0, sx=1, sy=1, r0=0, r1=0):
    fields = []
    scaled = sx != 1 or sy != 1
    fields.append((int(scaled), 1))
    if scaled:
        a, b = round(sx * 65536), round(sy * 65536)
        n = max(abs(a).bit_length(), abs(b).bit_length()) + 1
        fields += [(n, 5), (a, n), (b, n)]
    rotated = r0 != 0 or r1 != 0
    fields.append((int(rotated), 1))
    if rotated:
        a, b = round(r0 * 65536), round(r1 * 65536)
        n = max(abs(a).bit_length(), abs(b).bit_length()) + 1
        fields += [(n, 5), (a, n), (b, n)]
    x, y = round(x * 20), round(y * 20)
    n = max(abs(x).bit_length(), abs(y).bit_length()) + 1
    fields += [(n, 5), (x, n), (y, n)]
    return bits_pack(fields)


def place(cid, depth=1, x=0, y=0, sx=1, sy=1, r0=0, r1=0, name=None):
    flags = b'\x26' if name is not None else b'\x06'
    return tag(26, flags + struct.pack('<HH', depth, cid) + matrix(x, y, sx, sy, r0, r1)
               + (name.encode() + b'\0' if name is not None else b''))


def movie(items, bounds, fps=50, frames=1):
    body = rect(bounds) + struct.pack('<HH', round(fps * 256), frames) + b''.join(items) + tag(0)
    return b'CWS\x08' + struct.pack('<I', len(body) + 8) + zlib.compress(body)


def action(code, payload=b''):
    return bytes([code]) + (struct.pack('<H', len(payload)) + payload if code >= 128 else b'')


def push(value):
    if isinstance(value, str):
        p = b'\0' + value.encode() + b'\0'
    elif value is None:
        p = b'\x02'
    else:
        p = b'\x07' + struct.pack('<i', value)
    return action(0x96, p)


def variable(name):
    return push(name) + action(0x1c)


def member(obj, name):
    return obj + push(name) + action(0x4e)


def method(obj, name, args):
    return b''.join(reversed(args)) + push(len(args)) + obj + push(name) + action(0x52)


def function(name, params, body):
    # AVM1's DefineFunction action length excludes its code body. Including
    # it makes the VM skip the following registration/stop instructions.
    header = (name.encode() + b'\0' + struct.pack('<H', len(params))
              + b''.join(p.encode() + b'\0' for p in params)
              + struct.pack('<H', len(body) + 1))
    return action(0x9b, header) + body + b'\0'


def set_member(obj, name, value):
    return obj + push(name) + value + action(0x4f)


def when(condition, body):
    return condition + action(0x12) + action(0x9d, struct.pack('<h', len(body))) + body


def object_value(values):
    return b''.join(push(key) + value for key, value in values.items()) + push(len(values)) + action(0x43)


def animation_callback():
    body = variable('_root') + push('idleLabel') + push('static') + method(variable('label'), 'substr', [push(-1)]) + action(0x47) + action(0x4f)
    # gotoAndStop on the current frame does not recreate its child. Repeated
    # casts of the same spell must restart the original exported clip too.
    actor = member(variable('_root'), 'actor')
    restart = method(actor, 'removeMovieClip', []) + action(0x17)
    restart += method(variable('_root'), 'attachMovie', [variable('label'), push('actor'), push(1)]) + action(0x17)
    body += when(member(variable('_root'), 'currentAnimation') + variable('label') + action(0x66), restart)
    body += method(variable('_root'), 'gotoAndStop', [variable('label')]) + action(0x17)
    body += member(variable('_root'), '_currentframe') + action(0x3e)
    register = function('animate', ['label'], body)
    ei = member(member(variable('flash'), 'external'), 'ExternalInterface')
    register += method(ei, 'addCallback', [push('animate'), variable('_root'), variable('animate')]) + action(0x17)
    register += function('currentFrame', [], member(variable('_root'), '_currentframe') + action(0x3e))
    register += method(ei, 'addCallback', [push('currentFrame'), variable('_root'), variable('currentFrame')]) + action(0x17)
    # The original character timelines call SOMA.playSound by export name.
    sound = method(ei, 'call', [push('dofusLiteSound'), variable('sound'), member(variable('_root'), 'soundScope')]) + action(0x17)
    register += function('retroSound', ['sound'], sound)
    register += variable('_global') + push('SOMA') + push(0) + action(0x43) + action(0x4f)
    register += member(variable('_global'), 'SOMA') + push('playSound') + variable('retroSound') + action(0x4f)
    # Original hit/cast timelines ask GAC to return the actor to its standing
    # pose when finished. Keep this contract so previews do not loop hit sounds.
    idle = method(variable('_root'), 'gotoAndStop', [member(variable('_root'), 'idleLabel')]) + action(0x17)
    to_idle = variable('kind') + push('Static') + action(0x66) + action(0x12) + action(0x9d, struct.pack('<h', len(idle))) + idle
    register += function('applyAnim', ['clip', 'kind'], to_idle)
    register += function('applyColor', ['clip', 'color'], b'')
    register += variable('_global') + push('GAC') + push(0) + action(0x43) + action(0x4f)
    for name in ('applyAnim', 'applyColor'):
        register += member(variable('_global'), 'GAC') + push(name) + variable(name) + action(0x4f)
    register += variable('_root') + push('idleLabel') + push('staticR') + action(0x4f)
    return register


def timeline_lengths(items):
    """Include nested clips: most Retro exports are one-frame wrappers."""
    definitions = {struct.unpack_from('<H', p)[0]: list(tags(p, 4)) for c, p in items if c == 39}
    cache = {}

    def length(entries, ancestors=frozenset()):
        frame, end = 0, 1
        for code, payload in entries:
            if code == 1:
                frame += 1
                end = max(end, frame)
            cid = None
            if code == 4:
                cid = struct.unpack_from('<H', payload)[0]
            elif code in (26, 70) and payload[0] & 2:
                offset = 4 if code == 70 else 3
                if code == 70 and payload[1] & 8:
                    offset = payload.index(0, offset) + 1
                cid = struct.unpack_from('<H', payload, offset)[0]
            if cid in definitions and cid not in ancestors:
                if cid not in cache:
                    cache[cid] = length(definitions[cid], ancestors | {cid})
                end = max(end, frame + cache[cid])
        return end

    root = length(items)
    for cid in definitions:
        if cid not in cache:
            cache[cid] = length(definitions[cid], frozenset({cid}))
    return root, cache


def adapt_sprite(path, target, bounds=(-100, 100, -140, 40)):
    _, fps, items = read(path)
    links = exports(items)
    names = [n for n in links if n != '[liaison]']
    if not names:
        return None
    # Start at a standing pose; each other exported animation gets a root frame.
    names.sort(key=lambda n: (n != 'staticR', n))
    excluded = {0, 1, 4, 5, 9, 12, 24, 26, 28, 43, 69, 70, 77}
    out = [tag(69, struct.pack('<I', 0))]
    out += [tag(c, p) for c, p in items if c not in excluded]
    for i, name in enumerate(names):
        out += [tag(43, name.encode() + b'\0')]
        # Explicitly remove the dynamic clip. Timeline placement alone can
        # retain an old child's enter-frame/sound handlers when rewinding.
        actor = member(variable('_root'), 'actor')
        remove = method(actor, 'removeMovieClip', []) + action(0x17)
        reset = actor + action(0x12) + action(0x9d, struct.pack('<h', len(remove))) + remove
        reset += method(variable('_root'), 'attachMovie', [push(name), push('actor'), push(1)]) + action(0x17)
        reset += set_member(variable('_root'), 'currentAnimation', push(name))
        out += [tag(12, (animation_callback() if i == 0 else b'') + reset + b'\x07\0'), tag(1)]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(movie(out, bounds, fps, len(names)))
    _, frames = timeline_lengths(items)
    return {'animations': names, 'fps': fps, 'bounds': list(bounds),
            'durations': {name: round(frames.get(links[name], 1) / fps * 1000) for name in names}}


def adapt_effect(path, target):
    """Keep original clips; host them using the client's SpellManager contract.

    Motion samples come from its port in retroSpellEffect.js. Their indices are
    native frames, so accelerating playback also accelerates nested timelines.
    """
    _, source_fps, items = read(path)
    fps = 60  # All loaded libraries share the host's triple-framerate clock.
    links = exports(items)
    lengths, nested_lengths = timeline_lengths(items)
    display_codes = {1, 4, 5, 12, 26, 28, 43, 70}
    definitions = [tag(c, p) for c, p in items if c not in display_codes | {0, 9, 24, 69, 77}]
    timeline = [tag(c, p) for c, p in items if c in display_codes]
    count = sum(c == 1 for c, _ in items)
    sprite_id = 65534
    definitions.append(tag(39, struct.pack('<HH', sprite_id, count) + b''.join(timeline) + tag(0)))
    root = variable('_root')
    container = member(root, 'effect')
    number = lambda name: member(root, name) + action(0x4a)
    call = lambda obj, name, args: method(obj, name, args) + action(0x17)
    props = {
        'cellFrom': object_value({'x': number('fromX'), 'y': number('fromY')}),
        'cellTo': object_value({'x': number('toX'), 'y': number('toY')}),
        'level': number('spellLevel'), 'angle': number('effectAngle'),
        '_x': number('effectX'), '_y': number('effectY'),
        '_xscale': number('effectScaleX'), '_yscale': number('effectScaleY'),
    }
    # end() signals completion to the battle sequence; it does not destroy
    # the whole effect and truncate its original impact/fade-out timelines.
    init = function('end', [], set_member(root, 'ended', push(1))) + animation_callback()
    for name in ('cellFrom', 'cellTo', 'level', 'angle'):
        init += set_member(root, name, props[name])
    props['end'] = variable('end')
    # Timeline placement runs a child's first-frame actions before the root's
    # actions in Ruffle. Attach after SOMA and the spell's parameters exist so
    # first-frame sounds (Pression, Bond, Colère…) are not silently discarded.
    definitions.append(tag(56, struct.pack('<HH', 1, sprite_id) + b'retroEffect\0'))
    init += call(root, 'attachMovie', [push('retroEffect'), push('effect'), push(1), object_value(props)])

    def is_type(kind):
        return number('effectType') + push(kind) + action(0x66)

    # Beams keep their original root timeline, rotate its named child, and
    # instantiate the target's exported impact if that library contains one.
    beam = set_member(member(container, 'rotate'), '_rotation', number('effectAngle'))
    if 'shoot' in links:
        beam += call(container, 'attachMovie', [push('shoot'), push('shoot'), push(10), object_value({
            '_x': number('targetX'), '_y': number('targetY')})])
    init += when(is_type(20) + is_type(21) + action(0x11), beam)
    if 'move' in links:
        init += when(is_type(30) + is_type(31) + action(0x11),
                     call(container, 'attachMovie', [push('move'), push('move'), push(2)]))

    # Drive move/shoot/duplicate exports one native frame at a time. A trail's
    # old clips keep playing after a later clip is spawned, as in the client.
    rows = member(root, 'motionRows')
    index = member(root, 'motionIndex')
    row = member(root, 'motionRow')
    value = lambda i: row + push(i) + action(0x4e) + action(0x4a)
    update = set_member(root, 'motionRow', method(rows + index + action(0x4e), 'split', [push(',')]))
    update += set_member(root, 'motionIndex', index + push(1) + action(0x47))
    moving = member(container, 'move')
    moving_props = b''.join(set_member(moving, prop, value(i)) for i, prop in enumerate(('_x', '_y', '_rotation'), 1))
    update += when(value(0) + push(1) + action(0x66), moving_props)
    if 'shoot' in links:
        impact = call(moving, 'removeMovieClip', [])
        impact += call(container, 'attachMovie', [push('shoot'), push('shoot'), push(2), object_value({
            '_x': value(1), '_y': value(2), '_rotation': value(3)})])
        update += when(value(0) + push(2) + action(0x66), impact)
    if 'duplicate' in links:
        duplicate = call(container, 'attachMovie', [push('duplicate'), push('duplicate') + index + action(0x47),
                            index + push(10) + action(0x47), object_value({'_x': value(1), '_y': value(2)})])
        update += when(value(0) + push(3) + action(0x66), duplicate)
    finished = root + push('onEnterFrame') + action(0x3a) + action(0x17)
    finished += call(root, 'end', [])
    update += when(index + member(rows, 'length') + action(0x48) + action(0x12), finished)
    init += function('advanceEffect', [], update)
    start = set_member(root, 'motionRows', method(member(root, 'motion'), 'split', [push(';')]))
    start += set_member(root, 'motionIndex', push(0))
    start += set_member(root, 'onEnterFrame', variable('advanceEffect'))
    init += when(member(root, 'motion'), start)

    # Browser regression proofs can inspect the actual Flash runtime, not just
    # the React props used to configure it.
    state = object_value({key: member(container, key) for key in ('level', 'angle', 'cellFrom', 'cellTo', '_x', '_y')}
                         | {'step': index, 'ended': member(root, 'ended'),
                            'moveX': member(moving, '_x'), 'moveY': member(moving, '_y'),
                            'shootX': member(member(container, 'shoot'), '_x'),
                            'shootY': member(member(container, 'shoot'), '_y')})
    init += function('effectState', [], state + action(0x3e))
    ei = member(member(variable('flash'), 'external'), 'ExternalInterface')
    init += call(ei, 'addCallback', [push('effectState'), root, variable('effectState')])
    definitions += [tag(12, init + b'\x07\0'), tag(1)]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(movie(definitions, (-200, 200, -200, 200), fps))
    export_frames = {name: nested_lengths.get(links[name], 1) for name in ('move', 'shoot', 'duplicate') if name in links}
    duration = max(lengths, *export_frames.values()) if export_frames else lengths
    return {'duration': max(500, round(duration / fps * 1000)), 'fps': fps, 'sourceFps': source_fps,
            'frames': lengths, 'exportFrames': export_frames}
