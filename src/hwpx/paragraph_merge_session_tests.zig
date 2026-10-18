const std = @import("std");

test "HWPX merge retains later generated continuations and their current edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 1, 0));
    try std.testing.expect(try session.splitParagraph(0, 3, 1, 0));
    try std.testing.expect(try session.splice(0, 4, 0, 0, "보존😀<&"));
    const remaining = try session.anchorText(0, 4);
    defer a.free(remaining);
    try std.testing.expect(try session.mergeParagraph(0, 2));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].last_paragraph, reopened.sections[0].last_paragraph);
    const actual = try reopened.anchorText(0, 3);
    defer a.free(actual);
    try std.testing.expectEqualStrings(remaining, actual);
    const merged = try reopened.anchorText(0, 2);
    defer a.free(merged);
    try std.testing.expectEqualStrings("기울", merged);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            var proxy = borrowed.*;
            proxy.allocator = allocator;
            const output = try proxy.save();
            defer allocator.free(output);
        }
    }.run, .{&session});
}

test "HWPX merged provenance IDs do not reserve deleted paragraph identities" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    try std.testing.expect(try session.mergeParagraph(0, 2));
    try std.testing.expect(try session.splitParagraph(0, session.sections[0].last_paragraph, 0, 0));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].last_paragraph, reopened.sections[0].last_paragraph);
}

test "HWPX merged session owns input save and checkpoint restoration without duplicate text" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer checkpoint.deinit();
    const section = &session.sections[0];
    const count = section.last_paragraph;
    try std.testing.expect(try session.splice(0, count, 0, 0, "비대상편집"));
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(session.options), &report);
    defer values.deinit(a);
    try std.testing.expect(try session.mergeParagraph(0, 2));
    try std.testing.expect(try session.canEdit(0, 2));
    const before = try session.anchorText(0, 2);
    defer a.free(before);
    try std.testing.expect(try session.splice(0, 2, 0, 0, "현재병합😀<&"));
    const current = try session.anchorText(0, 2);
    defer a.free(current);
    const expected = try std.mem.concat(a, u8, &.{ "현재병합😀<&", before });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, current);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const actual = try reopened.anchorText(0, 2);
    defer a.free(actual);
    try std.testing.expectEqualStrings(expected, actual);
    try std.testing.expectEqual(count - 1, reopened.sections[0].last_paragraph);
    const other = try session.anchorText(0, count - 1);
    defer a.free(other);
    const reopened_other = try reopened.anchorText(0, count - 1);
    defer a.free(reopened_other);
    try std.testing.expectEqualStrings(other, reopened_other);
    try std.testing.expect(std.mem.startsWith(u8, other, "비대상편집"));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            var proxy = borrowed.*;
            proxy.allocator = allocator;
            const output = try proxy.save();
            defer allocator.free(output);
        }
    }.run, .{&session});
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const @import("editor_session.zig").Session) !void {
            var proxy = borrowed.*;
            proxy.allocator = allocator;
            var snapshot = try @import("editor_checkpoint.zig").capture(&proxy, 4_000_000);
            defer snapshot.deinit();
        }
    }.run, .{&session});
    var after = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer after.deinit();
    try checkpoint.exchange(&session);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try checkpoint.exchange(&session);
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, current_values: *const @import("paragraph_structure_values.zig").Values) !void {
            var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, source, current_values, 1, 4_000_000);
            defer candidate.deinit(allocator);
        }
    }.run, .{ &section.tree, &values });
}
