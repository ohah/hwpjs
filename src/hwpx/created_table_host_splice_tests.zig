const std = @import("std");
test "created table host mode refuses formula sections without mutating source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const before = try session.save();
    defer a.free(before);
    try std.testing.expect(!try @import("created_table_host_splice.zig").supportsMode(&session, 0, false));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table plain host allocation failure sweep restores complete saved state" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, input, .{});
            defer session.deinit();
            var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 2, 1, 1, 100, 17, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 });
            defer table.deinit(allocator);
            _ = try @import("created_table_session.zig").stage(&session, 0, 2, 2, &table);
            const before = try session.save();
            defer allocator.free(before);
            _ = session.splice(0, 2, 0, 0, "😀") catch |err| {
                // Read-only verifier uses the non-failing backing allocator;
                // never deinit this borrowed view or its shared owners.
                var view = session;
                view.allocator = std.testing.allocator;
                const after = try view.save();
                defer std.testing.allocator.free(after);
                try std.testing.expectEqualSlices(u8, before, after);
                try std.testing.expectEqual(@as(u32, 2), session.sections[0].created_tables.entries.items[0].anchor.unit);
                return err;
            };
            try std.testing.expectEqual(@as(u32, 4), session.sections[0].created_tables.entries.items[0].anchor.unit);
            try std.testing.expectEqualSlices(u8, input, session.source);
        }
    }.run, .{bytes});
}

test "created table plain host splice rebases Unicode and restores history after late refusal" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 2, 1, 1, 100, 17, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    const original = try session.anchorText(0, 2);
    defer a.free(original);
    _ = try table.replaceText(a, 0, 0, "셀😀", 100);
    _ = try @import("created_table_session.zig").stage(&session, 0, 2, 2, &table);
    const host_splice = @import("created_table_host_splice.zig");
    try std.testing.expect(try host_splice.supportsMode(&session, 0, false));
    try std.testing.expect(!try host_splice.supportsMode(&session, 0, true));
    try std.testing.expectError(error.InvalidSectionIndex, host_splice.supportsMode(&session, session.sections.len, false));
    const staged = try session.save();
    defer a.free(staged);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "😀" };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 4), session.sections[0].created_tables.entries.items[0].anchor.unit);
    const edited = try session.save();
    defer a.free(edited);
    var reopened = try @import("editor_session.zig").open(a, edited, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 2);
    defer a.free(text);
    const boundary = try @import("text_site_edit.zig").bytePosition(original, 2);
    const expected = try std.fmt.allocPrint(a, "😀{s}\xef\xbf\xbc{s}", .{ original[0..boundary], original[boundary..] });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, text);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(@as(u32, 2), session.sections[0].created_tables.entries.items[0].anchor.unit);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, session.splice(0, 2, 0, 3, ""));
    var refused = command;
    refused.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, refused));
    refused.inserted = "";
    try std.testing.expect(!try history.apply(&session, refused));
    session.options.max_output_bytes = staged.len;
    refused.inserted = "길어지는 입력";
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, refused));
    session.options.max_output_bytes = 128 * 1024 * 1024;
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, staged, unchanged);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
