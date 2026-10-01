const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX editor session rejects encrypted fixture before exposing editable state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.expectError(error.EncryptedDocument, editor.open(a, input, .{}));
}

test "HWPX editor session releases partial allocations through open edit save reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var session = try editor.open(allocator, source, .{});
            defer session.deinit();
            _ = try session.splice(0, 2, 0, 0, "검증😀<&\r");
            const output = try session.save();
            defer allocator.free(output);
            var reopened = try editor.open(allocator, output, .{});
            defer reopened.deinit();
            for (session.sections[0].sites.items, reopened.sections[0].sites.items) |expected, actual| {
                try std.testing.expectEqualStrings(expected.text, actual.text);
            }
        }
    }.run, .{input});
}

test "HWPX editor session rejects bounded input and preserves edits after failed operations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_input_bytes = input.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_text_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, editor.open(a, input, .{ .max_xml_bytes = 0 }));
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "😀");
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.SplitSurrogatePair, session.splice(0, 2, 1, 0, "x"));
    try std.testing.expectError(error.InvalidTextPosition, session.splice(0, 2, std.math.maxInt(u32), 0, "x"));
    var total: usize = 0;
    for (session.sections) |section| for (section.sites.items) |site| {
        total += site.text.len;
    };
    session.options.max_text_bytes = total;
    try std.testing.expectError(error.LimitExceeded, session.splice(0, 2, 0, 0, "x"));
    session.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, session.save());
    session.options.max_output_bytes = 128 * 1024 * 1024;
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX editor session owns input and applies saves reopens restores actual document" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(session.source.ptr != input.ptr);
    const noop = try session.save();
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, input, noop);
    try std.testing.expectError(error.InvalidSectionIndex, session.splice(1, 2, 0, 0, "x"));
    try std.testing.expectError(error.InvalidParagraphIndex, session.splice(0, 0, 0, 0, "x"));
    try std.testing.expect(try session.splice(0, 2, 0, 0, "검증"));
    const output = try session.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].sites.items.len, reopened.sections[0].sites.items.len);
    for (session.sections[0].sites.items, reopened.sections[0].sites.items) |current, actual| try std.testing.expectEqualStrings(current.text, actual.text);
    _ = try session.splice(0, 2, 0, 2, "");
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
}
