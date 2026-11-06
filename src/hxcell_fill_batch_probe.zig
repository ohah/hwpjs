//! Focused source-prepared probes. Execute only under the main Native slot.
//! The sole on-disk input is the explicitly allowed original Noori HWPX.
const std = @import("std");
const t = std.testing;
const editor = @import("hwpx/editor_session.zig");
const hist = @import("hwpx/editor_history.zig");
const cell = @import("hwpx/table_cell_background_session.zig");
const resource = @import("hwpx/border_fill_resource_patch.zig");
const xmlpatch = @import("hwpx/border_fill_xml_patch.zig");
const p = @import("model/border_fill_patch.zig");
const Request = @import("hwpx/hxcell_fill_batch.zig").Request;
const fixture = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx";
const gradient: p.Background = .{ .linear = .{ .colors = .{ 0x123456, 0xabcdef }, .angle = 270, .center_x = 20, .center_y = 70, .step = 10, .step_center = 30 } };
const hatch: p.Background = .{ .hatch = .{ .face = 0x123456, .hatch = 0x654321, .style = .CROSS_DIAGONAL } };
const fills = [_]p.Background{ .none, .{ .solid = .{ .color = 0x13579b } }, hatch, gradient };
fn requests(session: *const editor.Session) ![4]Request {
    const bindings = try @import("hwpx/table_display_bindings.zig").read(session.allocator, session, 0);
    defer session.allocator.free(bindings);
    var result: [4]Request = undefined;
    var count: usize = 0;
    for (bindings) |binding| {
        const raw = (try session.sections[0].tree.attributeValue(session.allocator, binding.owner.cell_node, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
        if (try @import("hwpx/table_xml_fields.zig").unsigned(session.allocator, raw, 4096) != 3) continue;
        var duplicate = false;
        for (result[0..count]) |known| if (known.list_node == binding.owner.list_node) {
            duplicate = true;
        };
        if (duplicate) continue;
        result[count] = .{ .section = 0, .table_node = @intCast(binding.owner.table_node), .list_node = @intCast(binding.owner.list_node), .fill = fills[count] };
        count += 1;
        if (count == result.len) return result;
    }
    return error.MissingSharedTestCells;
}
fn command(values: []const Request) hist.Command {
    return .{ .kind = .cell_fills, .cell_fills = values, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn observe(session: *const editor.Session, r: Request) !p.Background {
    return (try cell.observeFill(session, r.section, r.table_node, r.list_node)).background;
}
fn preservedResources(original: []const u8, saved: []const u8) !void {
    const a = t.allocator;
    var old = try @import("hwpx/package.zig").inspectDocument(a, original, .{});
    defer old.deinit(a);
    var next = try @import("hwpx/package.zig").inspectDocument(a, saved, .{});
    defer next.deinit(a);
    var before = try old.readHeaderTree(a, .{});
    defer before.deinit(a);
    var after = try next.readHeaderTree(a, .{});
    defer after.deinit(a);
    for (before.elements, 0..) |element, node| {
        if (!element.is(@import("hwpx/document_xml.zig").head_uri, "borderFill")) continue;
        try t.expectEqualSlices(u8, before.sourceOf(node), after.sourceOf(try resource.sourceNode(a, &after, try resource.id(a, &before, node))));
    }
}

test "HX fill batch mixed four variants shared original V1 V2 one undo borrowed lifetime save reopen" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = v2;
        var req = try requests(&session);
        var expected: [4]p.Background = undefined;
        for (req, &expected) |r, *value| value.* = p.merge(.{ .background = try observe(&session, r) }, .{ .background = r.fill }).background.?;
        var before = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
        defer before.deinit(a);
        var h = if (v2) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
        defer h.deinit();
        const border_req = [_]@import("hwpx/hxcell_border_batch.zig").Request{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .edges = 5, .style = .DOUBLE_SLIM, .width_hundredth_mm = 70, .color = 0x2468ac }};
        const border_cmd: hist.Command = .{ .kind = .cell_borders, .cell_borders = &border_req, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
        try t.expect(try h.applyBatch(&session, &.{ border_cmd, command(&req) }));
        const revision = h.revision();
        for (req, expected) |r, value| try t.expectEqualDeep(value, try observe(&session, r));
        try t.expect(!try h.applyBatch(&session, &.{ border_cmd, command(&req) }));
        try t.expectEqual(revision, h.revision());
        var after = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
        defer after.deinit(a);
        for (before.cells, after.cells) |old, now| {
            var selected = false;
            for (req) |r| if (r.list_node == old.list_node) {
                selected = true;
            };
            if (!selected) try t.expectEqual(old.border_fill_id, now.border_fill_id);
        }
        const saved = try session.save();
        defer a.free(saved);
        try preservedResources(input, saved);
        const keep = req;
        req[0].table_node = std.math.maxInt(u32);
        req[1].fill = .none;
        try t.expect(try h.undo(&session));
        try t.expect(!try h.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try t.expectEqualSlices(u8, input, undone);
        try t.expect(try h.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try t.expectEqualSlices(u8, saved, redone);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (keep, expected) |r, value| try t.expectEqualDeep(value, try observe(&reopened, r));
        const resaved = try reopened.save();
        defer a.free(resaved);
        try t.expectEqualSlices(u8, saved, resaved);
    }
}

test "HX fill batch duplicate oversize late invalid owner scalar rollback and empty history" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const req = try requests(&session);
    var h = try hist.History.init(&session, 8, 8_000_000);
    defer h.deinit();
    const revision = h.revision();
    try t.expect(!try h.apply(&session, command(&.{})));
    try t.expectError(error.DuplicateCellFillTarget, h.apply(&session, command(&.{ req[1], req[1] })));
    const big = try a.alloc(Request, @import("model/cell_edit_budget.zig").max_cells + 1);
    defer a.free(big);
    @memset(big, req[1]);
    try t.expectError(error.LimitExceeded, session.setCellFills(big));
    var bad = [_]Request{ req[1], req[2] };
    bad[1].fill = .{ .solid = .{ .color = 0x1000000 } };
    try t.expectError(error.InvalidCharacterColor, h.apply(&session, command(&bad)));
    bad[1].fill = gradient;
    bad[1].fill.linear.angle = 360;
    try t.expectError(error.InvalidBackgroundGradient, h.apply(&session, command(&bad)));
    bad[1] = req[2];
    bad[1].table_node = std.math.maxInt(u32);
    try t.expectError(error.InvalidCellBackgroundOwner, h.apply(&session, command(&bad)));
    bad[1] = req[2];
    bad[1].section = session.sections.len;
    try t.expectError(error.InvalidSectionIndex, h.apply(&session, command(&bad)));
    const limit = session.options.max_output_bytes;
    session.options.max_output_bytes = 1;
    try t.expectError(error.LimitExceeded, h.apply(&session, command(&req)));
    session.options.max_output_bytes = limit;
    try t.expectEqual(revision, h.revision());
    try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
    const saved = try session.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, input, saved);
}

test "HX fill batch current pending hatch wins solid default and exact clear preserves border" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = (try requests(&session))[0];
    const original = try observe(&session, target);
    try t.expect(try session.setCellBorder(0, target.table_node, target.list_node, 1, .SOLID, 70, 0x765432));
    var fill = target;
    fill.fill = hatch;
    try t.expect(try session.setCellFills(&.{fill}));
    fill.fill = .{ .solid = .{ .color = 0xabcdef } };
    try t.expect(try session.setCellFills(&.{fill}));
    try t.expectEqualDeep(p.Background{ .solid = .{ .color = 0xabcdef, .hatch_color = hatch.hatch.hatch } }, try observe(&session, target));
    try t.expectEqual(@as(?u32, 0xabcdef), session.cell_backgrounds.items[0].color);
    fill.fill = .none;
    _ = try session.setCellFills(&.{fill});
    try t.expectEqualDeep(@as(p.Background, .none), try observe(&session, target));
    try t.expect(session.cell_backgrounds.items[0].border.edges[0] != null);
    fill.fill = original;
    _ = try session.setCellFills(&.{fill});
    try t.expectEqualDeep(original, try observe(&session, target));
    try t.expect(session.cell_backgrounds.items[0].background == null);
    try t.expect(session.cell_backgrounds.items[0].color == null);
    try t.expect(session.cell_backgrounds.items[0].border.edges[0] != null);
}

test "HX fill batch physical merged owner and protected second target refuse atomically" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var source = try editor.open(a, input, .{});
    defer source.deinit();
    const req = try requests(&source);
    const bindings = try @import("hwpx/table_display_bindings.zig").read(a, &source, 0);
    defer a.free(bindings);
    var paragraph: ?usize = null;
    for (bindings) |binding| if (binding.owner.list_node == req[1].list_node) {
        paragraph = binding.paragraph;
        break;
    };
    const ordinal = paragraph orelse return error.MissingTestCell;
    try t.expect(try source.splitParagraph(0, ordinal, 0, 0));
    try t.expect(try source.mergeParagraph(0, ordinal));
    try t.expect(try source.setCellFills(&req));
    try t.expectEqualDeep(hatch, try observe(&source, req[2]));
    const protected_owner = try cell.target(&source, 0, req[2].table_node, req[2].list_node);
    const xml = try xmlpatch.attribute(a, &source.sections[0].tree, protected_owner.cell_node, "protect", "true", source.options.max_xml_bytes);
    defer a.free(xml);
    const protected_bytes = try @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = source.sections[0].entry_index, .bytes = xml }}, .{});
    defer a.free(protected_bytes);
    var protected = try editor.open(a, protected_bytes, .{});
    defer protected.deinit();
    try t.expectError(error.ProtectedCell, protected.setCellFills(&.{ req[1], req[2] }));
    try t.expectEqual(@as(usize, 0), protected.cell_backgrounds.items.len);
    const saved = try protected.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, protected_bytes, saved);
}

