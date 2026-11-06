//! Source-prepared basic diagonal probes. Main grants Native execution separately.
//! Exact original Noori HWP5 only; derived inputs remain owned in memory.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const p = @import("model/border_fill_patch.zig");
const codec = @import("model/table_diagonal_values.zig");
const payloads = @import("hwp5/edit/border_fill_payload_patch.zig");
const values = @import("hwp5/edit/cell_background_values.zig");
const writer = @import("hwp5/edit/cell_background_write.zig");
const editor = @import("hwp5/edit/style_preservation.zig");
const History = @import("hwp5/edit/editor_history.zig").History;
const Request = @import("hwp5/edit/h5cell_style_batch.zig").Request;
const Source = @import("hwp5/text_source.zig").Source;
const records = @import("hwp5/record.zig");
const resources = @import("hwp5/edit/border_fill_docinfo_patch.zig");
const directions = [_]p.DiagonalDirections{ .none, .rising, .falling, .cross };
const Raw = struct { bytes: [44]u8, len: usize };
fn raw(attributes: u16, kind: u8, width: u8, color: u32, opaque_fill: bool) Raw {
    var out: Raw = .{ .bytes = @splat(0), .len = if (opaque_fill) 44 else 36 };
    std.mem.writeInt(u16, out.bytes[0..2], attributes, .little);
    for (0..4) |i| {
        out.bytes[2 + i * 6] = 1;
        out.bytes[3 + i * 6] = @intCast(i);
        std.mem.writeInt(u32, out.bytes[4 + i * 6 ..][0..4], @as(u32, @intCast(i)) + 0x010203, .little);
    }
    out.bytes[26] = kind;
    out.bytes[27] = width;
    std.mem.writeInt(u32, out.bytes[28..32], color, .little);
    if (opaque_fill) {
        std.mem.writeInt(u32, out.bytes[32..36], 0x80000000, .little);
        @memcpy(out.bytes[36..44], &[_]u8{ 0xa5, 0x5a, 0xff, 0, 0x10, 0x20, 0x30, 0x40 });
    }
    return out;
}
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(t.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8_000_000));
}
fn requests() [2]Request {
    return .{
        .{ .section = 0, .table_node = 20, .list_node = 21, .patch = .{ .diagonal = .{ .directions = .rising, .stroke = .{ .style = .SOLID, .width_hundredth_mm = 70, .color = 0x123456 } } } },
        .{ .section = 0, .table_node = 20, .list_node = 36, .patch = .{ .diagonal = .{ .directions = .cross, .stroke = .{ .style = .NONE, .width_hundredth_mm = 10, .color = 0 } } } },
    };
}
fn saved(session: *const editor.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn expectBytes(session: *const editor.Session, expected: []const u8) !void {
    const bytes = try saved(session);
    defer a.free(bytes);
    try t.expectEqualSlices(u8, expected, bytes);
}
fn currentId(session: *const editor.Session, request: Request) !u16 {
    const rows = try session.cellLayoutSources(a, request.section);
    defer a.free(rows);
    for (rows) |row| if (row.table_record_node == request.table_node and row.list_node == request.list_node) return row.border_fill_id;
    return error.MissingTestCell;
}
fn current(session: *const editor.Session, request: Request) !p.Value {
    const id = try currentId(session, request);
    var info = try session.formattingSource(a);
    defer info.deinit();
    return payloads.observe(try resources.resource(info.bytes, id));
}
fn historyFor(allocator: std.mem.Allocator, session: *editor.Session, mode: u8) !History {
    if (mode == 2) session.enableHistoryDelta();
    return if (mode == 0) History.init(allocator, session, 16, 8_000_000) else History.initV2(allocator, session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 64_000_000 });
}
fn deriveCell(original: []const u8, request: Request, source_id: ?u16, protect: bool) ![]u8 {
    var source = try Source.open(a, original);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    const changed = try a.dupe(u8, decoded);
    defer a.free(changed);
    var it = records.Iterator.init(decoded, .{});
    var node: u32 = 0;
    var found = false;
    while (try it.next()) |record| : (node += 1) if (node == request.list_node) {
        try t.expectEqual(@as(u10, 72), record.tag);
        const at = record.offset + record.raw.len - record.payload.len;
        if (source_id) |id| std.mem.writeInt(u16, changed[at + 32 ..][0..2], id, .little);
        if (protect) {
            const old = std.mem.readInt(u32, changed[at + 4 ..][0..4], .little);
            std.mem.writeInt(u32, changed[at + 4 ..][0..4], old | (1 << 17), .little);
        }
        found = true;
    };
    try t.expect(found);
    const encoded = if (source.header.has(.compressed)) try @import("compression/raw_deflate.zig").encodeStored(a, changed, 32_000_000) else try a.dupe(u8, changed);
    defer a.free(encoded);
    return @import("cfb/stream_replace.zig").rebuildManyExact(a, &source.file, &.{.{ .path = "/BodyText/Section0", .content = encoded }}, .{ .max_output_bytes = 8_000_000 });
}
fn deriveAttributes(original: []const u8, id: u16, attributes: u16) ![]u8 {
    var source = try Source.open(a, original);
    defer source.deinit();
    const decoded = try source.decodeDocInfo(a, 32_000_000);
    defer a.free(decoded);
    const changed = try a.dupe(u8, decoded);
    defer a.free(changed);
    var it = records.Iterator.init(decoded, .{});
    var index: u16 = 0;
    var found = false;
    while (try it.next()) |record| if (record.tag == 20) {
        index += 1;
        if (index == id) {
            const at = record.offset + record.raw.len - record.payload.len;
            std.mem.writeInt(u16, changed[at..][0..2], attributes, .little);
            found = true;
        }
    };
    try t.expect(found);
    const encoded = if (source.header.has(.compressed)) try @import("compression/raw_deflate.zig").encodeStored(a, changed, 32_000_000) else try a.dupe(u8, changed);
    defer a.free(encoded);
    return @import("cfb/stream_replace.zig").rebuildManyExact(a, &source.file, &.{.{ .path = "/DocInfo", .content = encoded }}, .{ .max_output_bytes = 8_000_000 });
}
fn expectOldResources(original: []const u8, output: []const u8) !void {
    var old = try Source.open(a, original);
    defer old.deinit();
    var next = try Source.open(a, output);
    defer next.deinit();
    const before = try old.decodeDocInfo(a, 32_000_000);
    defer a.free(before);
    const after = try next.decodeDocInfo(a, 32_000_000);
    defer a.free(after);
    var it = records.Iterator.init(before, .{});
    var id: u16 = 0;
    while (try it.next()) |record| if (record.tag == 20) {
        id += 1;
        try t.expectEqualSlices(u8, record.payload, try resources.resource(after, id));
    };
    for (old.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        const path = try old.file.rootRelativePath(index);
        if (std.mem.eql(u8, path, "/DocInfo") or std.mem.eql(u8, path, "/BodyText/Section0")) continue;
        // File owns this borrowed stream; only the enclosing Source deinitializes it.
        const unchanged = try next.file.readStream(a, path);
        try t.expectEqualSlices(u8, entry.content, unchanged);
    }
}

