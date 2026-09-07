const std = @import("std");
const t = std.testing;
const registry = @import("registry.zig");
const data = registry.data;
test "BCP47 registry tables are sorted complete-width unique and searchable" {
    inline for (std.meta.tags(data.Kind)) |kind| {
        const bytes = data.table(kind);
        const width = data.stride(kind);
        try t.expectEqual(@as(usize, 0), bytes.len % width);
        var previous: ?[]const u8 = null;
        var at: usize = 0;
        while (at < bytes.len) : (at += width) {
            const padded = bytes[at..][0..8];
            const key = std.mem.trimEnd(u8, padded, "!");
            try t.expect(key.len >= 1 and key.len <= 8);
            try t.expectEqual(@as(u8, '\n'), bytes[at + width - 1]);
            if (previous) |p| try t.expect(std.mem.order(u8, p, padded) == .lt);
            previous = padded;
            try t.expect(data.contains(kind, key));
            var upper: [8]u8 = undefined;
            for (key, 0..) |b, i| upper[i] = std.ascii.toUpper(b);
            try t.expect(data.contains(kind, upper[0..key.len]));
            if (kind == .extlang) try t.expect(data.contains(.language, data.extlangPrefix(key).?));
        }
        try t.expect(!data.contains(kind, ""));
        try t.expect(!data.contains(kind, "!!!!!!!!"));
        try t.expect(!data.contains(kind, "aaaaaaaaa"));
    }
}
test "BCP47 registry ranges deprecated values and extension semantic boundary" {
    for ([_][]const u8{ "qaa-Qaaa-QM", "qtz-Qabx-XZ", "en-ZZ", "en-BU", "bh", "i-klingon", "x-unlisted", "en-1901" }) |raw| {
        const r = try registry.inspect(t.allocator, raw, .{});
        try t.expect(r.syntax.registry_validated);
        try t.expectEqualStrings(raw, r.syntax.raw);
    }
    const extended = try registry.inspect(t.allocator, "zh-cmn-Hans-CN-u-ca-gregory-t-en-us", .{});
    try t.expect(extended.extlang_prefix_checked);
    try t.expectEqual(@as(usize, 2), extended.extension_semantics_deferred);
    _ = try registry.inspect(t.allocator, "en-u-zz-foobar", .{}); // Registered singleton does not validate vocabulary.
    try t.expectError(error.InvalidExtendedLanguagePrefix, registry.inspect(t.allocator, "en-cmn", .{}));
    try t.expectError(error.InvalidExtendedLanguageCount, registry.inspect(t.allocator, "zh-cmn-yue", .{}));
    try t.expectError(error.UnregisteredLanguage, registry.inspect(t.allocator, "zzzz", .{}));
    try t.expectError(error.UnregisteredScript, registry.inspect(t.allocator, "en-Abcd", .{}));
    try t.expectError(error.UnregisteredVariant, registry.inspect(t.allocator, "en-abcde", .{}));
    try t.expectError(error.UnregisteredExtension, registry.inspect(t.allocator, "en-a-foo", .{}));
}
fn allocations(a: std.mem.Allocator) !void {
    _ = try registry.inspect(a, "sl-rozaj-biske-1994", .{});
    if (registry.inspect(a, "sl-rozaj-biske-abcde", .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.UnregisteredVariant, err),
    }
}
test "BCP47 registry syntax allocations cleaned before registration failure" {
    try t.checkAllAllocationFailures(t.allocator, allocations, .{});
}
