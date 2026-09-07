const std = @import("std");
const tokens = @import("tokens.zig");
const grandfathered = @import("grandfathered.zig");
pub const Options = @import("types.zig").Options;
pub const Report = @import("types.zig").Report;
fn isPrivate(b: []const u8) bool {
    return b.len == 1 and std.ascii.toLower(b[0]) == 'x';
}
fn variant(b: []const u8) bool {
    return b.len >= 5 or (b.len == 4 and std.ascii.isDigit(b[0]));
}
fn identity(b: []const u8) u64 {
    var result: u64 = 1;
    for (b) |v| {
        const lower = std.ascii.toLower(v);
        result = result * 37 + @as(u64, if (std.ascii.isDigit(lower)) lower - '0' + 1 else lower - 'a' + 11);
    }
    return result;
}
fn privateUse(cursor: *tokens.Cursor, report: *Report) !void {
    const marker = cursor.next().?;
    while (cursor.next()) |_| report.private_count += 1;
    if (report.private_count == 0) return error.InvalidLanguageTag;
    report.private_use = cursor.bytes[marker.start..cursor.last_end];
}
/// RFC 5646 ABNF plus duplicate variant/singleton rejection. Not IANA validation.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    var cursor = try tokens.Cursor.init(bytes, options);
    var report: Report = .{ .raw = bytes, .subtags = cursor.count };
    if (grandfathered.contains(bytes)) {
        report.kind = .grandfathered;
        return report;
    }
    if (isPrivate(cursor.peek().?.bytes)) {
        report.kind = .private_use;
        try privateUse(&cursor, &report);
        return report;
    }
    const primary = cursor.next().?.bytes;
    if (primary.len < 2 or !tokens.alpha(primary)) return error.InvalidLanguageTag;
    report.language = primary;
    const ext_start = cursor.offset;
    if (primary.len <= 3) while (cursor.peek()) |token| {
        if (report.extlang_count == 3 or token.bytes.len != 3 or !tokens.alpha(token.bytes)) break;
        _ = cursor.next();
        report.extlang_count += 1;
    };
    if (report.extlang_count != 0) report.extlangs = bytes[ext_start..cursor.last_end];
    if (cursor.peek()) |token| if (token.bytes.len == 4 and tokens.alpha(token.bytes)) {
        report.script = cursor.next().?.bytes;
    };
    if (cursor.peek()) |token| if ((token.bytes.len == 2 and tokens.alpha(token.bytes)) or (token.bytes.len == 3 and tokens.digits(token.bytes))) {
        report.region = cursor.next().?.bytes;
    };
    var seen: std.AutoHashMapUnmanaged(u64, void) = .empty;
    defer seen.deinit(a);
    const variant_start = cursor.offset;
    while (cursor.peek()) |token| {
        if (!variant(token.bytes)) break;
        const entry = try seen.getOrPut(a, identity(token.bytes));
        if (entry.found_existing) return error.DuplicateLanguageVariant;
        _ = cursor.next();
        report.variant_count += 1;
    }
    if (report.variant_count != 0) report.variants = bytes[variant_start..cursor.last_end];
    var singletons: u64 = 0;
    const extension_start = cursor.offset;
    while (cursor.peek()) |token| {
        if (token.bytes.len != 1 or isPrivate(token.bytes)) break;
        const lower = std.ascii.toLower(token.bytes[0]);
        const index: u6 = @intCast(if (std.ascii.isDigit(lower)) lower - '0' else lower - 'a' + 10);
        const bit = @as(u64, 1) << index;
        if (singletons & bit != 0) return error.DuplicateLanguageExtension;
        singletons |= bit;
        _ = cursor.next();
        var parts: usize = 0;
        while (cursor.peek()) |part| {
            if (part.bytes.len < 2) break;
            _ = cursor.next();
            parts += 1;
        }
        if (parts == 0) return error.InvalidLanguageTag;
        report.extension_count += 1;
    }
    if (report.extension_count != 0) report.extensions = bytes[extension_start..cursor.last_end];
    if (cursor.peek()) |token| if (isPrivate(token.bytes)) try privateUse(&cursor, &report);
    if (cursor.peek() != null) return error.InvalidLanguageTag;
    return report;
}