test "H5 diagonal common sparse presence explicit zero and foreground canonical SSOT" {
    try t.expect(!p.diagonalHas(.{}));
    try t.expect(p.diagonalHas(.{ .directions = .none }));
    try t.expect(p.diagonalHas(.{ .stroke = .{ .style = .NONE, .color = 0 } }));
    try t.expectError(error.InvalidCellDiagonal, p.validate(.{ .diagonal = .{} }));
    try t.expectError(error.UnsupportedBorderWidth, p.validate(.{ .diagonal = .{ .stroke = .{ .width_hundredth_mm = 0 } } }));
    try t.expectError(error.InvalidCharacterColor, p.validate(.{ .diagonal = .{ .stroke = .{ .color = 0x1000000 } } }));
    const before: p.Patch = .{ .diagonal = .{ .directions = .cross, .stroke = .{ .style = .SOLID, .width_hundredth_mm = 70, .color = 0x123456 } }, .background = .{ .hatch = .{ .face = 0x13579b, .hatch = 0xabcdef, .style = .CROSS } } };
    const merged = p.merge(before, .{ .diagonal = .{ .stroke = .{ .color = 0 } }, .background = .{ .solid = .{ .color = 0xe7e7a5 } } });
    try t.expectEqual(@as(?p.DiagonalDirections, .cross), merged.diagonal.?.directions);
    try t.expectEqual(@as(?u32, 0), merged.diagonal.?.stroke.color);
    try t.expectEqual(@as(?u16, 70), merged.diagonal.?.stroke.width_hundredth_mm);
    try t.expectEqual(@as(?u32, 0xabcdef), merged.background.?.solid.hatch_color);
    const original: p.Value = .{ .diagonal = .{ .directions = .none, .stroke = .{ .style = .NONE, .width_hundredth_mm = 10, .color = 0 } }, .background = .{ .solid = .{ .color = 0xe7e7a5 } } };
    const normalized = p.canonical(original, merged);
    try t.expect(normalized.diagonal.?.stroke.color == null);
    try t.expectEqual(@as(?p.DiagonalDirections, .cross), normalized.diagonal.?.directions);
    try t.expectEqual(@as(?u32, 0xabcdef), normalized.background.?.solid.hatch_color);
    try t.expect(!p.has(p.canonical(original, .{ .diagonal = .{ .directions = .none, .stroke = .{ .style = .NONE, .color = 0 } }, .background = .{ .solid = .{ .color = 0xe7e7a5 } } })));
    try t.expect(p.has(p.canonical(.{}, .{ .diagonal = .{ .directions = .none, .stroke = .{ .color = 0 } } })));
    try t.expect(p.matches(original, .{ .diagonal = .{ .directions = .none, .stroke = .{ .color = 0 } } }));
    try t.expect(!p.matches(original, merged));
    try t.expectEqualDeep(p.canonical(original, merged), values.canonical(original, merged));
}

