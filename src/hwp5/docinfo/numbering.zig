const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
const Version = @import("../version.zig").Version;
pub const Head = @import("paragraph_head.zig").Head;
pub const Level = struct {
    head: Head,
    format_utf16: []const u8,
    fn read(r: *Reader) !Level {
        return .{ .head = try Head.read(r), .format_utf16 = try string.read(r) };
    }
};
pub const Extension = struct { levels: [3]Level, starts: [3]u32 };
pub const Numbering = struct {
    levels: [7]Level,
    start: u16,
    starts: ?[7]u32,
    extension: ?Extension,
    extra: []const u8,
    /// EOF at a group boundary means absent, not zero/default. Below the
    /// documented version gate, unclassified trailing bytes remain in extra.
    /// See docs/hwp5-foundation.md for observed 5.0/5.1 extension layouts.
    pub fn parse(bytes: []const u8, version: Version) !Numbering {
        try version.requireSupported();
        var r: Reader = .{ .bytes = bytes };
        var levels: [7]Level = undefined;
        for (&levels) |*level| level.* = try Level.read(&r);
        const start = try r.readInt(u16);
        var starts: ?[7]u32 = null;
        if (version.raw >= 0x05000205 and r.offset < bytes.len) {
            var values: [7]u32 = undefined;
            for (&values) |*value| value.* = try r.readInt(u32);
            starts = values;
        }
        var extension: ?Extension = null;
        if (version.raw >= 0x05010000 and r.offset < bytes.len) {
            var ext: Extension = undefined;
            for (&ext.levels) |*level| level.* = try Level.read(&r);
            for (&ext.starts) |*value| value.* = try r.readInt(u32);
            extension = ext;
        }
        return .{ .levels = levels, .start = start, .starts = starts, .extension = extension, .extra = bytes[r.offset..] };
    }
};
