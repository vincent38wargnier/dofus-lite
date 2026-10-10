#!/usr/bin/env python3
"""Passive Dofus Retro observer: discover a game socket, capture, or read a PCAP.

No proxy, injection, client modification, or network writes. Live capture uses
macOS tcpdump and needs BPF permission (normally sudo). Only the selected game
connection is captured. Raw captures are not saved. Unknown messages, chat and
authentication payloads are represented by metadata, never written verbatim.
"""
import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
MAX_BUFFER = 2 * 1024 * 1024
FM_INFO = {117: 'failure_with_stat_loss', 183: 'failure', 194: 'success_with_stat_loss'}
STAT_LABELS = {111: 'PA', 117: 'Portée', 118: 'Force', 119: 'Agilité',
    115: 'Coups critiques', 123: 'Chance', 124: 'Sagesse', 125: 'Vitalité',
    126: 'Intelligence', 128: 'PM', 138: '% dommages', 112: 'Dommages',
    178: 'Soins', 174: 'Initiative', 176: 'Prospection', 182: 'Invocations'}
STAT_LABELS.update({210 + i: '% résistance ' + e for i, e in enumerate(('terre', 'eau', 'air', 'feu', 'neutre'))})
STAT_LABELS.update({240 + i: 'Résistance ' + e for i, e in enumerate(('terre', 'eau', 'air', 'feu', 'neutre'))})
STAT_LABELS.update({220: 'Renvoi de dommages', 158: 'Pods', 225: 'Dommages pièges', 226: '% dommages pièges'})


class CaptureError(ValueError):
    pass


def endpoint(value):
    host, port = value.rsplit(':', 1)
    host = str(ipaddress.ip_address(host.strip('[]')))
    port = int(port)
    if not 0 < port < 65536:
        raise ValueError('Invalid port')
    return host, port


def endpoint_text(ep):
    return f'[{ep[0]}]:{ep[1]}' if ':' in ep[0] else f'{ep[0]}:{ep[1]}'


def discover(pid=None):
    processes = subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True)
    pids = [line.split(None, 1)[0] for line in processes.splitlines()
            if 'Dofus Retro' in line and (pid is None or line.split()[0] == str(pid))]
    if not pids:
        return []
    result = subprocess.run(['lsof', '-nP', '-a', '-p', ','.join(pids), '-iTCP',
                             '-sTCP:ESTABLISHED', '-Fpn'], capture_output=True, text=True)
    connections, seen, owner = [], set(), None
    for line in result.stdout.splitlines():
        if line.startswith('p'):
            owner = int(line[1:])
        elif line.startswith('n') and '->' in line:
            local, server = map(endpoint, line[1:].split(' ', 1)[0].split('->'))
            if ipaddress.ip_address(server[0]).is_loopback or (local, server) in seen:
                continue
            seen.add((local, server))
            connections.append({'pid': owner, 'local': endpoint_text(local),
                                'server': endpoint_text(server)})
    return connections


def capture_filter(local, server):
    # These values have already been parsed as IP addresses and integer ports.
    return (f'tcp and host {local[0]} and host {server[0]} '
            f'and port {local[1]} and port {server[1]}')


def interface_for(server):
    result = subprocess.run(['route', '-n', 'get', server[0]], capture_output=True, text=True)
    match = re.search(r'^\s*interface:\s*(\S+)', result.stdout, re.M)
    if not match:
        raise CaptureError('Cannot determine interface; pass --interface en0 (or the correct interface).')
    return match[1]


def read_exact(stream, size, allow_eof=False):
    data = bytearray()
    while len(data) < size:
        chunk = stream.read(size - len(data))
        if not chunk:
            if not data and allow_eof:
                return None
            raise CaptureError('Truncated PCAP stream')
        data.extend(chunk)
    return bytes(data)


