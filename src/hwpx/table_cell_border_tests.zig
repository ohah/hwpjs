//! Focused border regressions; explicit public Noori only, no fixture discovery.
const std = @import("std");
const t = std.testing;
const p = @import("../model/border_fill_patch.zig");
const cell = @import("table_cell_background_session.zig");
const border = @import("table_cell_border_session.zig");
const resource = @import("border_fill_resource_patch.zig");
const editor = @import("editor_session.zig");
const hist = @import("editor_history.zig");
const sources = @import("table_border_sources.zig");
const xmlpatch = @import("border_fill_xml_patch.zig");
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx";
const profile: @import("source_color_profile.zig").Profile = .{ .verified = true };
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills itemCnt='1'>";
const suffix = "</h:borderFills></h:refList></h:head>";
const template = "<h:borderFill id='3' opaque='keep'><h:leftBorder type='SOLID' width='0.12 mm' color='#123456'/><h:rightBorder type='SOLID' width='0.12 mm' color='#123456'/><h:topBorder type='SOLID' width='0.12 mm' color='#123456'/><h:bottomBorder type='SOLID' width='0.12 mm' color='#123456'/><h:diagonal type='DASH' width='0.20 mm' color='#654321'/></h:borderFill>";

fn target(session: *const editor.Session) !cell.Owner {
    const bindings = try @import("table_display_bindings.zig").read(session.allocator, session, 0);
    defer session.allocator.free(bindings);
    for (bindings) |binding| {
        const owner = try cell.target(session, 0, binding.owner.table_node, binding.owner.list_node);
        if (owner.source_id == 18) return owner;
    }
    return error.MissingTestCell;
}
fn command(owner: cell.Owner, edges: u8, style: p.Style, width: u16, color: u32) hist.Command {
    return .{ .kind = .cell_border, .section = owner.section, .table_node = owner.table_node, .list_node = owner.list_node, .cell_border_edges = edges, .cell_border_style = style, .cell_border_width = width, .cell_border_color = color, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn backgroundCommand(owner: cell.Owner, color: u32) hist.Command {
    return .{ .kind = .cell_background, .section = owner.section, .table_node = owner.table_node, .list_node = owner.list_node, .cell_background_color = color, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn selected(report: *const sources.Report, list: usize) !sources.Cell {
    for (report.cells) |entry| if (entry.list_node == list) return entry;
    return error.MissingTestCell;
}
fn current(session: *const editor.Session, owner: cell.Owner) !p.Value {
    const a = session.allocator;
    var report = try sources.read(a, session, owner.section);
    defer report.deinit(a);
    const chosen = try selected(&report, owner.list_node);
    const plan = try @import("table_cell_background_save.zig").currentHeader(session);
    defer a.free(plan.replacement.bytes);
    defer a.free(plan.ids);
    defer a.free(plan.offsets);
    defer a.free(plan.indices);
    var tree = try @import("header_tree.zig").parse(a, plan.replacement.bytes, 0, .{});
    defer tree.deinit(a);
    return xmlpatch.observe(a, &tree, try resource.sourceNode(a, &tree, chosen.border_fill_id.?), try cell.profile(session));
}
fn originalValue(session: *const editor.Session, owner: cell.Owner) !p.Value {
    const a = session.allocator;
    var doc = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer doc.deinit(a);
    var header = try doc.readHeaderTree(a, .{});
    defer header.deinit(a);
    return xmlpatch.observe(a, &header, try resource.sourceNode(a, &header, owner.source_id), try cell.profile(session));
}
fn expectResourcesPreserved(a: std.mem.Allocator, original: []const u8, saved: []const u8) !void {
    var before = try @import("package.zig").inspectDocument(a, original, .{});
    defer before.deinit(a);
    var after = try @import("package.zig").inspectDocument(a, saved, .{});
    defer after.deinit(a);
    var old = try before.readHeaderTree(a, .{});
    defer old.deinit(a);
    var next = try after.readHeaderTree(a, .{});
    defer next.deinit(a);
    for (old.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").head_uri, "borderFill")) continue;
        const id = try resource.id(a, &old, node);
        try t.expectEqualSlices(u8, old.sourceOf(node), next.sourceOf(try resource.sourceNode(a, &next, id)));
    }
}

test "HWPX cell border request accepts exactly three styles all widths and individual masks" {
    for ([_]p.Style{ .NONE, .SOLID, .DOUBLE_SLIM }) |style| {
        for (p.widths) |width| {
            for ([_]u8{ 1, 2, 4, 8, 15 }) |mask| {
                const requested = try border.request(mask, style, width, 0);
                for (requested.border.edges, 0..) |edge, i| {
                    try t.expectEqual(mask & (@as(u8, 1) << @intCast(i)) != 0, edge != null);
                    if (edge) |value| {
                        try t.expectEqual(style, value.style.?);
                        try t.expectEqual(width, value.width_hundredth_mm.?);
                        try t.expectEqual(@as(u32, 0), value.color.?);
                    }
                }
            }
        }
    }
    try t.expectError(error.InvalidCellBorderEdges, border.request(0, .SOLID, 10, 0));
    try t.expectError(error.InvalidCellBorderEdges, border.request(16, .SOLID, 10, 0));
    try t.expectError(error.UnsupportedBorderLineStyle, border.request(1, .DASH, 10, 0));
    try t.expectError(error.UnsupportedBorderWidth, border.request(1, .SOLID, 11, 0));
    try t.expectError(error.InvalidCharacterColor, border.request(1, .SOLID, 10, 0x1000000));
}

test "HWPX cell border sparse normalization preserves other edges and does not invent absent fields" {
    const requested = try border.request(1, .NONE, 12, 0);
    var source: p.Value = .{};
    source.edges[0] = .{ .style = .NONE, .width_hundredth_mm = 12, .color = 0 };
    var existing: p.Border = .{};
    existing.edges[0] = .{ .style = .SOLID, .width_hundredth_mm = 25, .color = 0x123456 };
    existing.edges[3] = .{ .style = .DOUBLE_SLIM, .color = 0 };
    const normalized = border.normalized(existing, requested, source);
    try t.expect(normalized.edges[0] == null);
    try t.expectEqualDeep(existing.edges[3], normalized.edges[3]);
    source.edges[0] = .{};
    const explicit = border.normalized(existing, requested, source);
    try t.expectEqualDeep(requested.border.edges[0], explicit.edges[0]);
}

test "HWPX cell border batch complete patch key deduplicates only exact composed requests" {
    const a = t.allocator;
    var tree = try @import("header_tree.zig").parse(a, prefix ++ template ++ suffix, 0, .{});
    defer tree.deinit(a);
    const left = try border.request(1, .SOLID, 12, 0);
    const right = try border.request(2, .SOLID, 12, 0);
    const double = try border.request(1, .DOUBLE_SLIM, 12, 0);
    const wide = try border.request(1, .SOLID, 500, 0);
    const composed = p.merge(left, .{ .background = .{ .solid = .{ .color = 0 } } });
    const requests = [_]resource.PatchRequest{
        .{ .source_id = 3, .patch = left },     .{ .source_id = 3, .patch = right },
        .{ .source_id = 3, .patch = double },   .{ .source_id = 3, .patch = wide },
        .{ .source_id = 3, .patch = composed }, .{ .source_id = 3, .patch = left },
    };
    var stats: resource.SolidBatchStats = .{};
    const result = try resource.writePatchBatch(a, &tree, &requests, 16000, profile, &stats);
    defer a.free(result.bytes);
    defer a.free(result.ids);
    try t.expectEqual(@as(usize, 5), stats.fragments);
    try t.expectEqual(@as(usize, 1), stats.reused);
    try t.expectEqual(@as(usize, 1), stats.resources);
    try t.expectEqual(@as(usize, 1), stats.header_writes);
    for (result.ids[0..5], 0..) |id, i| for (result.ids[i + 1 .. 5]) |other| try t.expect(id != other);
    try t.expectEqual(result.ids[0], result.ids[5]);
    var after = try @import("header_tree.zig").parse(a, result.bytes, 0, .{});
    defer after.deinit(a);
    try t.expectEqualSlices(u8, tree.sourceOf(try resource.sourceNode(a, &tree, 3)), after.sourceOf(try resource.sourceNode(a, &after, 3)));
    const value = try xmlpatch.observe(a, &after, try resource.sourceNode(a, &after, result.ids[4]), profile);
    try t.expect(p.matches(value, composed));
}

test "HWPX cell border only preserves image hatch unknown background and extension bytes" {
    const a = t.allocator;
    for ([_][]const u8{
        "<c:fillBrush><c:imgBrush mode='TOTAL'><c:img binaryItemIDRef='image1'/></c:imgBrush></c:fillBrush>",
        "<c:fillBrush><c:winBrush faceColor='#123456' hatchColor='#654321' hatchStyle='CROSS'/></c:fillBrush>",
        "<c:fillBrush odd='keep'><!--opaque--><c:future value='do-not-touch'/></c:fillBrush>",
    }) |fill| {
        const xml = try std.fmt.allocPrint(a, "{s}<h:borderFill id='3' opaque='keep'><h:leftBorder type='SOLID' width='0.12 mm' color='#123456' extension='keep'/>{s}<h:future a='keep'/></h:borderFill>{s}", .{ prefix, fill, suffix });
        defer a.free(xml);
        var tree = try @import("header_tree.zig").parse(a, xml, 0, .{});
        defer tree.deinit(a);
        var stats: resource.SolidBatchStats = .{};
        const changed = try resource.writePatchBatch(a, &tree, &.{.{ .source_id = 3, .patch = try border.request(1, .DOUBLE_SLIM, 500, 0) }}, 16000, profile, &stats);
        defer a.free(changed.bytes);
        defer a.free(changed.ids);
        var parsed = try @import("header_tree.zig").parse(a, changed.bytes, 0, .{});
        defer parsed.deinit(a);
        const fragment = parsed.sourceOf(try resource.sourceNode(a, &parsed, changed.ids[0]));
        try t.expect(std.mem.indexOf(u8, fragment, fill) != null);
        try t.expect(std.mem.indexOf(u8, fragment, "extension='keep'") != null);
        try t.expect(std.mem.indexOf(u8, fragment, "<h:future a='keep'/>") != null);
        const value = try xmlpatch.observeSelected(a, &parsed, try resource.sourceNode(a, &parsed, changed.ids[0]), profile, .{ true, false, false, false }, false);
        try t.expect(p.matches(value, try border.request(1, .DOUBLE_SLIM, 500, 0)));
    }
}

test "HWPX cell border missing edge rejects and absent fields remain unobserved before write" {
    const a = t.allocator;
    var tree = try @import("header_tree.zig").parse(a, prefix ++ "<h:borderFill id='3'><h:leftBorder/></h:borderFill>" ++ suffix, 0, .{});
    defer tree.deinit(a);
    const node = try resource.sourceNode(a, &tree, 3);
    const value = try xmlpatch.observe(a, &tree, node, profile);
    try t.expectEqualDeep(p.EdgeValue{}, value.edges[0]);
    try t.expectEqualDeep(p.EdgeValue{}, value.edges[1]);
    var stats: resource.SolidBatchStats = .{};
    try t.expectError(error.MissingBorderFillEdge, resource.writePatchBatch(a, &tree, &.{.{ .source_id = 3, .patch = try border.request(2, .NONE, 10, 0) }}, 8000, profile, &stats));
    try t.expectEqual(@as(usize, 0), stats.header_writes);
}

fn batchAllocations(a: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree) !void {
    var stats: resource.SolidBatchStats = .{};
    const result = try resource.writePatchBatch(a, source, &.{.{ .source_id = 3, .patch = try border.request(15, .NONE, 12, 0) }}, 16000, profile, &stats);
    defer a.free(result.bytes);
    defer a.free(result.ids);
    try t.expectEqual(@as(usize, 1), stats.fragments);
}

test "HWPX cell border synthetic batch allocation failures release every partial clone" {
    const a = t.allocator;
    var tree = try @import("header_tree.zig").parse(a, prefix ++ template ++ suffix, 0, .{});
    defer tree.deinit(a);
    // Pin realloc/remap behavior across every failure index. The backing debug
    // allocator may otherwise grow an allocation in place in only some runs.
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    try t.checkAllAllocationFailures(fixed_growth.allocator(), batchAllocations, .{&tree});
    try t.expectEqual(fixed_growth.allocated_bytes, fixed_growth.freed_bytes);
}

// Each command order is independently exercised with V1 and V2 checkpoints.
test "HWPX cell border Noori both background orders COW live batch save reopen undo redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        for ([_]bool{ false, true }) |background_first| {
            var session = try editor.open(a, input, .{});
            defer session.deinit();
            const owner = try target(&session);
            const original = try originalValue(&session, owner);
            var before = try sources.read(a, &session, 0);
            defer before.deinit(a);
            var history = if (v2) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
            defer history.deinit();
            const edge_command = command(owner, 5, .DOUBLE_SLIM, 25, 0);
            const bg_command = backgroundCommand(owner, 0x123456);
            try t.expect(try history.apply(&session, if (background_first) bg_command else edge_command));
            const middle = try session.save();
            defer a.free(middle);
            try t.expect(try history.apply(&session, if (background_first) edge_command else bg_command));
            try t.expect(!try history.apply(&session, edge_command));
            try t.expectEqual(@as(usize, 1), session.cell_backgrounds.items.len);
            const observed = try current(&session, owner);
            try t.expect(p.matches(observed, try border.request(5, .DOUBLE_SLIM, 25, 0)));
            try t.expectEqual(@as(u32, 0x123456), observed.background.?.solid.color);
            try t.expectEqualDeep(original.edges[1], observed.edges[1]);
            try t.expectEqualDeep(original.edges[3], observed.edges[3]);
            try t.expectEqual(@as(?u32, 0x123456), (try cell.observe(&session, 0, owner.table_node, owner.list_node)).color);
            var live = try sources.read(a, &session, 0);
            defer live.deinit(a);
            for (before.cells, live.cells) |old, now| {
                if (old.list_node != owner.list_node) {
                    try t.expectEqual(old.border_fill_id, now.border_fill_id);
                    const old_style = try std.json.Stringify.valueAlloc(a, before.styles[old.style_index.?], .{});
                    defer a.free(old_style);
                    const now_style = try std.json.Stringify.valueAlloc(a, live.styles[now.style_index.?], .{});
                    defer a.free(now_style);
                    try t.expectEqualStrings(old_style, now_style);
                }
            }
            var batch = try @import("table_border_sources_batch.zig").read(a, &session, &.{ 0, 0 });
            defer batch.deinit(a);
            const expected = try std.json.Stringify.valueAlloc(a, live, .{});
            defer a.free(expected);
            for (batch.entries) |entry| {
                const actual = try std.json.Stringify.valueAlloc(a, entry.result.value, .{});
                defer a.free(actual);
                try t.expectEqualStrings(expected, actual);
            }
            const saved = try session.save();
            defer a.free(saved);
            try expectResourcesPreserved(a, input, saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            try t.expectEqualDeep(observed, try originalValue(&reopened, try cell.target(&reopened, 0, owner.table_node, owner.list_node)));
            try t.expect(try history.undo(&session));
            const undone = try session.save();
            defer a.free(undone);
            try t.expectEqualSlices(u8, middle, undone);
            // A same-current request after undo must not destroy the redo branch.
            const left = original.edges[0];
            const unchanged = if (background_first) command(owner, 1, left.style.?, left.width_hundredth_mm.?, left.color.?) else edge_command;
            try t.expect(!try history.apply(&session, unchanged));
            try t.expect(try history.redo(&session));
            const redone = try session.save();
            defer a.free(redone);
            try t.expectEqualSlices(u8, saved, redone);
            try t.expect(try history.undo(&session));
            try t.expect(try history.undo(&session));
            const reset = try session.save();
            defer a.free(reset);
            try t.expectEqualSlices(u8, input, reset);
        }
    }
}

test "HWPX cell border Noori return individual original edge preserves background and other edge" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const owner = try target(&session);
    const original = try originalValue(&session, owner);
    try t.expect(try session.setCellBackground(0, owner.table_node, owner.list_node, 0x123456));
    try t.expect(try session.setCellBorder(0, owner.table_node, owner.list_node, 9, .DOUBLE_SLIM, 500, 0));
    const left = original.edges[0];
    try t.expect(try session.setCellBorder(0, owner.table_node, owner.list_node, 1, left.style.?, left.width_hundredth_mm.?, left.color.?));
    try t.expect(session.cell_backgrounds.items[0].border.edges[0] == null);
    try t.expect(session.cell_backgrounds.items[0].border.edges[3] != null);
    try t.expectEqual(@as(?u32, 0x123456), session.cell_backgrounds.items[0].color);
    // Restoring background leaves bottom intent live in that same entry.
    try t.expect(try session.setCellBackground(0, owner.table_node, owner.list_node, original.background.?.solid.color));
    try t.expect(session.cell_backgrounds.items[0].color == null);
    try t.expect(session.cell_backgrounds.items[0].border.edges[3] != null);
    const bottom = original.edges[3];
    try t.expect(try session.setCellBorder(0, owner.table_node, owner.list_node, 8, bottom.style.?, bottom.width_hundredth_mm.?, bottom.color.?));
    try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
    const reset = try session.save();
    defer a.free(reset);
    try t.expectEqualSlices(u8, input, reset);
}

test "HWPX cell border Noori all edges clear black rejects bad owner and rolls back save failure" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const owner = try target(&session);
    try t.expectError(error.InvalidSectionIndex, session.setCellBorder(session.sections.len, owner.table_node, owner.list_node, 1, .SOLID, 12, 0));
    try t.expectError(error.InvalidCellBackgroundOwner, session.setCellBorder(0, owner.table_node + 1, owner.list_node, 1, .SOLID, 12, 0));
    try t.expect(try session.setCellBackground(0, owner.table_node, owner.list_node, 0));
    const unchanged = session.cell_backgrounds.items[0];
    const limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try t.expectError(error.LimitExceeded, session.setCellBorder(0, owner.table_node, owner.list_node, 15, .NONE, 12, 0));
    session.options.max_output_bytes = limit;
    try t.expectEqualDeep(unchanged, session.cell_backgrounds.items[0]);
    try t.expect(try session.setCellBorder(0, owner.table_node, owner.list_node, 15, .NONE, 12, 0));
    const value = try current(&session, owner);
    try t.expect(p.matches(value, try border.request(15, .NONE, 12, 0)));
    try t.expectEqual(@as(u32, 0), value.background.?.solid.color);
}