const header_prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><h:refList><h:borderFills itemCnt='1'>";
const header_suffix = "</h:borderFills></h:refList></h:head>";
const original_template = "<h:borderFill id='3' opaque='keep'><h:leftBorder type='SOLID' width='0.12 mm' color='#123456'/></h:borderFill>";
const verified: @import("hwpx/source_color_profile.zig").Profile = .{ .verified = true };
test "HX fill batch writer all sixteen variant transitions dedup and old template byte preservation" {
    const a = t.allocator;
    var seed = try @import("hwpx/header_tree.zig").parse(a, header_prefix ++ original_template ++ header_suffix, 0, .{});
    defer seed.deinit(a);
    for (fills) |from| {
        const fragment = try xmlpatch.write(a, &seed, 3, .{ .background = from }, 16000, verified);
        defer a.free(fragment);
        const xml = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ header_prefix, fragment, header_suffix });
        defer a.free(xml);
        var original = try @import("hwpx/header_tree.zig").parse(a, xml, 0, .{});
        defer original.deinit(a);
        for (fills) |to| {
            const effective = p.merge(.{ .background = from }, .{ .background = to }).background.?;
            var stats: resource.SolidBatchStats = .{};
            const result = try resource.writePatchBatch(a, &original, &.{ .{ .source_id = 3, .patch = .{ .background = effective } }, .{ .source_id = 3, .patch = .{ .background = effective } } }, 16000, verified, &stats);
            defer a.free(result.bytes);
            defer a.free(result.ids);
            try t.expectEqual(@as(usize, 1), stats.resources);
            try t.expectEqual(@as(usize, 1), stats.fragments);
            try t.expectEqual(@as(usize, 1), stats.reused);
            try t.expectEqual(@as(usize, 1), stats.header_writes);
            try t.expectEqual(result.ids[0], result.ids[1]);
            var after = try @import("hwpx/header_tree.zig").parse(a, result.bytes, 0, .{});
            defer after.deinit(a);
            const value = try xmlpatch.observeSelected(a, &after, try resource.sourceNode(a, &after, result.ids[0]), verified, @splat(false), true);
            try t.expectEqualDeep(effective, value.background.?);
            try t.expectEqualSlices(u8, fragment, after.sourceOf(try resource.sourceNode(a, &after, 3)));
        }
    }
}

