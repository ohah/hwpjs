//! A current owned label must remain selectable by the public range query.
const std = @import("std");

test "resplit hyperlink owned label query agrees with setter" {
    const a = std.testing.allocator;
    const Case = struct { path: []const u8, paragraph: usize, boundary: u32 };
    for ([_]Case{
        .{ .path = "hyperlink.hwpx", .paragraph = 5, .boundary = 5 },
        .{ .path = "hyperlink.hwpx", .paragraph = 6, .boundary = 0 },
        .{ .path = "hyperlink.hwpx", .paragraph = 7, .boundary = 4 },
        .{ .path = "issue144-fields-crossing-lineseg-boundary.hwpx", .paragraph = 1, .boundary = 41 },
        .{ .path = "issue144-fields-crossing-lineseg-boundary.hwpx", .paragraph = 2, .boundary = 35 },
    }) |case| {
        const path = try std.mem.concat(a, u8, &.{ "legacy/rust/crates/hwp-core/tests/fixtures/", case.path });
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
        defer session.deinit();
        try std.testing.expect(try session.mergeParagraph(0, case.paragraph));
        try std.testing.expect(try session.splitParagraph(0, case.paragraph, case.boundary, 0));
        var checked: usize = 0;
        for ([_]usize{ case.paragraph, case.paragraph + 1 }) |paragraph| {
            const targets = try session.fieldLabels(0, paragraph);
            defer a.free(targets);
            if (targets.len == 0) continue;
            const target = targets[0];
            const before = try session.save();
            defer a.free(before);
            var history = try @import("hwpx/editor_history.zig").History.init(&session, 8, 16 * 1024 * 1024);
            defer history.deinit();
            const query = @import("hwpx/field_label_range_target.zig").select;
            for (0..3) |_| {
                const selected = (try query(&session, 0, paragraph, target.start, target.start)) orelse return error.TestExpectedEqual;
                try std.testing.expectEqual(target.begin_element, selected.begin_element);
            }
            try std.testing.expectError(error.InvalidTextPosition, query(&session, 0, paragraph, 1, 0));
            const unchanged = try session.save();
            defer a.free(unchanged);
            try std.testing.expectEqualSlices(u8, before, unchanged);
            try std.testing.expect(!try history.undo(&session));
            try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = paragraph, .begin_element = target.begin_element, .start = target.start, .deleted = 0, .inserted = "필드😀<&" }));
            const saved = try session.save();
            defer a.free(saved);
            // Two Korean units precede the emoji surrogate pair.
            try std.testing.expectError(error.SplitSurrogatePair, query(&session, 0, paragraph, target.start + 3, target.start + 3));
            try std.testing.expect(try history.undo(&session));
            const undone = try session.save();
            defer a.free(undone);
            try std.testing.expectEqualSlices(u8, before, undone);
            try std.testing.expect(try history.redo(&session));
            const redone = try session.save();
            defer a.free(redone);
            try std.testing.expectEqualSlices(u8, saved, redone);
            checked += 1;
        }
        try std.testing.expect(checked > 0);
    }
}
