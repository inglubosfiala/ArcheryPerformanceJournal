import Toybox.Lang;

// A small QR code encoder: alphanumeric mode, versions 1-10, error correction level L, mask 0.
// Enough for one end of the watch code with its heart-rate curve (up to ~390 characters).
// Follows ISO/IEC 18004; the module placement mirrors Nayuki's reference implementation.
// Level L: the code is read off a crisp screen, so capacity counts more than damage tolerance.
//
// The work is split into stages (step()), each well under the watch's execution watchdog;
// the view runs one stage per timer tick.
module Qr {
    const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    const MAX_VERSION = 10;
    // per version, level L: data codewords, EC codewords per block, blocks, last alignment centre
    const DATA = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274];
    const EC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
    const BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
    const ALIGN = [0, 0, 18, 22, 26, 30, 34, 38, 42, 46, 50];

    const ST_DATA = 0;
    const ST_TABLES = 1;
    const ST_GENERATOR = 2;
    const ST_BLOCKS = 3;
    const ST_INTERLEAVE = 4;
    const ST_PATTERNS = 5;
    const ST_PLACE = 6;
    const ST_DONE = 7;

    class Encoder {
        var size as Number = 0;
        var modules as ByteArray? = null; // row-major, 1 = dark
        var failed as Boolean = false;

        hidden var _stage as Number = ST_DATA;
        hidden var _text as String;
        hidden var _v as Number = 0;
        hidden var _data as ByteArray = new [0]b;
        hidden var _exp as ByteArray = new [0]b;
        hidden var _log as ByteArray = new [0]b;
        hidden var _gen as ByteArray = new [0]b;
        hidden var _ecs as Array<ByteArray> = [] as Array<ByteArray>;
        hidden var _cw as ByteArray = new [0]b;
        hidden var _fn as ByteArray = new [0]b;
        hidden var _right as Number = 0;
        hidden var _bit as Number = 0;

        function initialize(text as String) {
            _text = text;
        }

        function isDone() as Boolean {
            return _stage == ST_DONE;
        }

        // Runs one stage. Returns true when the code is ready (or failed).
        function step() as Boolean {
            if (_stage == ST_DATA) {
                buildData();
                _stage = failed ? ST_DONE : ST_TABLES;
            } else if (_stage == ST_TABLES) {
                tables();
                _stage = ST_GENERATOR;
            } else if (_stage == ST_GENERATOR) {
                _gen = generator(EC[_v]);
                _stage = ST_BLOCKS;
            } else if (_stage == ST_BLOCKS) {
                var b = _ecs.size();
                _ecs.add(remainder(_data.slice(blockStart(b), blockStart(b) + blockLen(b)), EC[_v]));
                if (_ecs.size() == BLOCKS[_v]) { _stage = ST_INTERLEAVE; }
            } else if (_stage == ST_INTERLEAVE) {
                interleave();
                _stage = ST_PATTERNS;
            } else if (_stage == ST_PATTERNS) {
                patterns();
                _right = size - 1;
                _bit = 0;
                _stage = ST_PLACE;
            } else if (_stage == ST_PLACE) {
                // two column pairs per step
                for (var i = 0; i < 2 && _right >= 1; i++) { placePair(); }
                if (_right < 1) { _stage = ST_DONE; }
            }
            return _stage == ST_DONE;
        }

        hidden function buildData() as Void {
            var chars = _text.toUpper().toCharArray();
            var n = chars.size();
            for (var i = 1; i <= MAX_VERSION; i++) {
                if (4 + countBits(i) + 11 * (n / 2) + 6 * (n % 2) <= DATA[i] * 8) { _v = i; break; }
            }
            if (_v == 0) {
                failed = true;
                return;
            }
            var cap = DATA[_v];
            _data = new [cap]b;
            var pos = 0;
            pos = put(pos, 2, 4);
            pos = put(pos, n, countBits(_v));
            var k = 0;
            while (k + 1 < n) {
                pos = put(pos, idx(chars[k]) * 45 + idx(chars[k + 1]), 11);
                k += 2;
            }
            if (k < n) { pos = put(pos, idx(chars[k]), 6); }
            var term = cap * 8 - pos;
            pos += term < 4 ? term : 4;
            pos = ((pos + 7) / 8) * 8;
            var pad = 0xEC;
            for (var b = pos / 8; b < cap; b++) {
                _data[b] = pad;
                pad = pad == 0xEC ? 0x11 : 0xEC;
            }
        }

        // bits of the character count in alphanumeric mode
        hidden function countBits(v as Number) as Number {
            return v <= 9 ? 9 : 11;
        }

        // Blocks: the short ones first, the long ones one data codeword longer.
        hidden function blockLen(b as Number) as Number {
            var nb = BLOCKS[_v];
            var shortLen = DATA[_v] / nb;
            var numShort = nb - DATA[_v] % nb;
            return b < numShort ? shortLen : shortLen + 1;
        }

        hidden function blockStart(b as Number) as Number {
            var nb = BLOCKS[_v];
            var shortLen = DATA[_v] / nb;
            var numShort = nb - DATA[_v] % nb;
            return b < numShort ? b * shortLen : numShort * shortLen + (b - numShort) * (shortLen + 1);
        }

        hidden function idx(c as Char) as Number {
            var i = ALNUM.find(c.toString());
            return i == null ? 36 : i;
        }

        hidden function put(pos as Number, val as Number, len as Number) as Number {
            for (var i = len - 1; i >= 0; i--) {
                if (((val >> i) & 1) == 1) {
                    _data[pos >> 3] = _data[pos >> 3] | (0x80 >> (pos & 7));
                }
                pos++;
            }
            return pos;
        }

        hidden function tables() as Void {
            _exp = new [512]b;
            _log = new [256]b;
            var x = 1;
            for (var i = 0; i < 255; i++) {
                _exp[i] = x;
                _log[x] = i;
                x = x << 1;
                if ((x & 0x100) != 0) { x = x ^ 0x11D; }
            }
            for (var i = 255; i < 512; i++) { _exp[i] = _exp[i - 255]; }
        }

        hidden function mul(a as Number, b as Number) as Number {
            if (a == 0 || b == 0) { return 0; }
            return _exp[_log[a] + _log[b]];
        }

        // Generator polynomial of degree ec, highest coefficient first (g[0] = 1).
        hidden function generator(ec as Number) as ByteArray {
            var g = new [ec + 1]b;
            g[0] = 1;
            for (var i = 0; i < ec; i++) {
                // g = g * (x + a^i)
                var next = new [ec + 1]b;
                for (var j = 0; j <= i; j++) {
                    next[j] = next[j] ^ g[j];
                    next[j + 1] = next[j + 1] ^ mul(g[j], _exp[i]);
                }
                g = next;
            }
            return g;
        }

        hidden function remainder(block as ByteArray, ec as Number) as ByteArray {
            var rem = new [ec]b;
            for (var i = 0; i < block.size(); i++) {
                var f = block[i] ^ rem[0];
                for (var k = 0; k < ec - 1; k++) { rem[k] = rem[k + 1]; }
                rem[ec - 1] = 0;
                if (f != 0) {
                    var lf = _log[f];
                    for (var k = 0; k < ec; k++) {
                        var g = _gen[k + 1];
                        if (g != 0) { rem[k] = rem[k] ^ _exp[_log[g] + lf]; }
                    }
                }
            }
            return rem;
        }

        hidden function interleave() as Void {
            var nb = BLOCKS[_v];
            var ec = EC[_v];
            var longest = blockLen(nb - 1);
            _cw = new [DATA[_v] + ec * nb]b;
            var o = 0;
            for (var i = 0; i < longest; i++) {
                for (var b = 0; b < nb; b++) {
                    if (i < blockLen(b)) {
                        _cw[o] = _data[blockStart(b) + i];
                        o++;
                    }
                }
            }
            for (var i = 0; i < ec; i++) {
                for (var b = 0; b < nb; b++) { _cw[o] = _ecs[b][i]; o++; }
            }
        }

        hidden function patterns() as Void {
            size = 17 + 4 * _v;
            modules = new [size * size]b;
            _fn = new [size * size]b;
            for (var i = 0; i < size; i++) {
                set(6, i, i % 2 == 0);
                set(i, 6, i % 2 == 0);
            }
            if (_v >= 2) {
                // centres: 6, (the middle one from version 7), the last one
                var pos = _v >= 7 ? [6, (6 + ALIGN[_v]) / 2, ALIGN[_v]] : [6, ALIGN[_v]];
                var na = pos.size();
                for (var i = 0; i < na; i++) {
                    for (var j = 0; j < na; j++) {
                        // not where a finder is
                        if ((i == 0 && j == 0) || (i == 0 && j == na - 1) || (i == na - 1 && j == 0)) { continue; }
                        align(pos[i], pos[j]);
                    }
                }
            }
            // finders after the timing lines, so they win where both meet
            finder(0, 0);
            finder(0, size - 7);
            finder(size - 7, 0);
            format(0);
            if (_v >= 7) { versionInfo(); }
        }

        hidden function align(r as Number, c as Number) as Void {
            for (var dr = -2; dr <= 2; dr++) {
                for (var dc = -2; dc <= 2; dc++) {
                    var ar = dr < 0 ? -dr : dr;
                    var ac = dc < 0 ? -dc : dc;
                    set(r + dr, c + dc, (ar > ac ? ar : ac) != 1);
                }
            }
        }

        // Version information (versions 7 and up): 18 bits, two copies.
        hidden function versionInfo() as Void {
            var rem = _v;
            for (var i = 0; i < 12; i++) { rem = (rem << 1) ^ ((rem >> 11) * 0x1F25); }
            var bits = (_v << 12) | rem;
            for (var i = 0; i < 18; i++) {
                var a = size - 11 + i % 3;
                var b = i / 3;
                set(b, a, bitOf(bits, i));
                set(a, b, bitOf(bits, i));
            }
        }

        // One pair of columns of the zigzag, from the bottom right; mask 0 applied.
        hidden function placePair() as Void {
            if (_right == 6) { _right = 5; }
            var m = modules as ByteArray;
            var total = _cw.size() * 8;
            var upward = ((_right + 1) & 2) == 0;
            for (var vert = 0; vert < size; vert++) {
                var row = upward ? size - 1 - vert : vert;
                for (var j = 0; j < 2; j++) {
                    var col = _right - j;
                    var p = row * size + col;
                    if (_fn[p] == 0) {
                        var dark = 0;
                        if (_bit < total) { dark = (_cw[_bit >> 3] >> (7 - (_bit & 7))) & 1; }
                        _bit++;
                        if ((row + col) % 2 == 0) { dark = dark ^ 1; }
                        m[p] = dark;
                    }
                }
            }
            _right -= 2;
        }

        hidden function set(row as Number, col as Number, dark as Boolean) as Void {
            if (row < 0 || col < 0 || row >= size || col >= size) { return; }
            var m = modules as ByteArray;
            m[row * size + col] = dark ? 1 : 0;
            _fn[row * size + col] = 1;
        }

        hidden function finder(r as Number, c as Number) as Void {
            for (var dr = -1; dr <= 7; dr++) {
                for (var dc = -1; dc <= 7; dc++) {
                    var inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
                    var ring = dr == 0 || dr == 6 || dc == 0 || dc == 6;
                    var core = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
                    set(r + dr, c + dc, inside && (ring || core));
                }
            }
        }

        // Format bits for level L (01) and the mask, both copies, plus the dark module.
        hidden function format(mask as Number) as Void {
            var data = (1 << 3) | mask; // level L = 01
            var rem = data;
            for (var i = 0; i < 10; i++) { rem = (rem << 1) ^ ((rem >> 9) * 0x537); }
            var bits = ((data << 10) | rem) ^ 0x5412;
            for (var i = 0; i <= 5; i++) { set(i, 8, bitOf(bits, i)); }
            set(7, 8, bitOf(bits, 6));
            set(8, 8, bitOf(bits, 7));
            set(8, 7, bitOf(bits, 8));
            for (var i = 9; i < 15; i++) { set(8, 14 - i, bitOf(bits, i)); }
            for (var i = 0; i < 8; i++) { set(8, size - 1 - i, bitOf(bits, i)); }
            for (var i = 8; i < 15; i++) { set(size - 15 + i, 8, bitOf(bits, i)); }
            set(size - 8, 8, true);
        }

        hidden function bitOf(x as Number, i as Number) as Boolean {
            return ((x >> i) & 1) != 0;
        }
    }
}
