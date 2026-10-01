const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");

test "HWPX checkpoint restores actual field text dirty state and redoes saved bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var saved = try checkpoint.capture(&session, 4_000_000);
    defer saved.deinit();
    const targets = try session.fieldLabels(0, 1);
    defer a.free(targets);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, targets[0].begin_element, targets[0].start, 0, "복원😀"));
    const edited = try session.save();
    defer a.free(edited);
    saved.max_bytes = 0;
    try std.testing.expectError(error.LimitExceeded, saved.exchange(&session));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].field_dirty.items.len);
    saved.max_bytes = 4_000_000;
    try saved.exchange(&session);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try saved.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    var foreign = try editor.open(a, bytes, .{});
    defer foreign.deinit();
    try std.testing.expectError(error.SourceBindingMismatch, saved.exchange(&foreign));
    try std.testing.expectError(error.LimitExceeded, checkpoint.capture(&session, 0));
}

test "HWPX checkpoint restores formulas synthetic anchor sites and nested owner paragraphs" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "chart", "shapeline", "headerfooter" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        var saved = try checkpoint.capture(&session, 4_000_000);
        defer saved.deinit();
        if (std.mem.eql(u8, name, "chart")) {
            const paragraph = find: {
                for (session.sections[0].sites.items, session.sections[0].locations) |site, location| {
                    if (std.mem.eql(u8, site.text, "11.2")) break :find location.paragraph_ordinal;
                }
                return error.MissingNumericFixtureCell;
            };
            try std.testing.expect(try session.splice(0, paragraph, 0, 4, "100"));
        } else {
            try std.testing.expect(try session.spliceAnchored(0, if (std.mem.eql(u8, name, "shapeline")) 1 else 2, 0, 0, "복원😀"));
        }
        const edited = try session.save();
        defer a.free(edited);
        try std.testing.expect(!std.mem.eql(u8, bytes, edited));
        try saved.exchange(&session);
        const restored = try session.save();
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, bytes, restored);
        try saved.exchange(&session);
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, edited, redone);
    }
}

test "HWPX checkpoint capture allocation failures preserve current model" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var session = try editor.open(allocator, input, .{});
            defer session.deinit();
            var saved = try checkpoint.capture(&session, 4_000_000);
            defer saved.deinit();
            try saved.exchange(&session);
            const restored = try session.save();
            defer allocator.free(restored);
            try std.testing.expectEqualSlices(u8, input, restored);
        }
    }.run, .{bytes});
}
