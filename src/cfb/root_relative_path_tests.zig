const std = @import("std");
test "CFB root relative addresses resolve every active original entry without mutating paths" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4000000));
    defer a.free(bytes);
    var file = try @import("reader.zig").File.open(a, bytes, .{});
    defer file.deinit();
    for (file.entries, 0..) |entry, index| {
        if (entry.kind == 0) {
            try std.testing.expectError(error.InvalidDirectoryReference, file.rootRelativePath(index));
            continue;
        }
        const address = try file.rootRelativePath(index);
        try std.testing.expectEqual(index, (try file.findExact(address)).?);
        if (index == 0) try std.testing.expectEqualStrings("/", address) else {
            try std.testing.expect(std.mem.startsWith(u8, address, "/"));
            try std.testing.expect(@intFromPtr(address.ptr) >= @intFromPtr(entry.path.ptr));
            try std.testing.expect(@intFromPtr(address.ptr) + address.len <= @intFromPtr(entry.path.ptr) + entry.path.len);
        }
    }
    try std.testing.expectError(error.InvalidDirectoryReference, file.rootRelativePath(file.entries.len));
}
