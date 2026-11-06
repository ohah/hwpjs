//! Basic diagonal source probes. Native execution requires the coordinator slot.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const p = @import("model/border_fill_patch.zig");
const xml = @import("hwpx/border_fill_xml_patch.zig");
const header = @import("hwpx/header_tree.zig");
const resource = @import("hwpx/border_fill_resource_patch.zig");
const editor = @import("hwpx/editor_session.zig");
const history = @import("hwpx/editor_history.zig");
const cell = @import("hwpx/table_cell_background_session.zig");
const Request = @import("hwpx/hxcell_style_batch.zig").Request;
const head = @import("hwpx/document_xml.zig").head_uri;
const profile: @import("hwpx/source_color_profile.zig").Profile = .{ .id = "test-rgb", .encoding = .rgb24, .verified = true };
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills itemCnt='1'>";
const suffix = "</h:borderFills></h:refList></h:head>";
const basic = "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE' Crooked='0' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/><h:diagonal type='SOLID' width='0.1 mm' color='#000000'/></h:borderFill>";
const directions = [_]p.DiagonalDirections{ .none, .rising, .falling, .cross };
const all_diagonal: p.DiagonalPatch = .{ .directions = .none, .stroke = .{ .style = .SOLID, .width_hundredth_mm = 10, .color = 0 } };
const fixture_path = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx";
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(t.io, fixture_path, a, .limited(4_000_000));
}
fn wrapped(allocator: std.mem.Allocator, fragment: []const u8) ![]u8 {
    return std.fmt.allocPrint(allocator, "{s}{s}{s}", .{ prefix, fragment, suffix });
}
fn readDiagonal(tree: *const header.Tree, node: usize) !p.DiagonalValue {
    return (try xml.observeSelectedWithDiagonal(a, tree, node, profile, @splat(false), false, all_diagonal)).diagonal;
}
fn changed(allocator: std.mem.Allocator, tree: *const header.Tree, patch: p.DiagonalPatch) ![]u8 {
    return xml.write(allocator, tree, 3, .{ .diagonal = patch }, 64_000, profile);
}
fn equalSaved(session: *editor.Session, expected: []const u8) !void {
    const bytes = try session.save();
    defer session.allocator.free(bytes);
    try t.expectEqualSlices(u8, expected, bytes);
}
fn requests(session: *const editor.Session, source_id: u32) ![2]Request {
    const bindings = try @import("hwpx/table_display_bindings.zig").read(session.allocator, session, 0);
    defer session.allocator.free(bindings);
    var result: [2]Request = undefined;
    var count: usize = 0;
    for (bindings) |binding| {
        const raw = (try session.sections[0].tree.attributeValue(session.allocator, binding.owner.cell_node, "", "borderFillIDRef")) orelse return error.MissingBorderFillReference;
        if (try @import("hwpx/table_xml_fields.zig").unsigned(session.allocator, raw, 4096) != source_id) continue;
        var duplicate = false;
        for (result[0..count]) |known| if (known.list_node == binding.owner.list_node) {
            duplicate = true;
        };
        if (duplicate) continue;
        result[count] = .{ .section = 0, .table_node = @intCast(binding.owner.table_node), .list_node = @intCast(binding.owner.list_node), .patch = .{ .diagonal = .{ .directions = .rising, .stroke = .{ .color = 0x123456 } } } };
        count += 1;
        if (count == result.len) return result;
    }
    return error.MissingSharedTestCells;
}
fn command(rows: []const Request) history.Command {
    return .{ .kind = .cell_styles, .cell_styles = rows, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
}
fn initHistory(session: *editor.Session, v2: bool) !history.History {
    session.history_delta_managed = v2;
    return if (v2) history.History.initV2(session, .{ .max_entries = 32, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 32_000_000 }) else history.History.init(session, 32, 8_000_000);
}
fn currentDiagonal(session: *const editor.Session, request: Request) !p.DiagonalValue {
    var document = try @import("hwpx/package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const owner = try cell.target(session, request.section, request.table_node, request.list_node);
    const node = try resource.sourceNode(a, &tree, owner.source_id);
    var source = (try xml.observeSelectedWithDiagonal(a, &tree, node, try cell.profile(session), @splat(false), false, all_diagonal)).diagonal;
    for (session.cell_backgrounds.items) |entry| {
        if (entry.section == request.section and entry.list_node == request.list_node) {
            if (entry.diagonal) |patch| {
                if (patch.directions) |value| source.directions = value;
                inline for (.{ "style", "width_hundredth_mm", "color" }) |name| if (@field(patch.stroke, name)) |value| {
                    @field(source.stroke, name) = value;
                };
            }
        }
    }
    return source;
}

fn preservedOriginalResources(before: []const u8, after: []const u8) !void {
    var old = try @import("hwpx/package.zig").inspectDocument(a, before, .{});
    defer old.deinit(a);
    var current = try @import("hwpx/package.zig").inspectDocument(a, after, .{});
    defer current.deinit(a);
    var old_tree = try old.readHeaderTree(a, .{});
    defer old_tree.deinit(a);
    var current_tree = try current.readHeaderTree(a, .{});
    defer current_tree.deinit(a);
    for (old_tree.elements, 0..) |element, node| {
        if (element.is(head, "borderFill")) {
            const id = try resource.id(a, &old_tree, node);
            try t.expectEqualStrings(old_tree.sourceOf(node), current_tree.sourceOf(try resource.sourceNode(a, &current_tree, id)));
        }
        if (element.is(head, "fontfaces")) {
            var found: usize = 0;
            for (current_tree.elements, 0..) |other, other_node| if (other.is(head, "fontfaces")) {
                found += 1;
                try t.expectEqualStrings(old_tree.sourceOf(node), current_tree.sourceOf(other_node));
            };
            try t.expectEqual(@as(usize, 1), found);
        }
    }
}

test "HX basic diagonal four directions sixteen XML transitions and legacy observer isolation" {
    var base = try header.parse(a, prefix ++ basic ++ suffix, 0, .{});
    defer base.deinit(a);
    for (directions) |before| {
        const first = try changed(a, &base, .{ .directions = before });
        defer a.free(first);
        const input = try wrapped(a, first);
        defer a.free(input);
        var tree = try header.parse(a, input, 0, .{});
        defer tree.deinit(a);
        for (directions) |after| {
            const fragment = try changed(a, &tree, .{ .directions = after });
            defer a.free(fragment);
            const complete = try wrapped(a, fragment);
            defer a.free(complete);
            var next = try header.parse(a, complete, 0, .{});
            defer next.deinit(a);
            const observed = try readDiagonal(&next, 3);
            try t.expectEqual(after, observed.directions.?);
            try t.expectEqualDeep(p.EdgeValue{ .style = .SOLID, .width_hundredth_mm = 10, .color = 0 }, observed.stroke);
            const slash = (try xml.direct(&next, 3, head, "slash")).?;
            const back = (try xml.direct(&next, 3, head, "backSlash")).?;
            const slash_text = try (try next.attributeValue(a, slash, "", "type")).?.toUtf8(a, 16);
            defer a.free(slash_text);
            const back_text = try (try next.attributeValue(a, back, "", "type")).?.toUtf8(a, 16);
            defer a.free(back_text);
            try t.expectEqualStrings(if (after == .rising or after == .cross) "CENTER" else "NONE", slash_text);
            try t.expectEqualStrings(if (after == .falling or after == .cross) "CENTER" else "NONE", back_text);
        }
    }
    const old = try xml.observeSelected(a, &base, 3, profile, @splat(false), false);
    try t.expectEqualDeep(p.DiagonalValue{}, old.diagonal);
}

test "HX basic diagonal color only preserves unknown geometry namespaces and sparse style width" {
    const raw = "<h:borderFill id='3' centerLine='FUTURE' xmlns:x='urn:kept' x:keep='1'><h:slash type='ALL' Crooked='2' isCounter='1'/><h:backSlash type='UNKNOWN'/><h:diagonal type='FUTURE' width='odd' color='#123456' x:opaque='yes'/></h:borderFill>";
    var tree = try header.parse(a, prefix ++ raw ++ suffix, 0, .{});
    defer tree.deinit(a);
    const out = try changed(a, &tree, .{ .stroke = .{ .color = 0 } });
    defer a.free(out);
    const split = std.mem.indexOf(u8, raw, "#123456").?;
    const expected = try std.fmt.allocPrint(a, "{s}#000000{s}", .{ raw[0..split], raw[split + 7 ..] });
    defer a.free(expected);
    try t.expectEqualStrings(expected, out);
    const observed = try xml.observeSelectedWithDiagonal(a, &tree, 3, profile, @splat(false), false, .{ .stroke = .{ .color = 0 } });
    try t.expect(observed.diagonal.directions == null);
    try t.expect(observed.diagonal.stroke.style == null and observed.diagonal.stroke.width_hundredth_mm == null);
    try t.expectEqual(@as(?u32, 0x123456), observed.diagonal.stroke.color);
}

test "HX basic diagonal geometry rejects complex and absent guards without defaults" {
    const variants = [_][]const u8{
        "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE' Crooked='1' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
        "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE' Crooked='0' isCounter='1'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
        "<h:borderFill id='3' centerLine='VERTICAL'><h:slash type='NONE' Crooked='0' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
        "<h:borderFill id='3' centerLine='NONE'><h:slash type='ALL' Crooked='0' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
        "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
        "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>",
    };
    for (variants) |fragment| {
        const input = try wrapped(a, fragment);
        defer a.free(input);
        var tree = try header.parse(a, input, 0, .{});
        defer tree.deinit(a);
        try t.expectError(error.UnsupportedCellDiagonalGeometry, changed(a, &tree, .{ .directions = .none }));
        try t.expect((try readDiagonal(&tree, 3)).directions == null);
    }
}

test "HX basic diagonal missing stroke requires three explicit scalars but not fabricated geometry" {
    const raw = "<h:borderFill id='3' centerLine='NONE'><h:slash type='NONE' Crooked='0' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>";
    var tree = try header.parse(a, prefix ++ raw ++ suffix, 0, .{});
    defer tree.deinit(a);
    for ([_]p.Edge{ .{ .color = 0 }, .{ .style = .NONE, .color = 0 }, .{ .style = .SOLID, .width_hundredth_mm = 10 } }) |stroke| try t.expectError(error.IncompleteCellDiagonalStroke, changed(a, &tree, .{ .stroke = stroke }));
    try t.expectError(error.IncompleteCellDiagonalStroke, changed(a, &tree, .{ .directions = .rising }));
    const result = try changed(a, &tree, .{ .stroke = .{ .style = .NONE, .width_hundredth_mm = 70, .color = 0 } });
    defer a.free(result);
    const input = try wrapped(a, result);
    defer a.free(input);
    var parsed = try header.parse(a, input, 0, .{});
    defer parsed.deinit(a);
    const value = try readDiagonal(&parsed, 3);
    try t.expectEqualDeep(p.EdgeValue{ .style = .NONE, .width_hundredth_mm = 70, .color = 0 }, value.stroke);
    try t.expectEqual(p.DiagonalDirections.none, value.directions.?);
}

test "HX basic diagonal canonical resource keys distinguish every scalar presence and directions" {
    const patches = [_]p.Patch{
        .{},                                                 .{ .diagonal = .{ .directions = .none } },                     .{ .diagonal = .{ .directions = .rising } },     .{ .diagonal = .{ .directions = .falling } }, .{ .diagonal = .{ .directions = .cross } },
        .{ .diagonal = .{ .stroke = .{ .style = .NONE } } }, .{ .diagonal = .{ .stroke = .{ .width_hundredth_mm = 10 } } }, .{ .diagonal = .{ .stroke = .{ .color = 0 } } },
    };
    for (patches, 0..) |left, i| for (patches[i + 1 ..]) |right| {
        try t.expect(!std.meta.eql(resource.patchKey(.{ .source_id = 3, .patch = left }), resource.patchKey(.{ .source_id = 3, .patch = right })));
    };
}

test "HX basic diagonal original shared owners dedup and different direction cache keys do not alias" {
    const input = try fixture();
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var req = try requests(&session, 3);
    try t.expect(try session.setCellStyles(&req));
    var same = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
    defer same.deinit(a);
    var refs: [2]u32 = undefined;
    for (req, &refs) |r, *ref| for (same.cells) |entry| {
        if (entry.list_node == r.list_node) ref.* = entry.border_fill_id.?;
    };
    try t.expectEqual(refs[0], refs[1]);
    req[1].patch.diagonal.?.directions = .falling;
    try t.expect(try session.setCellStyles(&req));
    var different = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
    defer different.deinit(a);
    for (req, &refs) |r, *ref| for (different.cells) |entry| {
        if (entry.list_node == r.list_node) ref.* = entry.border_fill_id.?;
    };
    try t.expect(refs[0] != refs[1]);
    for (req) |r| {
        const observed = try currentDiagonal(&session, r);
        try t.expectEqual(r.patch.diagonal.?.directions.?, observed.directions.?);
    }
}

test "HX basic diagonal combined border fill and two diagonal owners is one V1 V2 history event save reopen" {
    const input = try fixture();
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        var req = try requests(&session, 3);
        req[0].patch.border.edges[0] = .{ .color = 0 };
        req[0].patch.background = .{ .hatch = .{ .face = 0x123456, .hatch = 0xabcdef, .style = .SLASH } };
        req[1].patch.diagonal.?.directions = .cross;
        var h = try initHistory(&session, v2);
        defer h.deinit();
        try t.expect(try h.apply(&session, command(&req)));
        const saved = try session.save();
        defer a.free(saved);
        try preservedOriginalResources(input, saved);
        try t.expectEqual(@as(usize, 2), h.revisionCount());
        const revision = h.revision();
        try t.expect(!try h.apply(&session, command(&req)));
        try t.expectEqual(revision, h.revision());
        var report = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
        defer report.deinit(a);
        for (req) |r| {
            for (report.cells) |entry| if (entry.list_node == r.list_node) {
                const style = report.styles[entry.style_index.?];
                try t.expectEqualStrings("CENTER", style.slash.?);
                try t.expectEqualStrings(if (r.patch.diagonal.?.directions == .cross) "CENTER" else "NONE", style.back_slash.?);
            };
        }
        try t.expect(try h.undo(&session));
        try equalSaved(&session, input);
        try t.expect(!try h.undo(&session));
        try t.expect(try h.redo(&session));
        try equalSaved(&session, saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (req) |r| try t.expectEqual(r.patch.diagonal.?.directions.?, (try currentDiagonal(&reopened, r)).directions.?);
        try equalSaved(&reopened, saved);
    }
}

test "HX basic diagonal returning source geometry preserves pending stroke and known noop retains redo" {
    const input = try fixture();
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var req = try requests(&session, 3);
    var h = try initHistory(&session, false);
    defer h.deinit();
    try t.expect(try h.apply(&session, command(req[0..1])));
    req[0].patch = .{ .diagonal = .{ .directions = .none } };
    try t.expect(try h.apply(&session, command(req[0..1])));
    const value = try currentDiagonal(&session, req[0]);
    try t.expectEqual(p.DiagonalDirections.none, value.directions.?);
    try t.expectEqual(@as(?u32, 0x123456), value.stroke.color);
    try t.expect(try h.undo(&session));
    const rev = h.revision();
    req[0].patch = .{ .diagonal = .{ .directions = .rising, .stroke = .{ .color = 0x123456 } } };
    try t.expect(!try h.apply(&session, command(req[0..1])));
    try t.expectEqual(rev, h.revision());
    var bad = req[0];
    bad.table_node = std.math.maxInt(u32);
    const before = try session.save();
    defer a.free(before);
    try t.expectError(error.InvalidCellBackgroundOwner, h.apply(&session, command(&.{bad})));
    try t.expectEqual(rev, h.revision());
    try equalSaved(&session, before);
    try t.expect(try h.redo(&session));
    try t.expectEqual(@as(?u32, 0x123456), (try currentDiagonal(&session, req[0])).stroke.color);
}

test "HX basic diagonal invalid duplicate oversized and protected trailing targets rollback without partial styles" {
    const input = try fixture();
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const req = try requests(&session, 3);
    var bad = req;
    bad[1].table_node = std.math.maxInt(u32);
    try t.expectError(error.InvalidCellBackgroundOwner, session.setCellStyles(&bad));
    try t.expectError(error.DuplicateCellStyleTarget, session.setCellStyles(&.{ req[0], req[0] }));
    const many = try a.alloc(Request, 4097);
    defer a.free(many);
    @memset(many, req[0]);
    try t.expectError(error.LimitExceeded, session.setCellStyles(many));
    try equalSaved(&session, input);
    const owner = try cell.target(&session, 0, req[1].table_node, req[1].list_node);
    const section = try xml.attribute(a, &session.sections[0].tree, owner.cell_node, "protect", "true", session.options.max_xml_bytes);
    defer a.free(section);
    const derived = try @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = session.sections[0].entry_index, .bytes = section }}, .{});
    defer a.free(derived);
    var protected = try editor.open(a, derived, .{});
    defer protected.deinit();
    try t.expectError(error.ProtectedCell, protected.setCellStyles(&req));
    try equalSaved(&protected, derived);
}

