const Reader = @import("../../binary/reader.zig").Reader;
/// Observed extension after table 80, selected explicitly by the caller.
/// Marker 0xff precedes a ParameterSet, NOT a fixed-offset field-name string.
pub const Extension = struct {
    text_width: ?u32,
    marker: ?u8,
    remaining: []const u8,
    pub fn parse(bytes: []const u8) !Extension {
        var r: Reader = .{ .bytes = bytes };
        const width = if (bytes.len > 0) try r.readInt(u32) else null;
        const marker = if (r.offset < bytes.len) try r.readInt(u8) else null;
        return .{ .text_width = width, .marker = marker, .remaining = bytes[r.offset..] };
    }
    pub fn parameterSetMarked(self: Extension) bool {
        return self.marker != null and self.marker.? == 0xff;
    }
};
