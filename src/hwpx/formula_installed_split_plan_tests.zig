const std = @import("std");
const editor = @import("editor_session.zig");

test "installed formula split query allocation failures never publish or hide OOM" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const before = try session.save();
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn verify(source: *const editor.Session, expected: []const u8) !void {
            try std.testing.expectEqual(@as(usize, 3), source.sections[0].structure_values.?.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 0), source.sections[0].sites.items.len);
            try std.testing.expectEqualStrings("100", source.sections[0].structure_values.?.paragraphs[0].sites.items[0].text);
            try std.testing.expectEqualStrings("2", source.sections[0].structure_values.?.paragraphs[2].sites.items[0].text);
            const saved = try source.save();
            defer source.allocator.free(saved);
            try std.testing.expectEqualSlices(u8, expected, saved);
        }
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, expected: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const allowed = proxy.canSplitParagraph(0, 3, 3, 0) catch |err| {
                try verify(source, expected);
                return err;
            };
            try std.testing.expect(allowed);
            try verify(source, expected);
        }
    }.run, .{ &session, before });
    try std.testing.expect(!try session.canSplitParagraph(0, 3, 1, 0));
    try std.testing.expectError(error.InvalidParagraphIndex, session.canSplitParagraph(0, 100, 0, 0));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "installed formula public resplit allocation failures preserve complete transaction" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const before = try session.save();
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, expected: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
            defer proxy.sections[0].structure_values.?.deinit(allocator);
            const changed = proxy.splitParagraph(0, 3, 3, 0) catch |err| {
                try std.testing.expectEqual(source.sections[0].first_paragraph, proxy.sections[0].first_paragraph);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                const old = source.sections[0].structure_values.?.paragraphs;
                const now = proxy.sections[0].structure_values.?.paragraphs;
                try std.testing.expectEqual(old.len, now.len);
                for (old, now) |left, right| {
                    try std.testing.expectEqual(left.source_ordinal, right.source_ordinal);
                    try std.testing.expectEqual(left.generated_id, right.generated_id);
                    try std.testing.expectEqualDeep(left.field_positions, right.field_positions);
                    try std.testing.expectEqualDeep(left.sites.items, right.sites.items);
                }
                // Read-only verification uses a healthy allocator, not a retry
                // of the failed mutation, so the saved bytes can be inspected.
                var readonly = proxy;
                readonly.allocator = source.allocator;
                const bytes = try readonly.save();
                defer source.allocator.free(bytes);
                try std.testing.expectEqualSlices(u8, expected, bytes);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 4), proxy.sections[0].structure_values.?.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].sites.items.len);
        }
    }.run, .{ &session, before });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "installed formula split plan allocation failures preserve current authority and saved ZIP" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const trees = [_]@import("xml_part_tree.zig").Tree{session.sections[0].tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const before = try session.save();
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, borrowed: []const @import("xml_part_tree.zig").Tree, fields: *const @import("field_markers.zig").Report) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            defer {
                std.testing.expectEqual(@as(usize, 0), original.sections[0].sites.items.len) catch @panic("duplicate text authority");
                std.testing.expectEqual(@as(usize, 3), original.sections[0].structure_values.?.paragraphs.len) catch @panic("paragraph mutation");
                std.testing.expectEqualStrings("100", original.sections[0].structure_values.?.paragraphs[0].sites.items[0].text) catch @panic("numeric mutation");
                std.testing.expectEqualStrings("2", original.sections[0].structure_values.?.paragraphs[2].sites.items[0].text) catch @panic("result cache mutation");
            }
            const range = (try @import("formula_installed_split_plan.zig").prepare(&proxy, borrowed, 0, &original.sections[0].structure_values.?, 2, fields, 3, 3)) orelse return error.MissingFormulaSplitCoordinates;
            try std.testing.expectEqual(@as(u32, 1), range.start);
            try std.testing.expectEqual(range.start, range.end);
        }
    }.run, .{ &session, &trees, &report });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
