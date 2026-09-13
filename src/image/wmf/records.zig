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

pub const Record = struct {
    offset: usize,
    size_words: u32,
    function: u16,
    parameters: []const u8,
    end: usize,
};

pub const Iterator = struct {
    bytes: []const u8,
    offset: usize,
    end: usize,

    pub fn init(bytes: []const u8, start: usize, end: usize) !Iterator {
        if (start > end or end > bytes.len) return error.InvalidWmfRecordsOffset;
        return .{ .bytes = bytes, .offset = start, .end = end };
    }

    /// On failure the iterator remains at the start of the malformed record.
    pub fn next(self: *Iterator) !?Record {
        if (self.offset == self.end) return null;
        if (self.end - self.offset < 6) return error.TruncatedWmfRecord;
        const offset = self.offset;
        const size_words = std.mem.readInt(u32, self.bytes[offset..][0..4], .little);
        if (size_words < 3) return error.InvalidWmfRecordSize;
        const size_bytes_u32 = std.math.mul(u32, size_words, 2) catch return error.InvalidWmfRecordSize;
        const size_bytes: usize = size_bytes_u32;
        if (size_bytes > self.end - offset) return error.TruncatedWmfRecord;
        const record_end = offset + size_bytes;
        const result: Record = .{
            .offset = offset,
            .size_words = size_words,
            .function = std.mem.readInt(u16, self.bytes[offset + 4 ..][0..2], .little),
            .parameters = self.bytes[offset + 6 .. record_end],
            .end = record_end,
        };
        self.offset = record_end;
        return result;
    }
};

/// Validates generic META_RECORD framing through the unique terminal META_EOF.
/// Record-specific parameters remain owned by later decoders.
pub fn validate(bytes: []const u8, header: Header, options: Options) !Summary {
    if (header.records_offset > bytes.len) return error.InvalidWmfRecordsOffset;
    const trailing_bytes = std.math.mul(usize, options.trailing_zero_words, 2) catch return error.InvalidWmfTrailingData;
    if (trailing_bytes > bytes.len - header.records_offset) return error.InvalidWmfTrailingData;
    const records_end = bytes.len - trailing_bytes;
    var iterator = try Iterator.init(bytes, header.records_offset, records_end);
    var count: usize = 0;
    var max_record_words: u32 = 0;
    var eof_end: ?usize = null;

    while (try iterator.next()) |record| {
        count += 1;
        max_record_words = @max(max_record_words, record.size_words);
        if (record.function == 0) {
            if (record.size_words != 3) return error.InvalidWmfEofRecord;
            eof_end = record.end;
            break;
        }
    }
    if (eof_end == null) return error.MissingWmfEof;
    if (iterator.offset != records_end) return error.DataAfterWmfEof;
    for (bytes[records_end..]) |byte| if (byte != 0) return error.InvalidWmfTrailingData;
    if (max_record_words != header.meta.max_record_words) return error.InvalidWmfMaxRecord;
    return .{
        .count = count,
        .max_record_words = max_record_words,
        .eof_end = eof_end.?,
        .trailing_zero_words = options.trailing_zero_words,
    };
}