def pcap_packets(stream):
    header = read_exact(stream, 24, allow_eof=True)
    if header is None:
        raise CaptureError('No PCAP header received; capture did not start.')
    magics = {b'\xd4\xc3\xb2\xa1': ('<', 1e6), b'\xa1\xb2\xc3\xd4': ('>', 1e6),
              b'\x4d\x3c\xb2\xa1': ('<', 1e9), b'\xa1\xb2\x3c\x4d': ('>', 1e9)}
    if header[:4] not in magics:
        raise CaptureError('Expected classic PCAP (pcapng is not supported).')
    endian, divisor = magics[header[:4]]
    major, minor, _, _, snaplen, linktype = struct.unpack(endian + 'HHIIII', header[4:])
    linktype &= 0xffff
    if (major, minor) != (2, 4) or linktype not in (0, 1, 12, 101, 108, 113, 228, 229, 276):
        raise CaptureError(f'Unsupported PCAP version or link type: {major}.{minor}, {linktype}')
    while True:
        raw = read_exact(stream, 16, allow_eof=True)
        if raw is None:
            return
        seconds, fraction, captured, original = struct.unpack(endian + 'IIII', raw)
        if captured > MAX_BUFFER or captured > snaplen or captured > original:
            raise CaptureError('Invalid or oversized PCAP packet length')
        frame = read_exact(stream, captured)
        if captured != original:
            raise CaptureError('Truncated captured packet: use tcpdump -s 0')
        yield seconds + fraction / divisor, linktype, frame


@dataclass
class Segment:
    source: tuple
    target: tuple
    sequence: int
    flags: int
    payload: bytes


def tcp_segment(frame, linktype):
    if linktype == 1:
        if len(frame) < 14:
            raise CaptureError('Truncated Ethernet header')
        protocol, offset = struct.unpack_from('!H', frame, 12)[0], 14
        while protocol in (0x8100, 0x88a8):
            if len(frame) < offset + 4:
                raise CaptureError('Truncated VLAN header')
            protocol = struct.unpack_from('!H', frame, offset + 2)[0]
            offset += 4
        if protocol not in (0x800, 0x86dd):
            return None
    elif linktype in (0, 108):
        offset = 4
    elif linktype == 113:
        offset = 16
    elif linktype == 276:
        offset = 20
    else:
        offset = 0
    data = frame[offset:]
    if not data:
        raise CaptureError('Missing IP packet')
    version = data[0] >> 4
    if version == 4:
        if len(data) < 20:
            raise CaptureError('Truncated IPv4 header')
        ihl = (data[0] & 15) * 4
        total = struct.unpack_from('!H', data, 2)[0]
        if ihl < 20 or total < ihl or total > len(data):
            raise CaptureError('Invalid IPv4 length')
        if data[9] != 6:
            return None
        if struct.unpack_from('!H', data, 6)[0] & 0x3fff:
            raise CaptureError('Fragmented IP packet: reassemble IP before decoding')
        source, target = socket.inet_ntop(socket.AF_INET, data[12:16]), socket.inet_ntop(socket.AF_INET, data[16:20])
        tcp = data[ihl:total]
    elif version == 6:
        if len(data) < 40:
            raise CaptureError('Truncated IPv6 header')
        total = 40 + struct.unpack_from('!H', data, 4)[0]
        if total > len(data):
            raise CaptureError('Truncated IPv6 payload')
        source = socket.inet_ntop(socket.AF_INET6, data[8:24])
        target = socket.inet_ntop(socket.AF_INET6, data[24:40])
        next_header, position = data[6], 40
        while next_header in (0, 43, 60):
            if position + 2 > total:
                raise CaptureError('Truncated IPv6 extension')
            next_header, size = data[position], (data[position + 1] + 1) * 8
            position += size
        if next_header == 44:
            raise CaptureError('Fragmented IPv6 packet')
        if next_header != 6:
            return None
        tcp = data[position:total]
    else:
        return None
    if len(tcp) < 20:
        raise CaptureError('Truncated TCP header')
    sport, dport, sequence = struct.unpack_from('!HHI', tcp)
    size = (tcp[12] >> 4) * 4
    if size < 20 or size > len(tcp):
        raise CaptureError('Invalid TCP header length')
    return Segment((source, sport), (target, dport), sequence, tcp[13], tcp[size:])


def sequence_difference(a, b):
    return ((a - b + 2**31) % 2**32) - 2**31


class Reassembler:
    """Ordered TCP bytes, dropping retransmissions and retaining gaps explicitly."""
    def __init__(self):
        self.next = None
        self.pending = []
        self.mid_connection = True

    def push(self, sequence, payload, syn=False):
        if syn:
            self.next = (sequence + 1) % 2**32
            self.pending.clear()
            self.mid_connection = False
            sequence = self.next
        if self.next is None:
            self.next = sequence
        if not payload:
            return b''
        self.pending.append((sequence, payload))
        if len(self.pending) > 4096 or sum(len(p) for _, p in self.pending) > MAX_BUFFER:
            raise CaptureError('TCP gap/reordering buffer exceeded; do not infer missing attempts')
        output = bytearray()
        while self.pending:
            self.pending.sort(key=lambda x: sequence_difference(x[0], self.next))
            seq, data = self.pending[0]
            delta = sequence_difference(seq, self.next)
            if delta > 0:
                break
            self.pending.pop(0)
            data = data[-delta:]
            if data:
                output.extend(data)
                self.next = (self.next + len(data)) % 2**32
        return bytes(output)


