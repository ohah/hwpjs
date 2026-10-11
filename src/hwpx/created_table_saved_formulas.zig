//! Validate formula semantics against the serialized generated-table document.
pub fn validate(session: *const @import("editor_session.zig").Session, saved: []const u8) !void {
    var needed = false;
    for (session.sections) |section| {
        if (try @import("formula_section_save.zig").hasFormula(session.allocator, &section.tree)) {
            needed = true;
            break;
        }
    }
    if (!needed) return;
    var reopened = try @import("editor_session.zig").open(session.allocator, saved, session.options);
    defer reopened.deinit();
    for (reopened.sections, 0..) |section, index| {
        if (!try @import("formula_section_save.zig").hasFormula(session.allocator, &section.tree)) continue;
        var result = try @import("formula_current_snapshot.zig").read(session.allocator, &reopened, index);
        defer result.deinit(session.allocator);
    }
}

test "created table saved formula validation allocation failures leave borrowed authority unchanged" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session, saved: []const u8) !void {
            var borrowed = original.*;
            borrowed.allocator = allocator;
            try validate(&borrowed, saved);
        }
    }.run, .{ &session, bytes });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
