const Reader = @import("../../binary/reader.zig").Reader;
/// HWP 5.0 tables 10-12 use the same decoded stream envelope.
/// Borrows raw UTF-16LE units and all extra bytes. Does not parse XML or load entities.
pub const String = struct {
    value: []const u8,
    extra: []const u8,
    pub fn parse(bytes: []const u8) !String {
        var r: Reader = .{ .bytes = bytes };
        const value = try @import("../utf16_string.zig").read32(&r);
        return .{ .value = value, .extra = bytes[r.offset..] };
    }
};