class Framer:
    def __init__(self):
        self.buffer = bytearray()
        self.mode = None

    def feed(self, data):
        self.buffer.extend(data)
        if len(self.buffer) > MAX_BUFFER:
            raise CaptureError('No message delimiter within 2 MiB; stream may be encoded')
        if self.mode is None:
            if self.buffer and self.buffer[0] in (20, 21, 22, 23) and len(self.buffer) < 5:
                return []
            if len(self.buffer) < 5 and b'\0' not in self.buffer:
                return []
            self.mode = ('tls' if len(self.buffer) >= 5 and self.buffer[0] in (20, 21, 22, 23)
                         and self.buffer[1] == 3 and self.buffer[2] <= 4 else 'xmlsocket')
        messages = []
        if self.mode == 'tls':
            while len(self.buffer) >= 5:
                length = struct.unpack_from('!H', self.buffer, 3)[0]
                if self.buffer[0] not in (20, 21, 22, 23) or self.buffer[1] != 3 or length > 18432:
                    raise CaptureError('Invalid TLS record boundary')
                if len(self.buffer) < 5 + length:
                    break
                messages.append({'kind': 'tls_record', 'record_type': self.buffer[0],
                                 'bytes': length, 'content_decoded': False})
                del self.buffer[:5 + length]
        else:
            while b'\0' in self.buffer:
                end = self.buffer.index(0)
                message = bytes(self.buffer[:end]).strip(b'\r\n')
                del self.buffer[:end + 1]
                if message:
                    messages.append(message)
        return messages


def effect_values(raw):
    values = []
    for entry in raw.split(','):
        parts = entry.split('#')
        if not parts[0]:
            continue
        if not re.fullmatch(r'-?[0-9a-fA-F]+', parts[0]):
            raise ValueError('Invalid effect ID')
        effect = int(parts[0], 16)
        args = [int(s, 16) if re.fullmatch(r'-?[0-9a-fA-F]+', s) else None for s in parts[1:4]]
        # Text effects can contain signatures; do not retain text arguments.
        values.append({'effect': effect, 'label': STAT_LABELS.get(effect), 'args': args})
    return values


