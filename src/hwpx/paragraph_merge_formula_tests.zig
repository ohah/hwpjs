const std = @import("std");

test "HWPX generated-left formula merge allocation failures preserve authority" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var baseline = try @import("editor_session.zig").open(a, input, .{});
    defer baseline.deinit();
    try std.testing.expect(try baseline.splitParagraph(0, 1, 1, 0));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            const parts = try allocator.dupe(@import("editor_session.zig").Section, borrowed.sections);
            defer allocator.free(parts);
            parts[0].structure_values = try borrowed.sections[0].structure_values.?.clone(allocator);
            defer parts[0].structure_values.?.deinit(allocator);
            var session = borrowed.*;
            session.allocator = allocator;
            session.sections = parts;
            _ = session.mergeParagraph(0, 2) catch |err| {
                try std.testing.expectEqualDeep(borrowed.sections[0].structure_values.?, parts[0].structure_values.?);
                try std.testing.expectEqual(borrowed.sections[0].last_paragraph, parts[0].last_paragraph);
                try std.testing.expectEqualSlices(u8, borrowed.source, session.source);
                return err;
            };
            try std.testing.expect(parts[0].structure_values.?.paragraphs[1].generated_id != null);
            try std.testing.expectEqual(@as(usize, 2), parts[0].structure_values.?.paragraphs[1].pieces.?.len);
        }
    }.run, .{&baseline});
    try std.testing.expect(try baseline.mergeParagraph(0, 2));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            var session = borrowed.*;
            session.allocator = allocator;
            const output = try session.save();
            defer allocator.free(output);
        }
    }.run, .{&baseline});
    const saved = try baseline.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 2);
    defer a.free(text);
    try std.testing.expectEqualStrings("BCD", text);
    try std.testing.expectEqual(baseline.sections[0].last_paragraph, reopened.sections[0].last_paragraph);
}

test "HWPX merged formula input allocation failures preserve the complete model" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, bytes, .{});
            defer session.deinit();
            _ = try session.mergeParagraph(0, 1);
            var snapshot = try session.sections[0].structure_values.?.clone(allocator);
            defer snapshot.deinit(allocator);
            const last = session.sections[0].last_paragraph;
            _ = session.splice(0, 2, 0, 1, "100") catch |err| {
                const current = session.sections[0].structure_values.?;
                try std.testing.expectEqual(last, session.sections[0].last_paragraph);
                try std.testing.expectEqual(snapshot.paragraphs.len, current.paragraphs.len);
                for (snapshot.paragraphs, current.paragraphs) |left, right| {
                    try std.testing.expectEqual(left.template_element, right.template_element);
                    try std.testing.expectEqual(left.source_ordinal, right.source_ordinal);
                    try std.testing.expectEqual(left.generated_id, right.generated_id);
                    try std.testing.expectEqual(left.sites.items.len, right.sites.items.len);
                    try std.testing.expectEqual(left.pieces != null, right.pieces != null);
                    if (left.pieces) |pieces| {
                        try std.testing.expectEqual(pieces.len, right.pieces.?.len);
                        for (pieces, right.pieces.?) |one, two| try std.testing.expectEqualDeep(one, two);
                    }
                    for (left.sites.items, right.sites.items) |one, two| try std.testing.expectEqualStrings(one.text, two.text);
                }
                try std.testing.expectEqualSlices(u8, bytes, session.source);
                return err;
            };
            try std.testing.expectEqualStrings("100", session.sections[0].structure_values.?.paragraphs[1].sites.items[0].text);
        }
    }.run, .{input});
}

test "HWPX formula merge transaction allocation failures preserve native authority" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var baseline = try @import("editor_session.zig").open(a, input, .{});
    defer baseline.deinit();
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            const parts = try allocator.dupe(@import("editor_session.zig").Section, borrowed.sections);
            defer allocator.free(parts);
            parts[0].sites = try borrowed.sections[0].sites.clone(allocator);
            defer {
                parts[0].sites.deinit(allocator);
                if (parts[0].structure_values) |*values| values.deinit(allocator);
            }
            var session = borrowed.*;
            session.allocator = allocator;
            session.sections = parts;
            _ = session.mergeParagraph(0, 1) catch |err| {
                try std.testing.expect(parts[0].structure_values == null);
                try std.testing.expectEqual(borrowed.sections[0].last_paragraph, parts[0].last_paragraph);
                for (parts[0].sites.items, borrowed.sections[0].sites.items) |current, original| try std.testing.expectEqualStrings(original.text, current.text);
                try std.testing.expectEqualSlices(u8, borrowed.source, session.source);
                return err;
            };
            try std.testing.expectEqual(@as(usize, 2), parts[0].structure_values.?.paragraphs[0].pieces.?.len);
        }
    }.run, .{&baseline});
    try std.testing.expect(try baseline.mergeParagraph(0, 1));
    try std.testing.expect(try baseline.splice(0, 1, 1, 2, "😀<&"));
    try std.testing.expect(try baseline.splice(0, 2, 0, 1, "100"));
    const saved = try baseline.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("A😀<&D", text);
    var count: usize = 0;
    for (reopened.sections[0].sites.items) |site| if (std.mem.eql(u8, site.text, "100")) {
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
}