test "H5 diagonal all attribute bit patterns basic geometry gate and low effects preservation" {
    var basic: usize = 0;
    for (0..65536) |number| {
        const attributes: u16 = @intCast(number);
        const slash = (attributes >> 2) & 7;
        const back = (attributes >> 5) & 7;
        const allowed = attributes & 0xff00 == 0 and (slash == 0 or slash == 2) and (back == 0 or back == 2);
        try t.expectEqual(allowed, codec.fromHwp5(attributes) != null);
        if (allowed) {
            basic += 1;
            for (directions) |to| {
                const next = try codec.writeHwp5(attributes, to);
                try t.expectEqual(attributes & ~@as(u16, 0xfc), next & ~@as(u16, 0xfc));
                try t.expectEqual(@as(?p.DiagonalDirections, to), codec.fromHwp5(next));
            }
        } else try t.expectError(error.UnsupportedHwp5DiagonalDirections, codec.writeHwp5(attributes, .none));
    }
    try t.expectEqual(@as(usize, 16), basic);
    try t.expectEqual(@as(u16, 8), codec.hwp5Bits(.rising));
    try t.expectEqual(@as(u16, 0x40), codec.hwp5Bits(.falling));
    try t.expectEqual(@as(u16, 0x48), codec.hwp5Bits(.cross));
}