test "HX fill batch writer unknown opaque extension profile refusal and canonical key distinctions" {
    const a = t.allocator;
    const cases = [_]struct { brush: []const u8, expected: anyerror }{
        .{ .brush = "<c:fillBrush><c:imgBrush/></c:fillBrush>", .expected = error.UnsupportedCellBackgroundContents },
        .{ .brush = "<c:fillBrush custom='keep'><c:winBrush faceColor='#123456'/></c:fillBrush>", .expected = error.UnsupportedBackgroundExtension },
        .{ .brush = "<c:fillBrush><c:winBrush faceColor='#123456' unsupported='keep'/></c:fillBrush>", .expected = error.UnsupportedBackgroundExtension },
        .{ .brush = "<c:fillBrush><c:gradation type='RADIAL'/></c:fillBrush>", .expected = error.UnsupportedCellBackgroundContents },
    };
    for (cases) |case| {
        const xml = try std.fmt.allocPrint(a, "{s}<h:borderFill id='3'>{s}</h:borderFill>{s}", .{ header_prefix, case.brush, header_suffix });
        defer a.free(xml);
        var tree = try @import("hwpx/header_tree.zig").parse(a, xml, 0, .{});
        defer tree.deinit(a);
        var stats: resource.SolidBatchStats = .{};
        try t.expectError(case.expected, resource.writePatchBatch(a, &tree, &.{.{ .source_id = 3, .patch = .{ .background = hatch } }}, 16000, verified, &stats));
        try t.expectEqualSlices(u8, xml, tree.source);
        try t.expectError(error.UnsupportedCellBackgroundProfile, resource.writePatchBatch(a, &tree, &.{.{ .source_id = 3, .patch = .{ .background = .none } }}, 16000, .{}, &stats));
    }
    const absent = resource.patchKey(.{ .source_id = 3, .patch = .{} });
    const clear = resource.patchKey(.{ .source_id = 3, .patch = .{ .background = .none } });
    const black = resource.patchKey(.{ .source_id = 3, .patch = .{ .background = .{ .solid = .{ .color = 0 } } } });
    try t.expect(!std.meta.eql(absent, clear));
    try t.expect(!std.meta.eql(clear, black));
}

