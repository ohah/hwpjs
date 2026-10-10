const std = @import("std");
const editor = @import("editor_session.zig");
const styled_header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='0'/><h:charPr id='1'/></h:charProperties></h:refList></h:head>";

test "styled formula public remerge allocation failures preserve split transaction" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const input = try fixture.zipWithSectionHeader(a, fixture.section, styled_header);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    try std.testing.expect(try @import("character_style_session.zig").apply(&session, 0, 2, 0, 1, 0));
    try std.testing.expect(try session.splitParagraph(0, 2, 3, 0));
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
            const changed = proxy.mergeParagraph(0, 2) catch |err| {
                const old = source.sections[0].structure_values.?.paragraphs;
                const now = proxy.sections[0].structure_values.?.paragraphs;
                try std.testing.expectEqual(old.len, now.len);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                for (old, now) |left, right| {
                    try std.testing.expectEqualDeep(left.sites.items, right.sites.items);
                    try std.testing.expectEqualDeep(left.character_styles, right.character_styles);
                    try std.testing.expectEqualDeep(left.field_positions, right.field_positions);
                    try std.testing.expectEqual(left.generated_id, right.generated_id);
                }
                var readonly = proxy;
                readonly.allocator = source.allocator;
                const bytes = try readonly.save();
                defer source.allocator.free(bytes);
                try std.testing.expectEqualSlices(u8, expected, bytes);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 2), proxy.sections[0].structure_values.?.paragraphs.len);
            try std.testing.expect(proxy.sections[0].structure_values.?.paragraphs[1].character_styles != null);
        }
    }.run, .{ &session, before });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "styled formula public split allocation failures preserve styles uninstalled markers and ZIP" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const input = try fixture.zipWithSectionHeader(a, fixture.section, styled_header);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    try std.testing.expect(try @import("character_style_session.zig").apply(&session, 0, 2, 0, 1, 0));
    try std.testing.expect(session.sections[0].structure_values.?.paragraphs[1].field_positions == null);
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
            const changed = proxy.splitParagraph(0, 2, 3, 0) catch |err| {
                const old = source.sections[0].structure_values.?.paragraphs;
                const now = proxy.sections[0].structure_values.?.paragraphs;
                try std.testing.expectEqual(old.len, now.len);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                for (old, now) |left, right| {
                    try std.testing.expectEqualDeep(left.sites.items, right.sites.items);
                    try std.testing.expectEqualDeep(left.character_styles, right.character_styles);
                    try std.testing.expectEqualDeep(left.field_positions, right.field_positions);
                    try std.testing.expectEqual(left.generated_id, right.generated_id);
                }
                var readonly = proxy;
                readonly.allocator = source.allocator;
                const bytes = try readonly.save();
                defer source.allocator.free(bytes);
                try std.testing.expectEqualSlices(u8, expected, bytes);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 3), proxy.sections[0].structure_values.?.paragraphs.len);
            try std.testing.expect(proxy.sections[0].structure_values.?.paragraphs[1].character_styles != null);
            try std.testing.expectEqual(@as(usize, 2), proxy.sections[0].structure_values.?.paragraphs[1].field_positions.?.len);
        }
    }.run, .{ &session, before });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(session.sections[0].structure_values.?.paragraphs[1].field_positions == null);
}