test "H5 diagonal fifth stroke known styles widths RGB and nullable source observation" {
    for ([_]u8{ 0, 1, 8 }) |kind| for (p.widths, 0..) |width, code| {
        const input = raw(8, kind, @intCast(code), 0x00332211, true);
        const observed = try payloads.observe(input.bytes[0..input.len]);
        try t.expectEqual(@as(?p.DiagonalDirections, .rising), observed.diagonal.directions);
        try t.expectEqual(p.fromHwp5(kind), observed.diagonal.stroke.style);
        try t.expectEqual(@as(?u16, width), observed.diagonal.stroke.width_hundredth_mm);
        try t.expectEqual(@as(?u32, 0x112233), observed.diagonal.stroke.color);
        try t.expect(observed.background == null);
    };
    const unknown = raw(0x2104, 255, 255, 0xffffffff, true);
    const observed = try payloads.observe(unknown.bytes[0..unknown.len]);
    try t.expectEqualDeep(p.DiagonalValue{}, observed.diagonal);
}

test "H5 diagonal sixteen transitions patch only direction fifth stroke and preserve opaque fill" {
    for (directions) |from| for (directions) |to| {
        const input = raw(codec.hwp5Bits(from) | 3, 1, 0, 0x123456, true);
        const patch: p.Patch = .{ .diagonal = .{ .directions = to, .stroke = .{ .style = .DOUBLE_SLIM, .width_hundredth_mm = 50, .color = 0 } } };
        const output = try payloads.write(a, input.bytes[0..input.len], patch, 4096);
        defer a.free(output);
        try t.expectEqualSlices(u8, input.bytes[2..26], output[2..26]);
        try t.expectEqualSlices(u8, input.bytes[32..input.len], output[32..]);
        try t.expectEqual(codec.hwp5Bits(to) | @as(u16, 3), std.mem.readInt(u16, output[0..2], .little));
        try t.expectEqual(@as(u8, 8), output[26]);
        try t.expectEqual(@as(u8, 7), output[27]);
        try t.expectEqual(@as(u32, 0), std.mem.readInt(u32, output[28..32], .little));
        try t.expect(p.matches(try payloads.observe(output), patch));
    };
}

test "H5 diagonal stroke only preserves advanced attributes unknown stroke siblings and opaque bytes" {
    for ([_]u16{ 0x0004, 0x001c, 0x0308, 0x0440, 0x0808, 0x1040, 0x2008, 0x8000 }) |attributes| {
        const input = raw(attributes, 250, 255, 0xffffffff, true);
        const output = try payloads.write(a, input.bytes[0..input.len], .{ .diagonal = .{ .stroke = .{ .color = 0 } } }, 4096);
        defer a.free(output);
        var expected = input.bytes;
        @memset(expected[28..32], 0);
        try t.expectEqualSlices(u8, expected[0..input.len], output);
        try t.expectError(error.UnsupportedHwp5DiagonalDirections, payloads.write(a, input.bytes[0..input.len], .{ .diagonal = .{ .directions = .none } }, 4096));
        const reset = try payloads.write(a, input.bytes[0..input.len], .{ .diagonal = .{ .stroke = .{ .style = .NONE } } }, 4096);
        defer a.free(reset);
        expected = input.bytes;
        expected[26] = 0;
        try t.expectEqualSlices(u8, expected[0..input.len], reset);
    }
    const basic = raw(0, 1, 0, 0, false);
    try t.expectError(error.UnsupportedBorderLineStyle, payloads.write(a, basic.bytes[0..basic.len], .{ .diagonal = .{ .stroke = .{ .style = .DASH } } }, 4096));
}