def decode_message(raw, direction, scope='fm'):
    try:
        s = raw.decode('utf-8')
    except UnicodeDecodeError:
        return {'kind': 'undecoded', 'bytes': len(raw), 'reason': 'non_utf8'}
    event = None
    if re.fullmatch(r'[0-9a-fA-F]{6,}', s):
        return {'kind': 'encoded_message', 'bytes': len(raw), 'content_decoded': False}
    if direction == 'client_to_server':
        if s == 'EK':
            event = {'kind': 'exchange_ready', 'note': 'fusion request in a crafting workshop; otherwise exchange ready'}
        elif re.fullmatch(r'EMR\d+', s):
            event = {'kind': 'craft_repeat', 'count': int(s[3:])}
        elif s == 'EMr':
            event = {'kind': 'craft_repeat_stop'}
        elif re.fullmatch(r'EMO(?:[+-]\d+\|\d+(?:\|\d+)?)+', s):
            event = {'kind': 'ingredient_request', 'moves': [
                {'add': m[0] == '+', 'uid': int(m[1]), 'quantity': int(m[2])}
                for m in re.findall(r'([+-])(\d+)\|(\d+)(?:\|\d+)?', s[3:])]}
        elif s == 'EV':
            event = {'kind': 'exchange_leave'}
        elif re.fullmatch(r'ER\d+\|\d*(?:\|\d+)?', s):
            fields = s[2:].split('|')
            event = {'kind': 'exchange_request', 'exchange_type': int(fields[0])}
        elif re.fullmatch(r'Ec\d+', s):
            event = {'kind': 'craft_quantity', 'quantity': int(s[2:])}
        elif re.fullmatch(r'EF[ar]\d+;\d+', s):
            uid, quantity = map(int, s[3:].split(';'))
            event = {'kind': 'secure_ingredient_request', 'add': s[2] == 'a', 'uid': uid, 'quantity': quantity}
        elif re.fullmatch(r'EFm[01];\d+;\d+', s):
            to_craft, uid, quantity = map(int, s[3:].split(';'))
            event = {'kind': 'secure_ingredient_move', 'to_craft': bool(to_craft), 'uid': uid, 'quantity': quantity}
        elif re.fullmatch(r'EF[bl][01]', s):
            event = {'kind': 'secure_bag_lock' if s[2] == 'b' else 'secure_auto_craft', 'enabled': s[3] == '1'}
    else:
        if s.startswith('EcK;'):
            template = s[4:].split(';', 1)[0]
            if template.isdigit():
                event = {'kind': 'craft_result', 'result': 'success', 'template': int(template),
                         'critical_success': None}
        elif s in ('EcEF', 'EcEI'):
            event = {'kind': 'craft_result', 'result': 'failure' if s == 'EcEF' else 'invalid_recipe'}
        elif s.startswith('Im'):
            codes = []
            for part in s[3:].split('|'):
                number = part.split(';', 1)[0]
                if number.isdigit() and int(number) in FM_INFO:
                    codes.append({'id': int(number), 'meaning': FM_INFO[int(number)]})
            if s[2:3] == '0' and codes:
                event = {'kind': 'fm_information', 'messages': codes}
        elif s.startswith(('OAKO', 'OCO')):
            body = s[4:].replace('*O', ';') if s.startswith('OAKO') else s[3:].replace('*', ';')
            items = []
            for record in body.strip(';').split(';'):
                if not record:
                    continue
                fields = record.split('~', 4)
                if len(fields) != 5:
                    raise ValueError('Unexpected inventory object structure')
                uid, template, quantity = [int(x, 16) for x in fields[:3]]
                position = int(fields[3], 16) if fields[3] else None
                items.append({'uid': uid, 'template': template, 'quantity': quantity,
                              'position': position, 'effects': effect_values(fields[4])})
            event = {'kind': 'item_update', 'items': items}
        elif s.startswith(('EmKO', 'EmEO', 'EMKO')):
            prefix = 'EMKO' if s.startswith('EMKO') else s[:4]
            sign, fields = s[len(prefix):len(prefix) + 1], s[len(prefix) + 1:].split('|', 3)
            if sign not in '+-':
                raise ValueError('Unexpected exchange object sign')
            item = {'uid': int(fields[0]), 'add': sign == '+'}
            if len(fields) >= 2:
                item['quantity'] = int(fields[1])
            if len(fields) >= 4:
                item.update(template=int(fields[2]), effects=effect_values(fields[3]))
            event = {'kind': 'exchange_item_update', 'items': [item], 'status': prefix[2]}
        elif s.startswith(('EFm+', 'EFm-')):
            fields = s[4:].split('|', 4)
            if len(fields) != 5:
                raise ValueError('Unexpected secure craft movement')
            container, uid, quantity, template = map(int, fields[:4])
            event = {'kind': 'secure_item_update', 'container': container, 'items': [
                {'uid': uid, 'quantity': quantity, 'template': template,
                 'add': s[3] == '+', 'effects': effect_values(fields[4])}]}
        elif s == 'EFl':
            event = {'kind': 'secure_loop_started'}
        elif re.fullmatch(r'OQ\d+\|\d+', s):
            uid, quantity = map(int, s[2:].split('|'))
            event = {'kind': 'item_quantity', 'uid': uid, 'quantity': quantity}
        elif re.fullmatch(r'OR\d+', s):
            event = {'kind': 'item_removed', 'uid': int(s[2:])}
        elif re.fullmatch(r'ECK\d+(?:\|[0-9;,+-]*)?', s):
            event = {'kind': 'exchange_open', 'exchange_type': int(s[3:].split('|', 1)[0])}
        elif s.startswith('EV') and len(s) <= 3:
            event = {'kind': 'exchange_closed'}
    if event is not None:
        # Structured values only: never accidentally persist auth or chat payloads.
        event['opcode'] = re.match(r'[A-Za-z]+', s)[0]
        return event
    if scope == 'all':
        # Restrict the label to known families. Unknown data may itself be a token.
        family = s[0] if s and s[0] in 'AEGIOBbHgkqrp' else '?'
        return {'kind': 'other_message', 'family': family, 'bytes': len(raw), 'payload_omitted': True}
    return None