test "HX basic diagonal legacy solid after pending hatch preserves effective foreground with diagonal intent" {
    const input = try fixture();
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const target = try cell.target(&session, 0, 59, 66);
    const original = (try cell.observeFill(&session, 0, target.table_node, target.list_node)).background.solid;
    var row: Request = .{ .section = 0, .table_node = @intCast(target.table_node), .list_node = @intCast(target.list_node), .patch = .{ .background = .{ .hatch = .{ .face = 0x123456, .hatch = 0xabcdef, .style = .CROSS } }, .diagonal = .{ .directions = .cross } } };
    try t.expect(try session.setCellStyles(&.{row}));
    row.patch = .{ .background = .{ .solid = .{ .color = original.color } } };
    try t.expect(try session.setCellStyles(&.{row}));
    const current = (try cell.observeFill(&session, 0, target.table_node, target.list_node)).background.solid;
    try t.expectEqual(original.color, current.color);
    try t.expectEqual(@as(?u32, 0xabcdef), current.hatch_color);
    try t.expectEqual(p.DiagonalDirections.cross, (try currentDiagonal(&session, row)).directions.?);
}

fn allocationXml(allocator: std.mem.Allocator, tree: *const header.Tree) !void {
    const selected: p.DiagonalPatch = .{ .directions = .cross, .stroke = .{ .style = .DOUBLE_SLIM, .width_hundredth_mm = 50, .color = 0 } };
    const observed = try xml.observeSelectedWithDiagonal(allocator, tree, 3, profile, @splat(false), false, selected);
    try t.expectEqual(p.DiagonalDirections.none, observed.diagonal.directions.?);
    const result = try changed(allocator, tree, selected);
    defer allocator.free(result);
}
test "HX basic diagonal every selected XML observer and writer allocation failure is owned" {
    var tree = try header.parse(a, prefix ++ basic ++ suffix, 0, .{});
    defer tree.deinit(a);
    try t.checkAllAllocationFailures(a, allocationXml, .{&tree});
}

