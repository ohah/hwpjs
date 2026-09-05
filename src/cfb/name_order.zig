const std = @import("std");
const upper = @import("simple_uppercase.zig").upper;

pub const Name = struct {
    units: [31]u16 = undefined,
    len: usize = 0,

    pub fn init(utf8: []const u8) !Name {
        var result: Name = .{};
        var it = (try std.unicode.Utf8View.init(utf8)).iterator();
        while (it.nextCodepoint()) |cp| {
            if (cp == 0 or (cp < 128 and std.mem.indexOfScalar(u8, "/\\:!", @intCast(cp)) != null)) return error.InvalidName;
            const count: usize = if (cp > 0xffff) 2 else 1;
            if (count > result.units.len - result.len) return error.InvalidName;
            if (count == 1) {
                result.units[result.len] = @intCast(cp);
            } else {
                result.units[result.len] = @intCast(0xd800 + ((cp - 0x10000) >> 10));
                result.units[result.len + 1] = @intCast(0xdc00 + ((cp - 0x10000) & 0x3ff));
            }
            result.len += count;
        }
        if (result.len == 0) return error.InvalidName;
        return result;
    }
};

pub fn order(a: Name, b: Name) std.math.Order {
    if (a.len != b.len) return std.math.order(a.len, b.len);
    for (a.units[0..a.len], b.units[0..b.len]) |x, y| {
        const result = std.math.order(upper(x), upper(y));
        if (result != .eq) return result;
    }
    return .eq;
}

/// Exact hierarchical lookup, without legacy basename/control aliases.
pub fn find(entries: anytype, path: []const u8) !?usize {
    if (entries.len == 0) return null;
    if (std.mem.eql(u8, path, "/")) return 0;
    var parts = std.mem.splitScalar(u8, std.mem.trim(u8, path, "/"), '/');
    var parent: usize = 0;
    while (parts.next()) |part| {
        const key = try Name.init(part);
        var id = entries[parent].child;
        var found: ?usize = null;
        var steps: usize = 0;
        while (id != 0xffffffff) {
            if (id >= entries.len or steps >= entries.len) return error.InvalidDirectoryReference;
            steps += 1;
            const cmp = order(key, try Name.init(entries[id].name));
            if (cmp == .eq) {
                found = id;
                break;
            }
            id = if (cmp == .lt) entries[id].left else entries[id].right;
        }
        parent = found orelse return null;
    }
    return parent;
}