class Observer:
    def __init__(self, server, emit, scope='fm', local=None, names=None):
        self.server, self.local, self.emit, self.scope = server, local, emit, scope
        self.streams, self.items, self.ingredients = {}, {}, {}
        self.names = names or {}
        self.packet_count = self.message_count = self.event_count = self.decoded_count = 0

    def packet(self, timestamp, linktype, frame):
        self.packet_count += 1
        segment = tcp_segment(frame, linktype)
        if segment is None or self.server not in (segment.source, segment.target):
            return
        local = segment.target if segment.source == self.server else segment.source
        if self.local and self.local != local:
            return
        direction = 'server_to_client' if segment.source == self.server else 'client_to_server'
        key = (segment.source, segment.target)
        if segment.flags & 2 and key in self.streams:
            self.finish_stream(key, timestamp)
            # A fresh connection must not reuse objects from an earlier TCP session.
            self.items = {k: v for k, v in self.items.items() if k[0] != local}
            self.ingredients.pop(local, None)
        assembler, framer, first = self.streams.setdefault(key, (Reassembler(), Framer(), True))
        data = assembler.push(segment.sequence, segment.payload, bool(segment.flags & 2))
        for message in framer.feed(data):
            self.message_count += 1
            if isinstance(message, dict):
                event = message
            else:
                try:
                    event = decode_message(message, direction, self.scope)
                except (ValueError, IndexError):
                    event = {'kind': 'decode_error', 'bytes': len(message), 'payload_omitted': True}
            if event is not None:
                event.update(time=datetime.fromtimestamp(timestamp, timezone.utc).isoformat(),
                             direction=direction, connection=endpoint_text(local),
                             boundary_uncertain=bool(first and assembler.mid_connection))
                if event['kind'] in ('exchange_leave', 'exchange_closed', 'exchange_open'):
                    self.ingredients.pop(local, None)
                if event['kind'] == 'ingredient_request':
                    selected = self.ingredients.setdefault(local, {})
                    for move in event['moves']:
                        if move['add']:
                            selected[move['uid']] = move['quantity']
                        else:
                            selected.pop(move['uid'], None)
                if event['kind'] == 'exchange_ready':
                    event['selected_items_last_observed'] = [
                        self.items.get((local, uid), {'uid': uid, 'before_observed': False})
                        for uid in self.ingredients.get(local, {})]
                    event['selection_basis'] = 'requests_observed; server acceptance not inferred'
                for item in event.get('items', []):
                    template = item.get('template')
                    if template is not None:
                        item['name'] = self.names.get(str(template))
                    if 'effects' in item:
                        # Deltas compare observed snapshots only, not necessarily consecutive attempts.
                        old = self.items.get((local, item['uid']))
                        item['before_observed'] = old is not None
                        if old is not None:
                            def numbers(effects):
                                return {x['effect']: x['args'][0] for x in effects
                                        if x['effect'] in STAT_LABELS and x['args'] and x['args'][0] is not None}
                            before, after = numbers(old['effects']), numbers(item['effects'])
                            item['deltas_since_last_observation'] = {
                                str(k): after.get(k, 0) - before.get(k, 0)
                                for k in before.keys() | after.keys() if before.get(k, 0) != after.get(k, 0)}
                        self.items[(local, item['uid'])] = {k: item[k] for k in
                            ('uid', 'template', 'name', 'quantity', 'effects') if k in item}
                self.emit(event)
                self.event_count += 1
                if event['kind'] not in ('other_message', 'encoded_message', 'tls_record', 'undecoded', 'decode_error'):
                    self.decoded_count += 1
            first = False
        self.streams[key] = (assembler, framer, first)
        if segment.flags & 5:
            self.finish_stream(key, timestamp)

    def finish_stream(self, key, timestamp=None):
        assembler, framer, _ = self.streams.pop(key)
        if assembler.pending or framer.buffer:
            self.emit({'kind': 'incomplete_stream', 'buffered_segments': len(assembler.pending),
                       'unframed_bytes': len(framer.buffer), 'content_decoded': False})

    def finish(self):
        for key in list(self.streams):
            self.finish_stream(key)
        self.emit({'kind': 'summary', 'packets': self.packet_count,
                   'framed_messages': self.message_count, 'exported_events': self.event_count,
                   'decoded_game_messages': self.decoded_count,
                   'probabilities_verified': False})