test "H5 diagonal clone key distinguishes omitted none black every field and source identity" {
    const absent = try writer.CloneKey.init(1, .{});
    const none = try writer.CloneKey.init(1, .{ .diagonal = .{ .directions = .none } });
    const black = try writer.CloneKey.init(1, .{ .diagonal = .{ .stroke = .{ .color = 0 } } });
    const style = try writer.CloneKey.init(1, .{ .diagonal = .{ .stroke = .{ .style = .NONE } } });
    const width = try writer.CloneKey.init(1, .{ .diagonal = .{ .stroke = .{ .width_hundredth_mm = 10 } } });
    const other = try writer.CloneKey.init(2, .{ .diagonal = .{ .directions = .none } });
    const keys = [_]writer.CloneKey{ absent, none, black, style, width, other };
    var set = std.AutoHashMap(writer.CloneKey, void).init(a);
    defer set.deinit();
    for (keys) |key| try set.put(key, {});
    try t.expectEqual(@as(u32, 6), set.count());
    try t.expectError(error.InvalidCellDiagonal, writer.CloneKey.init(1, .{ .diagonal = .{} }));
}

test "H5 diagonal actual originals one history borrowed requests noop redo and saved COW resources" {
    const input = try fixture();
    defer a.free(input);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try editor.Session.open(a, input);
        defer session.close();
        var req = requests();
        const background: p.Background = .{ .hatch = .{ .face = 0x13579b, .hatch = 0xabcdef, .style = .CROSS } };
        try session.applyCellFills(&.{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .fill = background }});
        const baseline = try saved(session);
        defer a.free(baseline);
        const before_rows = try session.cellLayoutSources(a, 0);
        defer a.free(before_rows);
        var history = try historyFor(a, session, mode);
        defer history.deinit();
        try t.expect(try history.apply(session, .{ .set_cell_styles = &req }));
        const expected = req;
        for (expected) |request| try t.expect(p.matches(try current(session, request), request.patch));
        try t.expectEqualDeep(background, (try current(session, expected[0])).background.?);
        const revision = history.revision();
        try t.expect(!try history.apply(session, .{ .set_cell_styles = &req }));
        try t.expectEqual(revision, history.revision());
        const output = try saved(session);
        defer a.free(output);
        try expectOldResources(input, output);
        const after_rows = try session.cellLayoutSources(a, 0);
        defer a.free(after_rows);
        try t.expectEqual(before_rows.len, after_rows.len);
        for (before_rows, after_rows) |before, after| {
            try t.expectEqual(before.table_record_node, after.table_record_node);
            try t.expectEqual(before.list_node, after.list_node);
            if (before.list_node != req[0].list_node and before.list_node != req[1].list_node) try t.expectEqual(before.border_fill_id, after.border_fill_id);
        }
        // History retains scalar patches, not the borrowed caller slice.
        req[0].table_node = std.math.maxInt(u32);
        req[1].patch.diagonal = .{ .directions = .none, .stroke = .{ .color = 0xffffff } };
        try t.expect(try history.undo(session));
        try expectBytes(session, baseline);
        try t.expect(!try history.undo(session));
        try t.expect(try history.redo(session));
        try expectBytes(session, output);
        try t.expect(!try history.redo(session));
        const reopened = try editor.Session.open(a, output);
        defer reopened.close();
        for (expected) |request| try t.expect(p.matches(try current(reopened, request), request.patch));
        try expectBytes(reopened, output);
    }
}

test "H5 diagonal identical source and intent reuse clone distinct sources and diagonal values do not" {
    const input = try fixture();
    defer a.free(input);
    const initial = try editor.Session.open(a, input);
    defer initial.close();
    var req = requests();
    const first_source = try currentId(initial, req[0]);
    const second_source = try currentId(initial, req[1]);
    try t.expect(first_source != second_source);
    const derived = try deriveCell(input, req[1], first_source, false);
    defer a.free(derived);
    const shared = try editor.Session.open(a, derived);
    defer shared.close();
    req[1].patch = req[0].patch;
    try shared.applyCellStyles(&req);
    try t.expectEqual(try currentId(shared, req[0]), try currentId(shared, req[1]));
    const output = try saved(shared);
    defer a.free(output);
    try expectOldResources(derived, output);
    req[1].patch.diagonal.?.directions = .cross;
    try shared.applyCellStyles(&req);
    try t.expect(try currentId(shared, req[0]) != try currentId(shared, req[1]));
    req[1].patch = req[0].patch;
    try initial.applyCellStyles(&req);
    try t.expect(try currentId(initial, req[0]) != try currentId(initial, req[1]));
}

