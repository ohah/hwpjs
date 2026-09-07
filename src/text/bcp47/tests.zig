const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
test "BCP47 language groups preserve raw spans and separate registry validity" {
    const raw = "EN-cmn-Latn-419-1901-variant-u-ca-gregory-t-en-us-x-A-A";
    const r = try parser.inspect(t.allocator, raw, .{});
    try t.expectEqualStrings("EN", r.language);
    try t.expectEqualStrings("cmn", r.extlangs);
    try t.expectEqualStrings("Latn", r.script);
    try t.expectEqualStrings("419", r.region);
    try t.expectEqualStrings("1901-variant", r.variants);
    try t.expectEqualStrings("u-ca-gregory-t-en-us", r.extensions);
    try t.expectEqualStrings("x-A-A", r.private_use);
    try t.expectEqual(@as(usize, 2), r.variant_count);
    try t.expectEqual(@as(usize, 2), r.extension_count);
    try t.expectEqual(@as(usize, 2), r.private_count);
    try t.expectEqual(@intFromPtr(raw.ptr), @intFromPtr(r.raw.ptr));
    try t.expect(!r.registry_validated);
    const reserved = try parser.inspect(t.allocator, "abcd", .{});
    try t.expect(!reserved.registry_validated);
    try t.expectEqual(@as(usize, 3), (try parser.inspect(t.allocator, "en-aaa-bbb-ccc", .{})).extlang_count);
}
test "BCP47 grandfathered fixed tags and private use" {
    for (@import("grandfathered.zig").tags) |tag| {
        var upper: [32]u8 = undefined;
        for (tag, 0..) |b, i| upper[i] = std.ascii.toUpper(b);
        const r = try parser.inspect(t.allocator, upper[0..tag.len], .{});
        try t.expectEqual(.grandfathered, r.kind);
        try t.expectEqualStrings("", r.language);
    }
    const private = try parser.inspect(t.allocator, "X-a-A-12345678", .{});
    try t.expectEqual(.private_use, private.kind);
    try t.expectEqual(@as(usize, 3), private.private_count);
}
test "BCP47 malformed tags and duplicate scope" {
    for ([_][]const u8{ "", "a", "en_Us", "en--US", "-en", "en-", "123", "abcdefghi", "en-US-Latn", "en-a", "en-x", "x", "x-abcdefghi", "en-aaa-bbb-ccc-ddd", "abcd-aaa", "i-unknown", "en-GB-oed-x-test", "en-\x80", "en\x00" }) |raw| try t.expectError(error.InvalidLanguageTag, parser.inspect(t.allocator, raw, .{}));
    try t.expectError(error.DuplicateLanguageVariant, parser.inspect(t.allocator, "de-1901-1901", .{}));
    try t.expectError(error.DuplicateLanguageVariant, parser.inspect(t.allocator, "en-abcde-AbCdE", .{}));
    try t.expectError(error.DuplicateLanguageExtension, parser.inspect(t.allocator, "en-a-aa-A-bb", .{}));
    try t.expectError(error.DuplicateLanguageExtension, parser.inspect(t.allocator, "en-0-aa-0-bb", .{}));
    _ = try parser.inspect(t.allocator, "en-abcde-a-abcde-abcde-x-a-a", .{});
}
test "BCP47 primary ASCII byte domain and exact quotas" {
    for (0..2) |position| for (0..256) |value| {
        var bytes = [_]u8{ 'e', 'n' };
        bytes[position] = @intCast(value);
        if (std.ascii.isAlphabetic(@intCast(value))) {
            _ = try parser.inspect(t.allocator, &bytes, .{});
        } else try t.expectError(error.InvalidLanguageTag, parser.inspect(t.allocator, &bytes, .{}));
    };
    const raw = "en-Latn-US-1901-u-ca-gregory-x-a";
    const r = try parser.inspect(t.allocator, raw, .{ .max_bytes = raw.len, .max_subtags = 9 });
    try t.expectEqual(@as(usize, 9), r.subtags);
    try t.expectError(error.LimitExceeded, parser.inspect(t.allocator, raw, .{ .max_bytes = raw.len - 1 }));
    try t.expectError(error.LimitExceeded, parser.inspect(t.allocator, raw, .{ .max_subtags = 8 }));
    try t.expectError(error.LimitExceeded, parser.inspect(t.allocator, "en", .{ .max_subtags = 0 }));
}
fn allocations(a: std.mem.Allocator) !void {
    _ = try parser.inspect(a, "sl-rozaj-biske-1994", .{});
    if (parser.inspect(a, "sl-rozaj-biske-1994-ROZAJ", .{})) |_| return error.ExpectedFailure else |err| switch (err) {
        error.OutOfMemory => return err,
        else => try t.expectEqual(error.DuplicateLanguageVariant, err),
    }
}
test "BCP47 duplicate set allocation failure cleanup" {
    try t.checkAllAllocationFailures(t.allocator, allocations, .{});
}
test "BCP47 long private tag explicit quotas never truncate" {
    const bytes = try t.allocator.alloc(u8, 8191);
    defer t.allocator.free(bytes);
    bytes[0] = 'x';
    for (bytes[1..], 1..) |*b, i| b.* = if (i % 2 == 1) '-' else 'a';
    try t.expectError(error.LimitExceeded, parser.inspect(t.allocator, bytes, .{}));
    const r = try parser.inspect(t.allocator, bytes, .{ .max_bytes = bytes.len, .max_subtags = 4096 });
    try t.expectEqual(@as(usize, 4096), r.subtags);
    try t.expectEqual(bytes.len, r.private_use.len);
    try t.expectError(error.LimitExceeded, parser.inspect(t.allocator, bytes, .{ .max_bytes = bytes.len, .max_subtags = 4095 }));
}