test "HX basic diagonal sampled planner OOM keeps revision saved bytes redo and allocator balance" {
    const input = try fixture();
    defer a.free(input);
    for ([_]bool{ false, true }) |v2| {
        var measured = t.FailingAllocator.init(a, .{});
        var baseline = try editor.open(measured.allocator(), input, .{});
        defer baseline.deinit();
        const req = try requests(&baseline, 3);
        var h = try initHistory(&baseline, v2);
        defer h.deinit();
        try t.expect(try h.apply(&baseline, command(req[0..1])));
        try t.expect(try h.undo(&baseline));
        const warm = try baseline.save();
        measured.allocator().free(warm);
        const start = measured.alloc_index;
        try t.expect(try h.apply(&baseline, command(&req)));
        const count = measured.alloc_index - start;
        try t.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
            var failing = t.FailingAllocator.init(a, .{});
            {
                var session = try editor.open(failing.allocator(), input, .{});
                defer session.deinit();
                const local = try requests(&session, 3);
                var hist = try initHistory(&session, v2);
                defer hist.deinit();
                try t.expect(try hist.apply(&session, command(local[0..1])));
                try t.expect(try hist.undo(&session));
                const before = try session.save();
                defer failing.allocator().free(before);
                const revision = hist.revision();
                failing.fail_index = failing.alloc_index + offset;
                const result = hist.apply(&session, command(&local));
                failing.fail_index = std.math.maxInt(usize);
                try t.expectError(error.OutOfMemory, result);
                try t.expectEqual(revision, hist.revision());
                try equalSaved(&session, before);
                try t.expect(try hist.redo(&session));
            }
            try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
        }
    }
}

