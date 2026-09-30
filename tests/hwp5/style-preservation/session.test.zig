const std = @import("std");
const core = @import("hwpjs");
const edit = core.hwp5.experimental_style_preservation;
const a = std.testing.allocator;
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/example.hwp";

fn read() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, fixture, a, .limited(2_000_000));
}

test "style preservation original lifetime, model edits and revert" {
    const input = try read();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const original = try session.paragraph(0, 0);
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
    try std.testing.expect(!unchanged.layout_requires_reflow);
    @memset(input, 0);
    const new_style: u8 = if (original.style_id == 0) 1 else 0;
    try session.apply(.{ .set_style = .{ .section = 0, .paragraph = 0, .style_id = new_style } });
    try std.testing.expectEqual(new_style, (try session.paragraph(0, 0)).style_id);
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(saved.layout_requires_reflow);
    var reloaded = try core.hwp5.model_projection.fromFile(a, saved.bytes);
    defer reloaded.deinit(a);
    try std.testing.expectEqual(new_style, reloaded.sections[0].paragraphs[0].style_id);
    try session.apply(.{ .set_style = .{ .section = 0, .paragraph = 0, .style_id = original.style_id } });
    const reverted = try session.save(a, .{});
    defer a.free(reverted.bytes);
    try std.testing.expectEqualSlices(u8, unchanged.bytes, reverted.bytes);
}

test "style preservation refuses invalid references, paths and structural edits atomically" {
    const input = try read();
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    const before = try session.paragraph(0, 0);
    try std.testing.expectError(error.InvalidStyleReference, session.apply(.{ .set_style = .{ .section = 0, .paragraph = 0, .style_id = 255 } }));
    try std.testing.expectError(error.InvalidSection, session.apply(.{ .set_style = .{ .section = 999, .paragraph = 0, .style_id = 0 } }));
    try std.testing.expectError(error.InvalidParagraph, session.apply(.{ .set_style = .{ .section = 0, .paragraph = 999, .style_id = 0 } }));
    try std.testing.expectError(error.UnsupportedStructuralEdit, session.apply(.{ .insert_text = .{ .section = 0, .paragraph = 0, .utf8 = "longer" } }));
    try std.testing.expectError(error.UnsupportedStructuralEdit, session.apply(.{ .delete_paragraph = .{ .section = 0, .paragraph = 0 } }));
    try std.testing.expectEqualDeep(before, try session.paragraph(0, 0));
    const after = try session.save(a, .{});
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, input, after.bytes);
}

test "style preservation independent sessions and repeated saves do not share mutable state" {
    const input = try read();
    defer a.free(input);
    const first = try edit.Session.open(a, input);
    defer first.close();
    const second = try edit.Session.open(a, input);
    defer second.close();
    const original = (try first.paragraph(0, 0)).style_id;
    try first.apply(.{ .set_style = .{ .section = 0, .paragraph = 0, .style_id = if (original == 0) 1 else 0 } });
    try std.testing.expectEqual(original, (try second.paragraph(0, 0)).style_id);
    const saved = try first.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const repeated = try first.save(a, .{ .allow_stale_layout = true });
    defer a.free(repeated.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, repeated.bytes);
    try std.testing.expectError(error.LimitExceeded, first.save(a, .{ .allow_stale_layout = true, .max_output_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, second.save(a, .{ .max_output_bytes = 1 }));
}

test "style preservation every open and save allocation failure cleans up" {
    const input = try read();
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const session = try edit.Session.open(allocator, bytes);
            defer session.close();
            const original = (try session.paragraph(0, 0)).style_id;
            try session.apply(.{ .set_style = .{ .section = 0, .paragraph = 0, .style_id = if (original == 0) 1 else 0 } });
            const saved = try session.save(allocator, .{ .allow_stale_layout = true });
            defer allocator.free(saved.bytes);
        }
    }.run, .{input});
}