// A successful counted edit defines only this edit's allocation range. Sample
// both preflight and late-save failures without sweeping a whole real document.
test "HWPX cell border Noori bounded edit allocation failures retain unified background state" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var edit_allocations: usize = 0;
    var counter = std.testing.FailingAllocator.init(a, .{});
    {
        var session = try editor.open(counter.allocator(), input, .{});
        defer session.deinit();
        const owner = try target(&session);
        try t.expect(try session.setCellBackground(0, owner.table_node, owner.list_node, 0x123456));
        const start = counter.alloc_index;
        try t.expect(try session.setCellBorder(0, owner.table_node, owner.list_node, 15, .DOUBLE_SLIM, 25, 0));
        edit_allocations = counter.alloc_index - start;
    }
    try t.expectEqual(counter.allocated_bytes, counter.freed_bytes);
    try t.expect(edit_allocations > 2);
    for ([_]usize{ 0, 1, edit_allocations / 2, edit_allocations - 1 }) |offset| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        {
            var session = try editor.open(failing.allocator(), input, .{});
            defer session.deinit();
            const owner = try target(&session);
            try t.expect(try session.setCellBackground(0, owner.table_node, owner.list_node, 0x123456));
            const before = session.cell_backgrounds.items[0];
            const saved_before = try session.save();
            defer failing.allocator().free(saved_before);
            failing.fail_index = failing.alloc_index + offset;
            try t.expectError(error.OutOfMemory, session.setCellBorder(0, owner.table_node, owner.list_node, 15, .DOUBLE_SLIM, 25, 0));
            try t.expect(failing.has_induced_failure);
            failing.fail_index = std.math.maxInt(usize);
            try t.expectEqualDeep(before, session.cell_backgrounds.items[0]);
            const saved_after = try session.save();
            defer failing.allocator().free(saved_after);
            try t.expectEqualSlices(u8, saved_before, saved_after);
        }
        try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    }
}

test "HWPX cell border Noori every width and individual sides three style commands" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const owner = try target(&session);
    const original = try originalValue(&session, owner);
    for (p.widths) |width| {
        _ = try session.setCellBorder(0, owner.table_node, owner.list_node, 1, .SOLID, width, 0);
        try t.expect(p.matches(try current(&session, owner), try border.request(1, .SOLID, width, 0)));
    }
    for ([_]u8{ 1, 2, 4, 8 }) |mask| {
        for ([_]p.Style{ .NONE, .SOLID, .DOUBLE_SLIM }) |style| {
            _ = try session.setCellBorder(0, owner.table_node, owner.list_node, mask, style, 12, 0);
            try t.expect(p.matches(try current(&session, owner), try border.request(mask, style, 12, 0)));
        }
    }
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const value = try originalValue(&reopened, try cell.target(&reopened, 0, owner.table_node, owner.list_node));
    try t.expect(p.matches(value, try border.request(15, .DOUBLE_SLIM, 12, 0)));
    try t.expectEqualDeep(original.background, value.background);
}
