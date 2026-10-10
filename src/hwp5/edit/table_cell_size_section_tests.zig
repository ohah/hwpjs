const std = @import("std");
const model = @import("../../model/document.zig");
const writer = @import("structure_section_writer.zig");

test "HWP5 cell size mutation preserves values across all allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const bindings = try @import("table_display_bindings.zig").read(a, raw, source.header.version(), document.sections[0].paragraphs);
    defer a.free(bindings);
    const first = bindings[0];
    var second: ?@import("table_display_bindings.zig").Binding = null;
    for (bindings) |binding| if (binding.list_node != first.list_node) {
        second = binding;
        break;
    };
    const other = second orelse return error.MissingSecondCell;
    for (0..3) |phase| try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: model.Section, decoded: []const u8, version: @import("../version.zig").Version, left: @import("table_display_bindings.zig").Binding, right: @import("table_display_bindings.zig").Binding, mode: usize) !void {
            var section = original;
            const initial = [_]model.TableCellSize{
                .{ .source_list_node = left.list_node, .width = 1234, .height = 5678 },
                .{ .source_list_node = right.list_node, .width = 90, .height = 100 },
            };
            section.table_cell_sizes = if (mode == 0) null else try allocator.dupe(model.TableCellSize, initial[0..mode]);
            defer if (section.table_cell_sizes) |values| allocator.free(values);
            const command: @import("table_cell_size_values.zig").Edit = if (mode == 2)
                .{ .section = 0, .list_node = left.list_node, .width = left.width, .height = left.height }
            else
                .{ .section = 0, .list_node = right.list_node, .width = 99, .height = 101 };
            @import("table_cell_size_values.zig").apply(allocator, decoded, version, &section, command) catch |err| {
                if (mode == 0) try std.testing.expect(section.table_cell_sizes == null) else try std.testing.expectEqualSlices(model.TableCellSize, initial[0..mode], section.table_cell_sizes.?);
                return err;
            };
            const values = section.table_cell_sizes.?;
            try std.testing.expectEqual(@as(usize, if (mode == 2) 1 else mode + 1), values.len);
            if (mode == 2) try std.testing.expectEqualDeep(initial[1], values[0]) else try std.testing.expectEqual(@as(u32, 99), values[values.len - 1].width);
        }
    }.run, .{ document.sections[0], raw, source.header.version(), first, other, phase });
    var sizes = [_]model.TableCellSize{.{ .source_list_node = first.list_node, .width = 1234, .height = 5678 }};
    var sized = document.sections[0];
    sized.table_cell_sizes = &sizes;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, decoded: []const u8, current: model.Section, version: @import("../version.zig").Version) !void {
            const saved = writer.writeWithDeletions(allocator, decoded, current, version, 1000, 4_000_000, true) catch |err| {
                try std.testing.expectEqual(@as(u32, 1234), current.table_cell_sizes.?[0].width);
                return err;
            };
            defer allocator.free(saved);
            try std.testing.expectEqual(decoded.len, saved.len);
            try std.testing.expectEqual(@as(u32, 1234), current.table_cell_sizes.?[0].width);
        }
    }.run, .{ raw, sized, source.header.version() });
}

test "HWP5 cell size history budget rejects growth and preserves original output" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const selected = try session.tableBindings(a, 0);
    defer a.free(selected);
    const budget = try session.checkpointSize(4_000_000);
    var history = try @import("editor_history.zig").History.init(a, session, 8, budget);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(session, .{ .set_cell_size = .{ .section = 0, .list_node = selected[0].list_node, .width = 1234, .height = 5678 } }));
    try std.testing.expectEqual(budget, try session.checkpointSize(4_000_000));
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(!try history.redo(session));
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
}

test "HWP5 cell size session saves reopens and preserves history on no-op and refusal" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const edit = @import("style_preservation.zig");
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    const original = try session.tableBindings(a, 0);
    defer a.free(original);
    const selected = original[0];
    const command: edit.Command = .{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = 1234, .height = 5678 } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const bindings = try reopened.tableBindings(a, 0);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(u32, 1234), bindings[0].width);
    try std.testing.expectEqual(@as(u32, 5678), bindings[0].height);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidCellDisplayOwner, history.apply(session, .{ .set_cell_size = .{ .section = 0, .list_node = 0, .width = 1, .height = 2 } }));
    try std.testing.expect(!try history.apply(session, .{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = selected.width, .height = selected.height } }));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try session.apply(.{ .set_cell_size = .{ .section = 0, .list_node = selected.list_node, .width = selected.width, .height = selected.height } });
    const reset = try session.save(a, .{});
    defer a.free(reset.bytes);
    try std.testing.expectEqualSlices(u8, bytes, reset.bytes);
}

test "HWP5 cell size section patches only dimensions and composes with cell paragraph split" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const section = &document.sections[0];
    const bindings = try @import("table_display_bindings.zig").read(a, raw, version, section.paragraphs);
    defer a.free(bindings);
    try std.testing.expect(bindings.len != 0);
    const selected = bindings[0];
    const before = try writer.writeWithDeletions(a, raw, section.*, version, 1000, 4_000_000, true);
    defer a.free(before);
    section.table_cell_sizes = try a.alloc(model.TableCellSize, 1);
    section.table_cell_sizes.?[0] = .{ .source_list_node = selected.list_node, .width = 1234, .height = 5678 };
    const changed = try writer.writeWithDeletions(a, raw, section.*, version, 1000, 4_000_000, true);
    defer a.free(changed);
    var tree = try @import("../body/tree.zig").Tree.parse(a, before, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[selected.list_node].record.framing;
    const at = record.offset + record.raw.len - record.payload.len + 16;
    try std.testing.expectEqualSlices(u8, before[0..at], changed[0..at]);
    try std.testing.expectEqualSlices(u8, before[at + 8 ..], changed[at + 8 ..]);
    try std.testing.expectEqual(@as(u32, 1234), std.mem.readInt(u32, changed[at..][0..4], .little));
    try std.testing.expectEqual(@as(u32, 5678), std.mem.readInt(u32, changed[at + 4 ..][0..4], .little));
    section.table_cell_sizes.?[0].source_list_node = 0;
    try std.testing.expectError(error.SourceBindingMismatch, writer.writeWithDeletions(a, raw, section.*, version, 1000, 4_000_000, true));
    section.table_cell_sizes.?[0].source_list_node = selected.list_node;
    try @import("paragraph_split.zig").apply(a, section, raw, version, selected.paragraph, 0, 0xfffffffe, 1000);
    const split = try writer.writeWithDeletions(a, raw, section.*, version, 1000, 4_000_000, true);
    defer a.free(split);
    var reopened = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{split});
    defer reopened.deinit(a);
    try std.testing.expectEqual(section.paragraphs.len, reopened.sections[0].paragraphs.len);
    const current = try @import("table_display_bindings.zig").read(a, split, version, reopened.sections[0].paragraphs);
    defer a.free(current);
    var found: usize = 0;
    for (current) |binding| if (binding.row == selected.row and binding.column == selected.column and binding.table_node == selected.table_node) {
        try std.testing.expectEqual(@as(u32, 1234), binding.width);
        try std.testing.expectEqual(@as(u32, 5678), binding.height);
        found += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), found);
}