test "HX basic diagonal missing original stroke full pending creation accepts later partial scalar" {
    const input = try fixture();
    defer a.free(input);
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    const source = try resource.sourceNode(a, &tree, 3);
    const stroke = (try xml.direct(&tree, source, head, "diagonal")).?;
    const removed = try @import("hwpx/xml_source_writer.zig").write(a, tree.source, &.{.{ .start = tree.elements[stroke].start_tag.start, .end = tree.elements[stroke].end, .text = "", .serialized_xml = "" }}, 4_000_000);
    defer a.free(removed);
    const entry_index = document.manifest.items[tree.item_index].entry_index.?;
    const derived = try @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry_index, .bytes = removed }}, .{});
    defer a.free(derived);
    var session = try editor.open(a, derived, .{});
    defer session.deinit();
    var req = try requests(&session, 3);
    try t.expectError(error.IncompleteCellDiagonalStroke, session.setCellStyles(req[0..1]));
    try equalSaved(&session, derived);
    req[0].patch.diagonal = .{ .directions = .rising, .stroke = .{ .style = .SOLID, .width_hundredth_mm = 70, .color = 0x123456 } };
    try t.expect(try session.setCellStyles(req[0..1]));
    req[0].patch.diagonal = .{ .stroke = .{ .color = 0 } };
    try t.expect(try session.setCellStyles(req[0..1]));
    const current = try currentDiagonal(&session, req[0]);
    try t.expectEqual(p.DiagonalDirections.rising, current.directions.?);
    try t.expectEqualDeep(p.EdgeValue{ .style = .SOLID, .width_hundredth_mm = 70, .color = 0 }, current.stroke);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try t.expectEqualDeep(current, try currentDiagonal(&reopened, req[0]));
}

