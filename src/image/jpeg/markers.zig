const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const codes = @import("marker_code.zig");
pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_markers: usize = 65536,
    max_payload_bytes: usize = 65533,
};
pub const Marker = struct {
    code: u8,
    kind: codes.Kind,
    fill_bytes: usize,
    payload: []const u8,
    raw: []const u8,
};
/// Marker-aligned cursor, NOT a complete JPEG decoder/validator.
/// All views borrow input. Failed reads preserve cursor and marker count.
pub const Iterator = struct {
    reader: Reader,
    options: Options,
    count: usize = 0,
    pub fn init(bytes: []const u8, options: Options) !Iterator {
        if (bytes.len > options.max_bytes) return error.LimitExceeded;
        return .{ .reader = .{ .bytes = bytes }, .options = options };
    }
    pub fn next(self: *Iterator) !?Marker {
        if (self.reader.offset == self.reader.bytes.len) return null;
        if (self.count >= self.options.max_markers) return error.LimitExceeded;
        var r = self.reader;
        const start = r.offset;
        if (try r.readInt(u8) != 0xff) return error.InvalidJpegMarker;
        var fill: usize = 0;
        var code = try r.readInt(u8);
        while (code == 0xff) {
            fill += 1;
            code = try r.readInt(u8);
        }
        const kind = try codes.kind(code);
        var payload: []const u8 = &.{};
        if (kind == .segment) {
            const length = std.mem.readInt(u16, (try r.take(2))[0..2], .big);
            if (length < 2) return error.InvalidJpegSegmentLength;
            const size: usize = length - 2;
            if (size > self.options.max_payload_bytes) return error.LimitExceeded;
            payload = try r.take(size);
        }
        self.reader = r;
        self.count += 1;
        return .{ .code = code, .kind = kind, .fill_bytes = fill, .payload = payload, .raw = r.bytes[start..r.offset] };
    }
};
