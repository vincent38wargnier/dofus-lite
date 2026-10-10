"""Synthetic protocol fixtures, not official-server probability validation."""
import io
import json
import socket
import struct
import unittest

from observe_retro import (CaptureError, Framer, Observer, Reassembler, capture_filter,
                           decode_message, endpoint, pcap_packets, tcp_segment)

CLIENT = ('192.0.2.10', 50000)
SERVER = ('198.51.100.20', 443)


def packet(payload, sequence=100, incoming=True, flags=0x18, ipv6=False):
    source, target = (SERVER, CLIENT) if incoming else (CLIENT, SERVER)
    tcp = struct.pack('!HHIIBBHHH', source[1], target[1], sequence, 0, 0x50, flags, 4096, 0, 0) + payload
    if ipv6:
        ip = struct.pack('!IHBB', 6 << 28, len(tcp), 6, 64)
        ip += socket.inet_pton(socket.AF_INET6, '2001:db8::1') + socket.inet_pton(socket.AF_INET6, '2001:db8::2')
        return b'\0' * 12 + b'\x86\xdd' + ip + tcp
    ip = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 20 + len(tcp), 0, 0, 64, 6, 0,
                     socket.inet_aton(source[0]), socket.inet_aton(target[0]))
    return b'\0' * 12 + b'\x08\x00' + ip + tcp


def pcap(frames, endian='<', nano=False):
    magic = 0xa1b23c4d if nano else 0xa1b2c3d4
    data = struct.pack(endian + 'IHHIIII', magic, 2, 4, 0, 0, 65535, 1)
    for i, frame in enumerate(frames):
        data += struct.pack(endian + 'IIII', 1700000000 + i, 123, len(frame), len(frame)) + frame
    return data


class TransportTests(unittest.TestCase):
    def test_pcap_endianness_and_timestamps(self):
        for endian in ('<', '>'):
            for nano in (False, True):
                rows = list(pcap_packets(io.BytesIO(pcap([packet(b'EcEF\0')], endian, nano))))
                self.assertEqual(len(rows), 1)
                self.assertEqual(tcp_segment(rows[0][2], rows[0][1]).payload, b'EcEF\0')

    def test_truncated_and_pcapng_are_explicit_errors(self):
        for data in (b'bad', b'\x0a\x0d\x0d\x0a' + bytes(20), pcap([packet(b'EcEF\0')])[:-1]):
            with self.assertRaises(CaptureError):
                list(pcap_packets(io.BytesIO(data)))

    def test_vlan_ipv6_and_raw_link(self):
        frame = packet(b'EK\0', incoming=False)
        vlan = frame[:12] + b'\x81\x00\x00\x01' + frame[12:]
        self.assertEqual(tcp_segment(vlan, 1).payload, b'EK\0')
        self.assertEqual(tcp_segment(frame[14:], 101).payload, b'EK\0')
        self.assertEqual(tcp_segment(packet(b'EK\0', ipv6=True), 1).source[0], '2001:db8::1')

    def test_reordering_overlap_and_retransmission(self):
        stream = Reassembler()
        stream.push(99, b'', syn=True)
        self.assertEqual(stream.push(103, b';9126\0'), b'')
        self.assertEqual(stream.push(100, b'EcK'), b'EcK;9126\0')
        self.assertEqual(stream.push(100, b'EcK;9126\0'), b'')
        self.assertEqual(stream.push(107, b'6\0Im0117\0'), b'Im0117\0')

    def test_sequence_wrap(self):
        stream = Reassembler()
        stream.push(0xfffffffd, b'', syn=True)
        self.assertEqual(stream.push(0, b'K\0'), b'')
        self.assertEqual(stream.push(0xfffffffe, b'Ec'), b'EcK\0')

    def test_split_coalesced_messages(self):
        framer = Framer()
        self.assertEqual(framer.feed(b'EcK;9'), [])
        self.assertEqual(framer.feed(b'126\0Im0194\n\0'), [b'EcK;9126', b'Im0194'])

    def test_tls_is_metadata_only(self):
        framer = Framer()
        record = b'\x17\x03\x03\x00\x0c' + b'secret-token'
        self.assertEqual(framer.feed(record[:3]), [])
        result = framer.feed(record[3:])
        self.assertEqual(result[0]['kind'], 'tls_record')
        self.assertNotIn('secret', json.dumps(result))

    def test_split_tls_header_at_zero_length_byte(self):
        framer = Framer()
        self.assertEqual(framer.feed(b'\x17\x03\x03\x00'), [])
        event = framer.feed(b'\x03abc')[0]
        self.assertEqual(event['kind'], 'tls_record')

    def test_endpoint_validation_and_exact_capture_filter(self):
        self.assertEqual(endpoint('[2001:db8::1]:443'), ('2001:db8::1', 443))
        with self.assertRaises(ValueError):
            endpoint('host;echo:443')
        value = capture_filter(CLIENT, SERVER)
        self.assertIn('port 50000', value)
        self.assertIn('host 192.0.2.10', value)


