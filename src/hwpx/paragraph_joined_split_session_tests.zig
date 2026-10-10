const std = @import("std");

test "HWPX joined split session allocation failures preserve authority" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p id='9'><p:run><p:t>AB</p:t></p:run></p:p><p:p id='10'><p:run><p:t>CD</p:t></p:run></p:p>");
    defer a.free(input);
    var baseline = try @import("editor_session.zig").open(a, input, .{});
    defer baseline.deinit();
    try std.testing.expect(try baseline.mergeParagraph(0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            const parts = try allocator.dupe(@import("editor_session.zig").Section, borrowed.sections);
            defer allocator.free(parts);
            parts[0].structure_values = try borrowed.sections[0].structure_values.?.clone(allocator);
            defer parts[0].structure_values.?.deinit(allocator);
            var session = borrowed.*;
            session.allocator = allocator;
            session.sections = parts;
            _ = session.splitParagraph(0, 1, 2, 0) catch |err| {
                try std.testing.expectEqualDeep(borrowed.sections[0].structure_values.?, parts[0].structure_values.?);
                try std.testing.expectEqual(borrowed.sections[0].last_paragraph, parts[0].last_paragraph);
                try std.testing.expectEqualSlices(u8, borrowed.source, session.source);
                return err;
            };
            try std.testing.expectEqual(borrowed.sections[0].last_paragraph + 1, parts[0].last_paragraph);
        }
    }.run, .{&baseline});
}