test "H5 diagonal invalid trailing owner scalars duplicate empty limit retain original and redo" {
    const input = try fixture();
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    const req = requests();
    var history = try historyFor(a, session, 2);
    defer history.deinit();
    try t.expect(try history.apply(session, .{ .set_cell_styles = req[0..1] }));
    try t.expect(try history.undo(session));
    const before = try saved(session);
    defer a.free(before);
    const revision = history.revision();
    var bad = req;
    bad[1].list_node = std.math.maxInt(u32);
    try t.expectError(error.InvalidCellDisplayOwner, history.apply(session, .{ .set_cell_styles = &bad }));
    try t.expectError(error.DuplicateCellBorderOwner, history.apply(session, .{ .set_cell_styles = &.{ req[0], req[0] } }));
    bad = req;
    bad[1].patch.diagonal.?.stroke.color = 0x1000000;
    try t.expectError(error.InvalidCharacterColor, history.apply(session, .{ .set_cell_styles = &bad }));
    bad = req;
    bad[1].patch.diagonal.?.stroke.width_hundredth_mm = 0;
    try t.expectError(error.UnsupportedBorderWidth, history.apply(session, .{ .set_cell_styles = &bad }));
    bad = req;
    bad[1].patch.diagonal = .{};
    try t.expectError(error.InvalidCellDiagonal, history.apply(session, .{ .set_cell_styles = &bad }));
    const big = try a.alloc(Request, @import("model/cell_edit_budget.zig").max_cells + 1);
    defer a.free(big);
    @memset(big, req[0]);
    try t.expectError(error.LimitExceeded, history.apply(session, .{ .set_cell_styles = big }));
    try t.expect(!try history.apply(session, .{ .set_cell_styles = &.{} }));
    try t.expectEqual(revision, history.revision());
    try expectBytes(session, before);
    try t.expect(try history.redo(session));
    try t.expect(p.matches(try current(session, req[0]), req[0].patch));
}

test "H5 diagonal protected and unsupported trailing geometry rollback but stroke preserves advanced bits" {
    const input = try fixture();
    defer a.free(input);
    const initial = try editor.Session.open(a, input);
    defer initial.close();
    const req = requests();
    const protected = try deriveCell(input, req[1], null, true);
    defer a.free(protected);
    const blocked = try editor.Session.open(a, protected);
    defer blocked.close();
    try t.expectError(error.ProtectedCell, blocked.applyCellStyles(&req));
    try expectBytes(blocked, protected);
    const advanced = try deriveAttributes(input, try currentId(initial, req[1]), 0x2104);
    defer a.free(advanced);
    const session = try editor.Session.open(a, advanced);
    defer session.close();
    var history = try historyFor(a, session, 0);
    defer history.deinit();
    try t.expect(try history.apply(session, .{ .set_cell_styles = req[0..1] }));
    try t.expect(try history.undo(session));
    const revision = history.revision();
    try t.expectError(error.UnsupportedHwp5DiagonalDirections, history.apply(session, .{ .set_cell_styles = &req }));
    try t.expectEqual(revision, history.revision());
    try expectBytes(session, advanced);
    try t.expect(try history.redo(session));
    var stroke = req[1];
    stroke.patch.diagonal = .{ .stroke = .{ .color = 0x010203 } };
    try t.expect(try history.apply(session, .{ .set_cell_styles = &.{stroke} }));
    const id = try currentId(session, stroke);
    var info = try session.formattingSource(a);
    defer info.deinit();
    const payload = try resources.resource(info.bytes, id);
    try t.expectEqual(@as(u16, 0x2104), std.mem.readInt(u16, payload[0..2], .little));
    try t.expectEqual(@as(u32, 0x030201), std.mem.readInt(u32, payload[28..32], .little));
}

