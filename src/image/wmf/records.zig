const std = @import("std");
const Header = @import("header.zig").Header;

pub const Options = struct {
    /// Exact number of zero WORDs permitted after META_EOF.
    trailing_zero_words: usize = 0,
};

pub const Summary = struct {
    count: usize,
    max_record_words: u32,
    eof_end: usize,
    trailing_zero_words: usize,
};

/// Validates generic META_RECORD framing through the unique terminal META_EOF.
/// Record-specific parameters remain owned by later decoders.
pub fn validate(bytes: []const u8, header: Header, options: Options) !Summary {
    if (header.records_offset > bytes.len) return error.InvalidWmfRecordsOffset;
    const trailing_bytes = std.math.mul(usize, options.trailing_zero_words, 2) catch return error.InvalidWmfTrailingData;
    if (trailing_bytes > bytes.len - header.records_offset) return error.InvalidWmfTrailingData;
    const records_end = bytes.len - trailing_bytes;
    var offset = header.records_offset;
    var count: usize = 0;
    var max_record_words: u32 = 0;
    var eof_end: ?usize = null;

    while (offset < records_end) {
        if (records_end - offset < 6) return error.TruncatedWmfRecord;
        const size_words = std.mem.readInt(u32, bytes[offset..][0..4], .little);
        if (size_words < 3) return error.InvalidWmfRecordSize;
        const size_bytes_u32 = std.math.mul(u32, size_words, 2) catch return error.InvalidWmfRecordSize;
        const size_bytes: usize = size_bytes_u32;
        if (size_bytes > records_end - offset) return error.TruncatedWmfRecord;
        const function = std.mem.readInt(u16, bytes[offset + 4 ..][0..2], .little);
        count += 1;
        max_record_words = @max(max_record_words, size_words);
        offset += size_bytes;
        if (function == 0) {
            if (size_words != 3) return error.InvalidWmfEofRecord;
            eof_end = offset;
            break;
        }
    }
    if (eof_end == null) return error.MissingWmfEof;
    if (offset != records_end) return error.DataAfterWmfEof;
    for (bytes[records_end..]) |byte| if (byte != 0) return error.InvalidWmfTrailingData;
    if (max_record_words != header.meta.max_record_words) return error.InvalidWmfMaxRecord;
    return .{
        .count = count,
        .max_record_words = max_record_words,
        .eof_end = eof_end.?,
        .trailing_zero_words = options.trailing_zero_words,
    };
}