test "HX fill batch combined invalid fill after valid border rollback retains redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = v2;
        const req = try requests(&session);
        var h = if (v2) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
        defer h.deinit();
        try t.expect(try h.apply(&session, command(req[1..2])));
        try t.expect(try h.undo(&session));
        const revision = h.revision();
        const border_req = [_]@import("hwpx/hxcell_border_batch.zig").Request{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .edges = 15, .style = .SOLID, .width_hundredth_mm = 70, .color = 0x2468ac }};
        const border_cmd: hist.Command = .{ .kind = .cell_borders, .cell_borders = &border_req, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
        var bad = req[1];
        bad.fill = .{ .solid = .{ .color = 0x1000000 } };
        try t.expectError(error.InvalidCharacterColor, h.applyBatch(&session, &.{ border_cmd, command(&.{bad}) }));
        try t.expectEqual(revision, h.revision());
        try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
        const saved = try session.save();
        defer a.free(saved);
        try t.expectEqualSlices(u8, input, saved);
        try t.expect(try h.redo(&session));
        try t.expectEqual(@as(u32, 0x13579b), (try observe(&session, req[1])).solid.color);
    }
}

test "HX fill batch sampled OOM retains background revision redo and allocator balance" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |managed| {
        var measured = std.testing.FailingAllocator.init(a, .{});
        var baseline = try editor.open(measured.allocator(), input, .{});
        defer baseline.deinit();
        baseline.history_delta_managed = managed;
        const req = try requests(&baseline);
        try t.expect(try baseline.setCellBackground(req[0].section, req[0].table_node, req[0].list_node, 0x654321));
        var baseline_history = if (managed) try hist.History.initV2(&baseline, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&baseline, 8, 8_000_000);
        defer baseline_history.deinit();
        try t.expect(try baseline_history.apply(&baseline, command(req[0..1])));
        try t.expect(try baseline_history.undo(&baseline));
        const start = measured.alloc_index;
        try t.expect(try baseline_history.apply(&baseline, command(&req)));
        const count = measured.alloc_index - start;
        try t.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
            var failing = std.testing.FailingAllocator.init(a, .{});
            {
                var session = try editor.open(failing.allocator(), input, .{});
                defer session.deinit();
                session.history_delta_managed = managed;
                try t.expect(try session.setCellBackground(req[0].section, req[0].table_node, req[0].list_node, 0x654321));
                var h = if (managed) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
                defer h.deinit();
                try t.expect(try h.apply(&session, command(req[0..1])));
                try t.expect(try h.undo(&session));
                const revision = h.revision();
                const before = try session.save();
                defer failing.allocator().free(before);
                failing.fail_index = failing.alloc_index + offset;
                const result = h.apply(&session, command(&req));
                failing.fail_index = std.math.maxInt(usize);
                try t.expectError(error.OutOfMemory, result);
                try t.expect(failing.has_induced_failure);
                try t.expectEqual(revision, h.revision());
                const after = try session.save();
                defer failing.allocator().free(after);
                try t.expectEqualSlices(u8, before, after);
                try t.expectEqual(@as(?u32, 0x654321), session.cell_backgrounds.items[0].color);
                try t.expect(try h.redo(&session));
                try t.expect(try h.undo(&session));
                try t.expect(try h.apply(&session, command(&req)));
            }
            try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
        }
    }
}

