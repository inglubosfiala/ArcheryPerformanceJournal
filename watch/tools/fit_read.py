"""Minimal FIT reader for the Arrow Grades activity files (no dependencies).

Reads definition and data messages, including developer fields (our shot / grade / end_m / end_s)
and the raw sensor messages the SensorLogger writes (accelerometer_data 165, gyroscope_data 164).

  python watch/tools/fit_read.py Activity.fit            summary
  python watch/tools/fit_read.py Activity.fit --csv out  also writes out_accel.csv, out_gyro.csv,
                                                          out_records.csv (heart rate, markers), out_laps.csv
"""
import struct
import sys

MESG = {0: 'file_id', 18: 'session', 19: 'lap', 20: 'record', 21: 'event', 23: 'device_info',
        34: 'activity', 164: 'gyroscope_data', 165: 'accelerometer_data', 206: 'field_description',
        207: 'developer_data_id'}
FIT_EPOCH = 631065600  # 1989-12-31 in Unix seconds

# base type number -> (struct code, size)
BASE = {0x00: ('B', 1), 0x01: ('b', 1), 0x02: ('B', 1), 0x83: ('h', 2), 0x84: ('H', 2), 0x85: ('i', 4),
        0x86: ('I', 4), 0x07: ('s', 1), 0x88: ('f', 4), 0x89: ('d', 8), 0x0A: ('B', 1), 0x8B: ('H', 2),
        0x8C: ('I', 4), 0x0D: ('B', 1), 0x8E: ('q', 8), 0x8F: ('Q', 8), 0x90: ('q', 8)}
INVALID = {'B': 0xFF, 'b': 0x7F, 'H': 0xFFFF, 'h': 0x7FFF, 'I': 0xFFFFFFFF, 'i': 0x7FFFFFFF}


def decode(raw, base, little):
    code, size = BASE.get(base, ('B', 1))
    if code == 's':
        return raw.split(b'\0')[0].decode('utf-8', 'replace')
    n = len(raw) // size
    vals = list(struct.unpack(('<' if little else '>') + code * n, raw[:n * size]))
    vals = [None if v == INVALID.get(code) else v for v in vals]
    return vals[0] if n == 1 else vals


def read(path):
    data = open(path, 'rb').read()
    hsize = data[0]
    size = struct.unpack('<I', data[4:8])[0]
    pos, end = hsize, hsize + size
    defs = {}
    dev_fields = {}  # (dev index, field num) -> (name, base type, units)
    out = []
    last_ts = 0
    while pos < end:
        h = data[pos]
        pos += 1
        if h & 0x80:  # compressed timestamp header
            local = (h >> 5) & 0x3
            offset = h & 0x1F
            ts = (last_ts & ~0x1F) + offset
            if ts < last_ts:
                ts += 0x20
            last_ts = ts
            kind = 'data'
        else:
            local = h & 0x0F
            kind = 'def' if h & 0x40 else 'data'
            ts = None
        if kind == 'def':
            has_dev = bool(h & 0x20)
            arch = data[pos + 1]
            little = arch == 0
            gnum = struct.unpack('<H' if little else '>H', data[pos + 2:pos + 4])[0]
            nf = data[pos + 4]
            pos += 5
            fields = []
            for _ in range(nf):
                fields.append((data[pos], data[pos + 1], data[pos + 2]))
                pos += 3
            devs = []
            if has_dev:
                nd = data[pos]
                pos += 1
                for _ in range(nd):
                    devs.append((data[pos], data[pos + 1], data[pos + 2]))
                    pos += 3
            defs[local] = (gnum, little, fields, devs)
            continue
        gnum, little, fields, devs = defs[local]
        msg = {'_mesg': MESG.get(gnum, gnum)}
        for num, sz, base in fields:
            msg[num] = decode(data[pos:pos + sz], base, little)
            pos += sz
        for num, sz, idx in devs:
            name, base, _units = dev_fields.get((idx, num), (f'dev{idx}_{num}', 0x02, ''))
            msg[name] = decode(data[pos:pos + sz], base, little)
            pos += sz
        if 253 in msg and msg[253] is not None:
            last_ts = msg[253]
        elif ts is not None:
            msg[253] = ts
        if gnum == 206:  # field_description: developer_data_index 0, field num 1, base type 2, name 3, units 8
            dev_fields[(msg.get(0), msg.get(1))] = (msg.get(3), msg.get(2), msg.get(8))
        out.append(msg)
    return out


def summary(msgs):
    counts = {}
    for m in msgs:
        counts[m['_mesg']] = counts.get(m['_mesg'], 0) + 1
    print('messages:', counts)
    recs = [m for m in msgs if m['_mesg'] == 'record']
    t0 = recs[0][253] if recs else 0
    marks = [(m[253] - t0, m.get('shot'), m.get('grade'), m.get(3)) for m in recs if m.get('shot') or m.get('grade')]
    print('markers (s, shot, grade, hr):', marks)
    for m in msgs:
        if m['_mesg'] == 'lap':
            print('lap: start', (m.get(2) or t0) - t0, 'elapsed', (m.get(7) or 0) / 1000, 's', 'end_m', m.get('end_m'), 'end_s', m.get('end_s'))
    acc = [m for m in msgs if m['_mesg'] == 'accelerometer_data']
    if acc:
        n = sum(len(m.get(2) or []) if isinstance(m.get(2), list) else 1 for m in acc)
        print('accelerometer: messages', len(acc), 'samples', n, 'first x', (acc[0].get(2) or [])[:5] if isinstance(acc[0].get(2), list) else acc[0].get(2))
    gyro = [m for m in msgs if m['_mesg'] == 'gyroscope_data']
    if gyro:
        print('gyroscope: messages', len(gyro))


if __name__ == '__main__':
    msgs = read(sys.argv[1])
    summary(msgs)
    if '--csv' in sys.argv:
        base = sys.argv[sys.argv.index('--csv') + 1]
        for kind, name in [('accelerometer_data', 'accel'), ('gyroscope_data', 'gyro')]:
            # 253 timestamp (s), 0 timestamp_ms, 1 sample_time_offset (ms), 2/3/4 x/y/z raw counts
            with open(f'{base}_{name}.csv', 'w') as f:
                f.write('t_ms,x,y,z\n')
                for m in msgs:
                    if m['_mesg'] != kind:
                        continue
                    t = (m.get(253) or 0) * 1000 + (m.get(0) or 0)
                    offs, xs, ys, zs = (m.get(k) for k in (1, 2, 3, 4))
                    if not isinstance(xs, list):
                        offs, xs, ys, zs = [offs], [xs], [ys], [zs]
                    for o, x, y, z in zip(offs, xs, ys, zs):
                        f.write(f'{t + (o or 0)},{x},{y},{z}\n')
        with open(f'{base}_records.csv', 'w') as f:
            f.write('t,hr,shot,grade\n')
            for m in msgs:
                if m['_mesg'] == 'record':
                    f.write(f"{m.get(253)},{m.get(3) or ''},{m.get('shot') or ''},{m.get('grade') or ''}\n")
        print('csv written:', base + '_*.csv')
