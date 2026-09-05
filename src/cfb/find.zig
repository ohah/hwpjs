const std = @import("std");
const uppercase = @import("uppercase.zig");

fn upper(a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    var it = (try std.unicode.Utf8View.init(bytes)).iterator();
    while (it.nextCodepointSlice()) |slice| {
        const cp = try std.unicode.utf8Decode(slice);
        try out.appendSlice(a, uppercase.mapping(cp) orelse slice);
    }
    return out.toOwnedSlice(a);
}

fn normalize(a: std.mem.Allocator, bytes: []const u8, controls: bool) ![]const u8 {
    var out: std.ArrayList(u8) = .empty;
    for (bytes) |b| {
        if (b == 0) continue;
        try out.append(a, if (controls and b >= 1 and b <= 6) '!' else b);
    }
    return out.toOwnedSlice(a);
}

/// Matches CFB.find: root-relative/full/basename, JS uppercase, NUL/control fallback.
pub fn find(backing: std.mem.Allocator, entries: anytype, path: []const u8) !?usize {
    if (entries.len == 0) return null;
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();
    const root_relative = std.mem.startsWith(u8, path, "/");
    const qualified = root_relative or std.mem.indexOfScalar(u8, path, '/') != null;
    const query = try upper(a, if (root_relative)
        try std.fmt.allocPrint(a, "{s}{s}", .{ entries[0].name, path })
    else
        path);
    const paths = try a.alloc([]const u8, entries.len);
    const names = try a.alloc([]const u8, entries.len);
    for (entries, 0..) |e, i| {
        paths[i] = try upper(a, e.path);
        names[i] = try upper(a, e.name);
    }
    for (entries, 0..) |_, i| {
        if (std.mem.eql(u8, query, if (qualified) paths[i] else names[i])) return i;
    }
    var controls = true;
    for (query) |b| {
        if (b >= 1 and b <= 6) {
            controls = false;
            break;
        }
    }
    const normalized = try normalize(a, query, controls);
    for (entries, 0..) |_, i| {
        if (std.mem.eql(u8, normalized, try normalize(a, paths[i], controls)) or
            std.mem.eql(u8, normalized, try normalize(a, names[i], controls))) return i;
    }
    return null;
}
