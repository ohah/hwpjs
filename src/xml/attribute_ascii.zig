//! Consume a plain UTF-8 attribute span without decoding each scalar repeatedly.
//! The caller handles delimiters, references, CR normalization and all failures.
const Cursor = @import("token_cursor.zig").Cursor;

pub fn consume(cursor: *Cursor, quote: u21) usize {
    const input = &cursor.input;
    if (input.encoding != .utf8 or input.offset > input.bytes.len) return 0;
    const available = @min(input.bytes.len - input.offset, @min(input.remaining, cursor.remainingBytes() catch return 0));
    var count: usize = 0;
    for (input.bytes[input.offset..][0..available]) |byte| {
        if (byte >= 0x80 or byte == quote or byte == '&' or byte == '<' or byte == '\r' or !@import("characters.zig").valid(byte)) break;
        count += 1;
    }
    input.offset += count;
    input.remaining -= count;
    return count;
}