test "HX basic diagonal clearing active known geometry preserves missing stroke and undo restores absence" {
    const raw = "<h:borderFill xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' id='3' centerLine='NONE'><h:slash type='CENTER' Crooked='0' isCounter='0'/><h:backSlash type='NONE' Crooked='0' isCounter='0'/></h:borderFill>";
    var tree = try header.parse(a, prefix ++ raw ++ suffix, 0, .{});
    defer tree.deinit(a);
    const cleared = try changed(a, &tree, .{ .directions = .none });
    defer a.free(cleared);
    const cleared_xml = try wrapped(a, cleared);
    defer a.free(cleared_xml);
    var parsed = try header.parse(a, cleared_xml, 0, .{});
    defer parsed.deinit(a);
    try t.expect(try xml.direct(&parsed, 3, head, "diagonal") == null);
    try t.expectEqual(p.DiagonalDirections.none, (try readDiagonal(&parsed, 3)).directions.?);
    try t.expectError(error.IncompleteCellDiagonalStroke, changed(a, &tree, .{ .directions = .none, .stroke = .{ .color = 0 } }));

    const input = try fixture();
    defer a.free(input);
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var original = try document.readHeaderTree(a, .{});
    defer original.deinit(a);
    const node = try resource.sourceNode(a, &original, 3);
    const replacement = try @import("hwpx/xml_source_writer.zig").write(a, original.source, &.{.{ .start = original.elements[node].start_tag.start, .end = original.elements[node].end, .text = "", .serialized_xml = raw }}, 4_000_000);
    defer a.free(replacement);
    const entry_index = document.manifest.items[original.item_index].entry_index.?;
    const derived = try @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = entry_index, .bytes = replacement }}, .{});
    defer a.free(derived);
    var session = try editor.open(a, derived, .{});
    defer session.deinit();
    var req = try requests(&session, 3);
    req[0].patch = .{ .diagonal = .{ .directions = .none } };
    var h = try initHistory(&session, false);
    defer h.deinit();
    try t.expect(try h.apply(&session, command(req[0..1])));
    var report = try @import("hwpx/table_border_sources.zig").read(a, &session, 0);
    defer report.deinit(a);
    for (report.cells) |entry| if (entry.list_node == req[0].list_node) {
        const style = report.styles[entry.style_index.?];
        try t.expect(style.diagonal == null);
        try t.expectEqualStrings("NONE", style.slash.?);
        try t.expectEqualStrings("NONE", style.back_slash.?);
    };
    const saved = try session.save();
    defer a.free(saved);
    try t.expect(try h.undo(&session));
    try equalSaved(&session, derived);
    try t.expectEqual(p.DiagonalDirections.rising, (try currentDiagonal(&session, req[0])).directions.?);
    try t.expect(try h.redo(&session));
    try equalSaved(&session, saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const value = try currentDiagonal(&reopened, req[0]);
    try t.expectEqual(p.DiagonalDirections.none, value.directions.?);
    try t.expectEqualDeep(p.EdgeValue{}, value.stroke);
}