def item_names():
    path = ROOT / 'local-observations/forgemagie/client/items.json'
    if path.exists():
        return {k: v['n'] for k, v in json.loads(path.read_text())['items'].items()}
    path = ROOT / 'src/engine/equipmentData.json'
    if path.exists():
        return {str(v['id']): v['name'] for v in json.loads(path.read_text())['items']}
    return {}


def create_output(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    if os.geteuid() == 0 and os.environ.get('SUDO_UID'):
        uid, gid = int(os.environ['SUDO_UID']), int(os.environ['SUDO_GID'])
        os.fchown(fd, uid, gid)
        os.chown(path.parent, uid, gid)
    return os.fdopen(fd, 'w', buffering=1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    info = subs.add_parser('discover', help='Find established game connections; excludes launcher loopback')
    info.add_argument('--pid', type=int)
    for name in ('capture', 'read'):
        p = subs.add_parser(name)
        p.add_argument('--server', type=endpoint, required=name == 'read', help='Server IP:port')
        p.add_argument('--local', type=endpoint, help='Local IP:port')
        p.add_argument('--scope', choices=('fm', 'all'), default='fm')
        p.add_argument('--output', type=Path)
        p.add_argument('--quiet', action='store_true')
        if name == 'capture':
            p.add_argument('--pid', type=int)
            p.add_argument('--interface')
            p.add_argument('--seconds', type=int, default=300)
        else:
            p.add_argument('--pcap', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == 'discover':
        print(json.dumps(discover(args.pid), indent=2))
        return 0
    process = timer = capture_errors = None
    try:
        if args.command == 'capture':
            if not 1 <= args.seconds <= 86400:
                raise CaptureError('--seconds must be between 1 and 86400')
            connections = discover(args.pid)
            connections = [x for x in connections
                           if (args.server is None or endpoint(x['server']) == args.server)
                           and (args.local is None or endpoint(x['local']) == args.local)]
            if len(connections) != 1:
                raise CaptureError(f'Found {len(connections)} game connections; use discover, then --pid/--server/--local.')
            args.server, args.local = endpoint(connections[0]['server']), endpoint(connections[0]['local'])
            interface = args.interface or interface_for(args.server)
            command = ['tcpdump', '-i', interface, '-n', '-U', '-s', '0', '-w', '-',
                       capture_filter(args.local, args.server)]
            print('Listening to the selected game flow only: ' + endpoint_text(args.server), file=sys.stderr)
            capture_errors = tempfile.TemporaryFile()
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=capture_errors)
            def stop_capture():
                if process.poll() is None:
                    process.send_signal(signal.SIGINT)
            timer = threading.Timer(args.seconds, stop_capture)
            timer.daemon = True
            timer.start()
            stream = process.stdout
        else:
            stream = args.pcap.open('rb') if str(args.pcap) != '-' else sys.stdin.buffer
        output = args.output or ROOT / 'local-observations/forgemagie' / (
            'network-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ') + '.jsonl')
        with create_output(output) as log:
            def emit(event):
                log.write(json.dumps(event, ensure_ascii=False) + '\n')
                if not args.quiet:
                    print(json.dumps(event, ensure_ascii=False), flush=True)
            emit({'kind': 'observation', 'server': endpoint_text(args.server),
                  'local': endpoint_text(args.local) if args.local else None,
                  'mode': args.command, 'scope': args.scope, 'raw_capture_saved': False})
            observer = Observer(args.server, emit, args.scope, args.local, item_names())
            try:
                for timestamp, linktype, frame in pcap_packets(stream):
                    observer.packet(timestamp, linktype, frame)
            except KeyboardInterrupt:
                if process:
                    process.send_signal(signal.SIGINT)
            except CaptureError as error:
                emit({'kind': 'capture_error', 'error': str(error)})
                raise
            finally:
                observer.finish()
                if stream is not sys.stdin.buffer:
                    stream.close()
        print(f'Observation saved to {output}', file=sys.stderr)
        return 0
    except (OSError, CaptureError, ValueError, subprocess.SubprocessError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    finally:
        if timer:
            timer.cancel()
        if process:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if capture_errors:
            capture_errors.seek(0)
            diagnostics = capture_errors.read().decode(errors='replace')
            if diagnostics:
                print(diagnostics.strip(), file=sys.stderr)
            if 'Permission denied' in diagnostics or 'permission to capture' in diagnostics:
                print('macOS requires BPF access. Run this capture command with sudo in your Terminal.', file=sys.stderr)
            capture_errors.close()


if __name__ == '__main__':
    raise SystemExit(main())