class ProtocolTests(unittest.TestCase):
    def test_success_does_not_imply_critical_success(self):
        event = decode_message(b'EcK;9126', 'server_to_client')
        self.assertEqual(event['template'], 9126)
        self.assertIsNone(event['critical_success'])

    def test_info_codes_match_client_texts(self):
        for value, expected in ((117, 'failure_with_stat_loss'), (183, 'failure'), (194, 'success_with_stat_loss')):
            event = decode_message(f'Im0{value}'.encode(), 'server_to_client')
            self.assertEqual(event['messages'][0]['meaning'], expected)

    def test_inventory_uses_hex_but_exchange_uses_decimal(self):
        event = decode_message(b'OAKOa~23a6~1~~7d#22#0#0,7e#1c#0#0;', 'server_to_client')
        item = event['items'][0]
        self.assertEqual((item['uid'], item['template']), (10, 9126))
        self.assertEqual(item['effects'][0]['args'][0], 34)
        event = decode_message(b'EmKO+10|1|9126|7d#22#0#0', 'server_to_client')
        self.assertEqual(event['items'][0]['template'], 9126)

    def test_multiple_inventory_groups(self):
        event = decode_message(b'OAKOa~23a6~1~~7d#22#0#0;*Ob~612~a~~2bd#1e#0#0;', 'server_to_client')
        self.assertEqual([i['uid'] for i in event['items']], [10, 11])

    def test_auth_and_chat_never_written(self):
        for payload in (b'ATsecret-login-token', b'cMK|123|name|private-message', b'unknown-token'):
            self.assertIsNone(decode_message(payload, 'client_to_server'))
            all_event = json.dumps(decode_message(payload, 'client_to_server', 'all'))
            for word in ('secret', 'private', 'unknown-token'):
                self.assertNotIn(word, all_event)

    def test_signatures_are_omitted(self):
        event = decode_message(b'OAKOa~23a6~1~~3d9#0#0#OwnerName;', 'server_to_client')
        self.assertNotIn('OwnerName', json.dumps(event))

    def test_optional_encoded_stream_is_not_misread(self):
        event = decode_message(b'1FABCDEF0123', 'server_to_client')
        self.assertEqual(event['kind'], 'encoded_message')
        self.assertFalse(event['content_decoded'])

    def test_secure_requests_and_quantity(self):
        for data, kind in ((b'EFa10;1', 'secure_ingredient_request'), (b'EFm1;10;1', 'secure_ingredient_move'),
                           (b'EFl1', 'secure_auto_craft'), (b'Ec8', 'craft_quantity')):
            self.assertEqual(decode_message(data, 'client_to_server')['kind'], kind)

    def test_secure_server_item_response(self):
        event = decode_message(b'EFm+4|10|1|9126|7d#22#0#0', 'server_to_client')
        self.assertEqual(event['container'], 4)
        self.assertEqual(event['items'][0]['effects'][0]['args'][0], 34)


class ObservationTests(unittest.TestCase):
    def test_full_pcap_has_directions_deltas_and_no_duplicate_attempts(self):
        old = b'OAKOa~23a6~1~~7d#22#0#0;\0'
        new = b'OCOa~23a6~1~~7d#24#0#0;\0EcK;9126\0Im0194\0'
        frames = [packet(b'', 99, flags=2), packet(old, 100), packet(new[8:], 100 + len(old) + 8),
                  packet(new[:8], 100 + len(old)), packet(new[:8], 100 + len(old)),
                  packet(b'EMO+10|1\n\0EK\n\0', 500, incoming=False)]
        events = []
        observer = Observer(SERVER, events.append, names={'9126': 'Blopanneau Griotte Royal'})
        for record in pcap_packets(io.BytesIO(pcap(frames))):
            observer.packet(*record)
        observer.finish()
        results = [e for e in events if e['kind'] == 'craft_result']
        self.assertEqual(len(results), 1)
        update = [e for e in events if e['kind'] == 'item_update'][-1]
        self.assertEqual(update['items'][0]['deltas_since_last_observation'], {'125': 2})
        ready = next(e for e in events if e['kind'] == 'exchange_ready')
        self.assertEqual(ready['selected_items_last_observed'][0]['name'], 'Blopanneau Griotte Royal')

    def test_capture_boundary_and_missing_data_are_explicit(self):
        events = []
        observer = Observer(SERVER, events.append)
        observer.packet(1700000000, 1, packet(b'EcEF\0', 100))
        observer.packet(1700000001, 1, packet(b'EcEF\0', 120))
        observer.finish()
        self.assertTrue(events[0]['boundary_uncertain'])
        self.assertTrue(any(e['kind'] == 'incomplete_stream' for e in events))
        self.assertEqual(len([e for e in events if e['kind'] == 'craft_result']), 1)

    def test_unrelated_connection_is_ignored(self):
        events = []
        observer = Observer(('203.0.113.1', 443), events.append)
        observer.packet(1700000000, 1, packet(b'EcEF\0'))
        self.assertEqual(events, [])


if __name__ == '__main__':
    unittest.main()