test "H5 diagonal legacy four edge and fill edits preserve pending diagonal without ABI mask expansion" {
    const input = try fixture();
    defer a.free(input);
    const session = try editor.Session.open(a, input);
    defer session.close();
    const req = requests();
    try session.applyCellStyles(req[0..1]);
    const diagonal = (try current(session, req[0])).diagonal;
    try session.applyCellBorders(&.{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .edges = 2, .style = .DOUBLE_SLIM, .width_hundredth_mm = 50, .color = 0xabcdef }});
    try session.applyCellFills(&.{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .fill = .{ .solid = .{ .color = 0x13579b } } }});
    try t.expectEqualDeep(diagonal, (try current(session, req[0])).diagonal);
    try t.expectError(error.InvalidCellBorderEdges, @import("hwp5/edit/cell_border_values.zig").toPatch(.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .edges = 16, .style = .SOLID, .width_hundredth_mm = 10, .color = 0 }));
    const output = try saved(session);
    defer a.free(output);
    const reopened = try editor.Session.open(a, output);
    defer reopened.close();
    try t.expectEqualDeep(diagonal, (try current(reopened, req[0])).diagonal);
}

test "H5 diagonal sampled OOM first middle final preserves bytes revision foreground redo and allocator balance" {
    const input = try fixture();
    defer a.free(input);
    for ([_]u8{ 0, 2 }) |mode| {
        const req = requests();
        var measured = std.testing.FailingAllocator.init(a, .{});
        const baseline = try editor.Session.open(measured.allocator(), input);
        defer baseline.close();
        const background: p.Background = .{ .hatch = .{ .face = 0x123456, .hatch = 0xabcdef, .style = .CROSS } };
        try baseline.applyCellFills(&.{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .fill = background }});
        var baseline_history = try historyFor(measured.allocator(), baseline, mode);
        defer baseline_history.deinit();
        try t.expect(try baseline_history.apply(baseline, .{ .set_cell_styles = req[0..1] }));
        try t.expect(try baseline_history.undo(baseline));
        const primed = try saved(baseline);
        defer a.free(primed);
        try t.expectEqualDeep(background, (try current(baseline, req[0])).background.?);
        const start = measured.alloc_index;
        try t.expect(try baseline_history.apply(baseline, .{ .set_cell_styles = &req }));
        const count = measured.alloc_index - start;
        try t.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
            var failing = std.testing.FailingAllocator.init(a, .{});
            {
                const session = try editor.Session.open(failing.allocator(), input);
                defer session.close();
                try session.applyCellFills(&.{.{ .section = 0, .table_node = req[0].table_node, .list_node = req[0].list_node, .fill = background }});
                var history = try historyFor(failing.allocator(), session, mode);
                defer history.deinit();
                try t.expect(try history.apply(session, .{ .set_cell_styles = req[0..1] }));
                try t.expect(try history.undo(session));
                const before = try saved(session);
                defer a.free(before);
                const revision = history.revision();
                const foreground_before = (try current(session, req[0])).background;
                failing.fail_index = failing.alloc_index + offset;
                const result = history.apply(session, .{ .set_cell_styles = &req });
                failing.fail_index = std.math.maxInt(usize);
                try t.expectError(error.OutOfMemory, result);
                try t.expect(failing.has_induced_failure);
                try t.expectEqual(revision, history.revision());
                try expectBytes(session, before);
                try t.expectEqualDeep(foreground_before, (try current(session, req[0])).background);
                try t.expect(try history.redo(session));
                try t.expect(try history.undo(session));
                try t.expect(try history.apply(session, .{ .set_cell_styles = &req }));
            }
            try t.expectEqual(failing.allocated_bytes, failing.freed_bytes);
        }
    }
}