test "HX fill batch source hatch fallback after pending none or linear matches saved foreground" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var seed = try editor.open(a, input, .{});
    defer seed.deinit();
    var r = (try requests(&seed))[1];
    r.fill = hatch;
    try t.expect(try seed.setCellFills(&.{r}));
    const source_hatch = try seed.save();
    defer a.free(source_hatch);
    for ([_]p.Background{ .none, gradient }) |intermediate| {
        var session = try editor.open(a, source_hatch, .{});
        defer session.deinit();
        r.fill = intermediate;
        try t.expect(try session.setCellFills(&.{r}));
        r.fill = .{ .solid = .{ .color = 0xabcdef } };
        try t.expect(try session.setCellFills(&.{r}));
        const expected: p.Background = .{ .solid = .{ .color = 0xabcdef, .hatch_color = hatch.hatch.hatch } };
        try t.expectEqualDeep(expected, try observe(&session, r));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try t.expectEqualDeep(expected, try observe(&reopened, r));
    }
}

test "HX fill batch physical rowspan colspan merged cell remains one original owner" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const bindings = try @import("hwpx/table_display_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    var selected: ?Request = null;
    for (bindings) |binding| {
        if ((binding.owner.cell.row_span orelse 0) <= 1 and (binding.owner.cell.column_span orelse 0) <= 1) continue;
        selected = .{ .section = 0, .table_node = @intCast(binding.owner.table_node), .list_node = @intCast(binding.owner.list_node), .fill = gradient };
        break;
    }
    const r = selected orelse return error.MissingMergedTestCell;
    try t.expect(try session.setCellFills(&.{r}));
    try t.expectEqual(@as(usize, 1), session.cell_backgrounds.items.len);
    try t.expectEqualDeep(gradient, try observe(&session, r));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try t.expectEqualDeep(gradient, try observe(&reopened, r));
}

