const entry = @import("suggested_entry.zig");
const keyword = @import("keyword.zig");
pub const Entry = entry.Entry;
pub const Value = struct {
    name: []const u8,
    depth: u8,
    raw: []const u8,
    zero_frequencies: usize,
    pub fn count(self: Value) usize {
        return self.raw.len / (entry.width(self.depth) catch return 0);
    }
    pub fn get(self: Value, index: usize) ?Entry {
        const width = entry.width(self.depth) catch return null;
        if (index >= self.raw.len / width) return null;
        return entry.read(self.depth, self.raw[index * width ..][0..width]) catch null;
    }
};
/// Borrows all input. Equal frequencies, duplicate colors and empty palettes are allowed.
pub fn parse(bytes: []const u8) !Value {
    const prefix = try keyword.split(bytes);
    if (prefix.remaining.len == 0) return error.MissingPngSuggestedDepth;
    const depth = prefix.remaining[0];
    const width = try entry.width(depth);
    const raw = prefix.remaining[1..];
    if (raw.len % width != 0) return error.InvalidPngSuggestedEntrySize;
    var value: Value = .{ .name = prefix.keyword, .depth = depth, .raw = raw, .zero_frequencies = 0 };
    var previous: u16 = 65535;
    for (0..value.count()) |i| {
        const e = value.get(i).?;
        if (e.frequency > previous) return error.InvalidPngSuggestedFrequencyOrder;
        if (e.frequency == 0) value.zero_frequencies += 1;
        previous = e.frequency;
    }
    return value;
}
