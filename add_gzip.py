#!/usr/bin/env python3
"""
Adds gzip/brotli compression to server.js WITHOUT any npm package.
Run from the project root (the folder that contains server.js):
    python add_gzip.py          # dry run: shows what it would do
    python add_gzip.py --apply  # does it
"""
import sys
from pathlib import Path

MARK = "// ---- ضغط الردود (gzip/brotli)"
BLOCK = r'''
// ---- ضغط الردود (gzip/brotli) بدون أي حزمة خارجية ----
const zlib = require('zlib');
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/i;
app.use((req, res, next) => {
    if (req.method === 'HEAD' || req.headers.range || req.path.startsWith('/socket.io')) return next();
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = /\bbr\b/.test(ae) ? 'br' : (/\bgzip\b/.test(ae) ? 'gzip' : null);
    if (!enc) return next();
    const origWrite = res.write, origEnd = res.end;
    let stream = null, decided = false;
    function decide() {
        decided = true;
        const type = String(res.getHeader('Content-Type') || '');
        const len = Number(res.getHeader('Content-Length') || 0);
        if (res.getHeader('Content-Encoding') || res.statusCode === 204 || res.statusCode === 304 ||
            !COMPRESSIBLE.test(type) || (len && len < 1024)) return;
        stream = enc === 'br'
            ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
            : zlib.createGzip({ level: 6 });
        res.setHeader('Content-Encoding', enc);
        res.removeHeader('Content-Length');
        const etag = res.getHeader('ETag');
        if (etag && !/^W\//.test(etag)) res.setHeader('ETag', 'W/' + etag);
        stream.on('data', c => origWrite.call(res, c));
        stream.on('end', () => origEnd.call(res));
    }
    res.setHeader('Vary', 'Accept-Encoding');
    res.write = function (chunk, encoding, cb) {
        if (!decided) decide();
        if (!stream) return origWrite.call(res, chunk, encoding, cb);
        if (chunk) stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
        return true;
    };
    res.end = function (chunk, encoding, cb) {
        if (!decided) {
            if (chunk && !res.headersSent && !res.getHeader('Content-Length')) {
                res.setHeader('Content-Length', Buffer.byteLength(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
            }
            decide();
        }
        if (!stream) return origEnd.call(res, chunk, encoding, cb);
        if (chunk) stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8'));
        stream.end();
        return res;
    };
    next();
});
'''
p = Path("server.js")
raw = p.read_bytes()
s = raw.decode("utf-8")
nl = "\r\n" if "\r\n" in s else "\n"
if MARK in s:
    print("already added - nothing to do"); sys.exit(0)
if "require('compression')" in s or 'require("compression")' in s:
    print("server.js already uses the compression package - stop and tell Claude"); sys.exit(1)
key = "const app = express();"
if s.count(key) != 1:
    print("could not find a single 'const app = express();' line - stop and tell Claude"); sys.exit(1)
new = s.replace(key, key + nl + BLOCK.replace("\n", nl), 1)
print("will insert", len(BLOCK.splitlines()), "lines right after:", key)
if "--apply" in sys.argv:
    p.write_bytes(new.encode("utf-8"))
    print("DONE - server.js updated")
else:
    print("(dry run - nothing changed; add --apply to apply)")