fn styleCommand(values: []const editor.Session.CellStyleRequest) hist.Command {
    return .{ .kind = .cell_styles, .cell_styles = values, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn materialized(session: *const editor.Session, r: Request) !p.Value {
    const a = session.allocator;
    const plan = try @import("hwpx/table_cell_background_save.zig").currentHeader(session);
    defer a.free(plan.replacement.bytes);
    defer a.free(plan.ids);
    defer a.free(plan.offsets);
    defer a.free(plan.indices);
    var header = try @import("hwpx/header_tree.zig").parse(a, plan.replacement.bytes, 0, .{});
    defer header.deinit(a);
    var id = (try cell.target(session, r.section, r.table_node, r.list_node)).source_id;
    for (session.cell_backgrounds.items, 0..) |entry, i| {
        if (entry.section == r.section and entry.list_node == r.list_node) id = plan.ids[i];
    }
    return xmlpatch.observe(a, &header, try resource.sourceNode(a, &header, id), try cell.profile(session));
}

test "HX cell styles one command sparse color with mixed style width fill one undo lifetime noop reopen" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = v2;
        const cells = try requests(&session);
        try t.expect(try session.applyCellBorders(&.{
            .{ .section = 0, .table_node = cells[0].table_node, .list_node = cells[0].list_node, .edges = 15, .style = .SOLID, .width_hundredth_mm = 20, .color = 0x111111 },
            .{ .section = 0, .table_node = cells[1].table_node, .list_node = cells[1].list_node, .edges = 15, .style = .DOUBLE_SLIM, .width_hundredth_mm = 70, .color = 0x222222 },
        }));
        const baseline = try session.save();
        defer a.free(baseline);
        const before = [_]p.Value{ try materialized(&session, cells[0]), try materialized(&session, cells[1]) };
        var req = [_]editor.Session.CellStyleRequest{
            .{ .section = 0, .table_node = cells[0].table_node, .list_node = cells[0].list_node, .patch = .{ .border = .{ .edges = .{ .{ .color = 0xabcdef }, null, .{ .color = 0xabcdef }, null } }, .background = hatch } },
            .{ .section = 0, .table_node = cells[1].table_node, .list_node = cells[1].list_node, .patch = .{ .border = .{ .edges = .{ null, .{ .color = 0x654321 }, null, .{ .color = 0x654321 } } }, .background = gradient } },
        };
        var h = if (v2) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
        defer h.deinit();
        try t.expect(try h.apply(&session, styleCommand(&req)));
        const revision = h.revision();
        for (req, before, cells[0..2]) |r, old, c| {
            const now = try materialized(&session, c);
            for (r.patch.border.edges, old.edges, now.edges) |patch, previous, current| {
                try t.expectEqual(previous.style, current.style);
                try t.expectEqual(previous.width_hundredth_mm, current.width_hundredth_mm);
                try t.expectEqual(if (patch) |edge| edge.color else previous.color, current.color);
            }
            try t.expectEqualDeep(r.patch.background.?, now.background.?);
        }
        try t.expect(!try h.apply(&session, styleCommand(&req)));
        try t.expectEqual(revision, h.revision());
        const saved = try session.save();
        defer a.free(saved);
        try preservedResources(input, saved);
        req[0].table_node = std.math.maxInt(u32);
        req[1].patch.background = .none;
        try t.expect(try h.undo(&session));
        try t.expect(!try h.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try t.expectEqualSlices(u8, baseline, undone);
        try t.expect(try h.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try t.expectEqualSlices(u8, saved, redone);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (cells[0..2]) |c| try t.expectEqualDeep(try materialized(&session, c), try materialized(&reopened, c));
    }
}

test "HX cell styles invalid trailing owner fill and malformed command rollback preserve redo" {
    const a = t.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(t.io, fixture, a, .limited(4_000_000));
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = v2;
        const cells = try requests(&session);
        var req = [_]editor.Session.CellStyleRequest{
            .{ .section = 0, .table_node = cells[0].table_node, .list_node = cells[0].list_node, .patch = .{ .border = .{ .edges = .{ .{ .color = 0xabcdef }, null, null, null } }, .background = hatch } },
            .{ .section = 0, .table_node = cells[1].table_node, .list_node = cells[1].list_node, .patch = .{ .background = gradient } },
        };
        var h = if (v2) try hist.History.initV2(&session, .{ .max_entries = 8, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else try hist.History.init(&session, 8, 8_000_000);
        defer h.deinit();
        try t.expect(try h.apply(&session, styleCommand(req[0..1])));
        try t.expect(try h.undo(&session));
        const revision = h.revision();
        req[1].table_node = std.math.maxInt(u32);
        try t.expectError(error.InvalidCellBackgroundOwner, h.apply(&session, styleCommand(&req)));
        req[1].table_node = cells[1].table_node;
        req[1].patch.background.?.linear.angle = 360;
        try t.expectError(error.InvalidBackgroundGradient, h.apply(&session, styleCommand(&req)));
        req[1].patch.background = gradient;
        var malformed = styleCommand(&req);
        malformed.inserted = "x";
        try t.expectError(error.InvalidCellStyleCommand, h.apply(&session, malformed));
        try t.expect(!try h.apply(&session, styleCommand(&.{})));
        try t.expectEqual(revision, h.revision());
        try t.expectEqual(@as(usize, 0), session.cell_backgrounds.items.len);
        const saved = try session.save();
        defer a.free(saved);
        try t.expectEqualSlices(u8, input, saved);
        try t.expect(try h.redo(&session));
        try t.expectEqualDeep(hatch, try observe(&session, cells[0]));
    }
}
