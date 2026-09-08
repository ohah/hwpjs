/// T.81 Table B.1 framing only; no process/marker ordering validation.
pub const Kind = enum { standalone, segment };
pub fn kind(code: u8) !Kind {
    return switch (code) {
        0, 0xff => error.InvalidJpegMarker,
        0x01, 0xd0...0xd9 => .standalone,
        0x02...0xbf => error.UnsupportedJpegReservedMarker,
        else => .segment,
    };
}
