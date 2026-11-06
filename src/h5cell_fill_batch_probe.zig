//! Focused original-Noori fill transactions. No template or other fixture is read.
//! Current official H5/HX paired swatches decide the observed 0..5 domain.
//! Header-only importer acceptance is not a universal historical-producer or raster parity claim.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("hwp5/edit/style_preservation.zig");
const p = @import("model/border_fill_patch.zig");
const Request = @import("hwp5/edit/h5cell_fill_batch.zig").Request;
const StyleRequest = @import("hwp5/edit/h5cell_style_batch.zig").Request;
const History = @import("hwp5/edit/editor_history.zig").History;
const Source = @import("hwp5/text_source.zig").Source;
const records = @import("hwp5/record.zig");
const resources = @import("hwp5/edit/border_fill_docinfo_patch.zig");
const payloads = @import("hwp5/edit/border_fill_payload_patch.zig");
const variants = [_]p.Background{
    .none,
    .{ .solid = .{ .color = 0x123456, .hatch_color = 0x654321 } },
    .{ .hatch = .{ .face = 0xff0000, .hatch = 0x0000ff, .style = .CROSS } },
    .{ .linear = .{ .colors = .{ 0xff0000, 0x0000ff }, .angle = 90, .center_x = 37, .center_y = 63, .step = 40, .step_center = 55 } },
};
fn fixture() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(8_000_000));
}
fn owners(session: *const edit.Session) ![2]Request {
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    var out: [2]Request = undefined;
    var count: usize = 0;
    for ([_]bool{ true, false }) |preferred| for (rows) |row| {
        if (row.protected or row.border_fill_id == 0) continue;
        if ((row.table_record_node == 200 and row.list_node == 201) != preferred) continue;
        var live = false;
        for (bindings) |binding| if (binding.table_node == row.table_record_node and binding.list_node == row.list_node) {
            live = true;
            break;
        };
        if (!live) continue;
        out[count] = .{ .section = 0, .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node), .fill = variants[count + 1] };
        count += 1;
        if (count == out.len) return out;
    };
    return error.MissingLiveOriginalNooriCells;
}
fn ids(session: *const edit.Session, req: []const Request) ![2]u16 {
    try std.testing.expectEqual(@as(usize, 2), req.len);
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    var out: [2]u16 = undefined;
    for (req, 0..) |request, index| {
        var found = false;
        for (rows) |row| if (row.table_record_node == request.table_node and row.list_node == request.list_node) {
            try std.testing.expect(!found);
            out[index] = row.border_fill_id;
            found = true;
        };
        try std.testing.expect(found);
    }
    return out;
}
fn saved(session: *const edit.Session) ![]u8 {
    return (try session.save(a, .{ .allow_stale_layout = true })).bytes;
}
fn expectBytes(session: *const edit.Session, expected: []const u8) !void {
    const output = try saved(session);
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, expected, output);
}
fn expectFills(session: *const edit.Session, req: []const Request) !void {
    const current_ids = try ids(session, req);
    var info = try session.formattingSource(a);
    defer info.deinit();
    const dto = try session.borderFillSources(a);
    defer @import("hwp5/edit/border_fill_sources.zig").deinit(a, dto);
    for (req, current_ids) |request, id| {
        const payload = try resources.resource(info.bytes, id);
        const observed = try payloads.observe(payload);
        try std.testing.expect(p.matches(observed, .{ .background = request.fill }));
        const fill = dto[id - 1];
        switch (request.fill) {
            .none => try std.testing.expectEqual(@as(u32, 0), fill.fill_flags),
            .solid => |solid| {
                try std.testing.expectEqual(@as(u32, 1), fill.fill_flags);
                try std.testing.expectEqual(@as(i32, -1), fill.pattern.?.kind);
                try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(solid.color), fill.pattern.?.background);
            },
            .hatch => |hatch| {
                try std.testing.expectEqual(@as(u32, 1), fill.fill_flags);
                // Independent current Hancom API paired H5/HX six-swatch oracle, including the two diagonal names.
                const kind: i32 = switch (hatch.style) {
                    .HORIZONTAL => 0,
                    .VERTICAL => 1,
                    .BACK_SLASH => 3,
                    .SLASH => 2,
                    .CROSS => 4,
                    .CROSS_DIAGONAL => 5,
                };
                try std.testing.expectEqual(kind, fill.pattern.?.kind);
                try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(hatch.face), fill.pattern.?.background);
                try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(hatch.hatch), fill.pattern.?.foreground);
            },
            .linear => |gradient| {
                try std.testing.expectEqual(@as(u32, 4), fill.fill_flags);
                try std.testing.expectEqual(@as(u32, gradient.angle), fill.gradient.?.angle);
                try std.testing.expectEqual(@as(u32, gradient.center_x), fill.gradient.?.center_x);
                try std.testing.expectEqual(@as(u32, gradient.center_y), fill.gradient.?.center_y);
                try std.testing.expectEqual(@as(u32, gradient.step), fill.gradient.?.blur);
                try std.testing.expectEqual(@as(?u8, gradient.step_center), fill.gradient.?.blur_center);
                try std.testing.expectEqual(@as(usize, 2), fill.gradient.?.colors.len);
                for (gradient.colors, fill.gradient.?.colors) |color, raw| try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(color), raw);
            },
        }
    }
}
fn historyFor(allocator: std.mem.Allocator, session: *edit.Session, mode: u8) !History {
    if (mode == 2) session.enableHistoryDelta();
    return if (mode == 0) History.init(allocator, session, 16, 8_000_000) else History.initV2(allocator, session, .{ .max_entries = 16, .max_checkpoint_bytes = 8_000_000, .max_retained_bytes = 64_000_000 });
}
fn countBorderFills(info: []const u8) !usize {
    var it = records.Iterator.init(info, .{});
    var count: usize = 0;
    while (try it.next()) |record| if (record.tag == 20) {
        count += 1;
    };
    return count;
}
/// Independent source framing: every old resource/font record survives byte-for-byte.
/// Only the BorderFill count in ID_MAPPINGS and appended new resources may differ.
fn expectPreserved(original: []const u8, output: []const u8, req: []const Request, current_ids: [2]u16) !void {
    var before = try Source.open(a, original);
    defer before.deinit();
    var after = try Source.open(a, output);
    defer after.deinit();
    var stream_count: usize = 0;
    for (before.file.entries, 0..) |entry, index| {
        if (entry.kind != 2) continue;
        stream_count += 1;
        const path = try before.file.rootRelativePath(index);
        if (!std.mem.eql(u8, path, "/DocInfo") and !std.mem.eql(u8, path, "/BodyText/Section0"))
            try std.testing.expectEqualSlices(u8, entry.content, try after.file.readStream(a, path));
    }
    var next_count: usize = 0;
    for (after.file.entries) |entry| if (entry.kind == 2) {
        next_count += 1;
    };
    try std.testing.expectEqual(stream_count, next_count);
    const old_info = try before.decodeDocInfo(a, 32_000_000);
    defer a.free(old_info);
    const next_info = try after.decodeDocInfo(a, 32_000_000);
    defer a.free(next_info);
    const old_count = try countBorderFills(old_info);
    const new_count = try countBorderFills(next_info);
    try std.testing.expect(new_count >= old_count);
    var old_records = records.Iterator.init(old_info, .{});
    var next_records = records.Iterator.init(next_info, .{});
    var seen_fills: usize = 0;
    var fonts: usize = 0;
    while (try next_records.next()) |record| {
        if (record.tag == 20) {
            seen_fills += 1;
            if (seen_fills > old_count) continue;
        }
        const previous = (try old_records.next()) orelse return error.UnexpectedDocInfoRecord;
        try std.testing.expectEqual(previous.tag, record.tag);
        try std.testing.expectEqual(previous.level, record.level);
        if (record.tag == 17) {
            try std.testing.expect(previous.payload.len >= 36);
            const expected = try a.dupe(u8, previous.payload);
            defer a.free(expected);
            std.mem.writeInt(i32, expected[32..36], @intCast(new_count), .little);
            try std.testing.expectEqualSlices(u8, expected, record.payload);
        } else {
            try std.testing.expectEqualSlices(u8, previous.raw, record.raw);
            if (record.tag == 19) fonts += 1;
        }
    }
    try std.testing.expect((try old_records.next()) == null);
    try std.testing.expect(fonts > 0);
    const old_section = try before.decodeSection(a, 0);
    defer a.free(old_section);
    const next_section = try after.decodeSection(a, 0);
    defer a.free(next_section);
    const expected_section = try a.dupe(u8, old_section);
    defer a.free(expected_section);
    var it = records.Iterator.init(old_section, .{});
    var node: u32 = 0;
    var changed: usize = 0;
    while (try it.next()) |record| : (node += 1) for (req, current_ids) |request, id| {
        if (node != request.list_node) continue;
        try std.testing.expectEqual(@as(u10, 72), record.tag);
        const at = record.offset + record.raw.len - record.payload.len + 32;
        try std.testing.expect(record.payload.len >= 34);
        std.mem.writeInt(u16, expected_section[at..][0..2], id, .little);
        changed += 1;
    };
    try std.testing.expectEqual(req.len, changed);
    try std.testing.expectEqualSlices(u8, expected_section, next_section);
}
fn deriveOwner(original: []const u8, request: Request, source_id: ?u16, protect: bool) ![]u8 {
    var source = try Source.open(a, original);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const changed = try a.dupe(u8, raw);
    defer a.free(changed);
    var it = records.Iterator.init(raw, .{});
    var node: u32 = 0;
    var found = false;
    while (try it.next()) |record| : (node += 1) if (node == request.list_node) {
        try std.testing.expectEqual(@as(u10, 72), record.tag);
        try std.testing.expect(record.payload.len >= 34);
        const at = record.offset + record.raw.len - record.payload.len;
        if (source_id) |id| std.mem.writeInt(u16, changed[at + 32 ..][0..2], id, .little);
        if (protect) {
            const attributes = std.mem.readInt(u32, changed[at + 4 ..][0..4], .little);
            std.mem.writeInt(u32, changed[at + 4 ..][0..4], attributes | (1 << 17), .little);
        }
        found = true;
    };
    try std.testing.expect(found);
    const encoded = if (source.header.has(.compressed)) try @import("compression/raw_deflate.zig").encodeStored(a, changed, 32_000_000) else try a.dupe(u8, changed);
    defer a.free(encoded);
    return @import("cfb/stream_replace.zig").rebuildManyExact(a, &source.file, &.{.{ .path = "/BodyText/Section0", .content = encoded }}, .{ .max_output_bytes = 8_000_000 });
}

test "cell fill batch HWP5 four variants sixteen transitions preserve borders font declarations and original resources" {
    const original = try fixture();
    defer a.free(original);
    for (variants) |from| for (variants) |to| {
        const session = try edit.Session.open(a, original);
        defer session.close();
        var req = try owners(session);
        const original_ids = try ids(session, &req);
        var info = try session.formattingSource(a);
        defer info.deinit();
        req[0].fill = from;
        req[1].fill = from;
        try session.applyCellFills(&req);
        req[0].fill = to;
        req[1].fill = to;
        try session.applyCellFills(&req);
        try expectFills(session, &req);
        const current_ids = try ids(session, &req);
        var next = try session.formattingSource(a);
        defer next.deinit();
        for (original_ids, current_ids) |old, current| try std.testing.expectEqualSlices(u8, (try resources.resource(info.bytes, old))[0..32], (try resources.resource(next.bytes, current))[0..32]);
        const output = try saved(session);
        defer a.free(output);
        try expectPreserved(original, output, &req, current_ids);
        const reopened = try edit.Session.open(a, output);
        defer reopened.close();
        try expectFills(reopened, &req);
    };
}
test "cell fill batch HWP5 borrowed request and linear color array cannot mutate a committed batch" {
    const original = try fixture();
    defer a.free(original);
    const session = try edit.Session.open(a, original);
    defer session.close();
    var req = try owners(session);
    req[0].fill = variants[3];
    req[1].fill = variants[2];
    const expected = req;
    try session.applyCellFills(&req);
    const committed = try saved(session);
    defer a.free(committed);
    req[0].fill.linear.colors[0] = 0x00ff00;
    req[0].table_node = std.math.maxInt(u32);
    req[1].fill = .none;
    try expectFills(session, &expected);
    try expectBytes(session, committed);
}
test "cell fill batch HWP5 V1 V2 and delta histories own one atomic frame and preserve redo after noops" {
    const original = try fixture();
    defer a.free(original);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try edit.Session.open(a, original);
        defer session.close();
        const req = try owners(session);
        const before = try saved(session);
        defer a.free(before);
        var history = try historyFor(a, session, mode);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .set_cell_fills = &req }));
        const revision = history.revision();
        const changed = try saved(session);
        defer a.free(changed);
        try std.testing.expect(!try history.apply(session, .{ .set_cell_fills = &req }));
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expect(!try history.apply(session, .{ .set_cell_fills = &.{} }));
        try std.testing.expect(try history.undo(session));
        try expectBytes(session, before);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(!try history.apply(session, .{ .set_cell_fills = &.{} }));
        try std.testing.expect(try history.redo(session));
        try expectBytes(session, changed);
        try std.testing.expect(!try history.redo(session));
    }
}
test "cell fill batch HWP5 same original resource and typed variant reuse one clone without touching other resources" {
    const original = try fixture();
    defer a.free(original);
    const initial = try edit.Session.open(a, original);
    defer initial.close();
    const selected = try owners(initial);
    const original_ids = try ids(initial, &selected);
    const derived = try deriveOwner(original, selected[1], original_ids[0], false);
    defer a.free(derived);
    const session = try edit.Session.open(a, derived);
    defer session.close();
    var req = selected;
    for (variants) |variant| {
        req[0].fill = variant;
        req[1].fill = variant;
        try session.applyCellFills(&req);
        const current_ids = try ids(session, &req);
        try std.testing.expectEqual(current_ids[0], current_ids[1]);
        try expectFills(session, &req);
        const output = try saved(session);
        defer a.free(output);
        try expectPreserved(derived, output, &req, current_ids);
    }
    req[0].fill = variants[2];
    req[1].fill = variants[3];
    try session.applyCellFills(&req);
    const different_ids = try ids(session, &req);
    try std.testing.expect(different_ids[0] != different_ids[1]);
}
test "cell fill batch HWP5 invalid trailing owner and duplicate owner leave no partial resource mutation" {
    const original = try fixture();
    defer a.free(original);
    const session = try edit.Session.open(a, original);
    defer session.close();
    var req = try owners(session);
    const before = try saved(session);
    defer a.free(before);
    req[1].list_node = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidCellDisplayOwner, session.applyCellFills(&req));
    try expectBytes(session, before);
    req[1] = req[0];
    try std.testing.expectError(error.DuplicateCellBorderOwner, session.applyCellFills(&req));
    try expectBytes(session, before);
}
test "cell fill batch HWP5 invalid trailing color and gradient roll back the entire validated prefix" {
    const original = try fixture();
    defer a.free(original);
    const session = try edit.Session.open(a, original);
    defer session.close();
    var req = try owners(session);
    const before = try saved(session);
    defer a.free(before);
    req[1].fill = .{ .solid = .{ .color = 0x1000000 } };
    try std.testing.expectError(error.InvalidCharacterColor, session.applyCellFills(&req));
    try expectBytes(session, before);
    req[1].fill = variants[3];
    req[1].fill.linear.center_x = 101;
    try std.testing.expectError(error.InvalidBackgroundGradient, session.applyCellFills(&req));
    try expectBytes(session, before);
}
test "cell fill batch HWP5 protected trailing Noori derived cell preserves the preceding writable owner" {
    const original = try fixture();
    defer a.free(original);
    const initial = try edit.Session.open(a, original);
    defer initial.close();
    const req = try owners(initial);
    const derived = try deriveOwner(original, req[1], null, true);
    defer a.free(derived);
    const session = try edit.Session.open(a, derived);
    defer session.close();
    const before = try saved(session);
    defer a.free(before);
    try std.testing.expectError(error.ProtectedCell, session.applyCellFills(&req));
    try expectBytes(session, before);
}
test "cell fill batch HWP5 bounded overflow and empty request never publish a candidate" {
    const original = try fixture();
    defer a.free(original);
    const session = try edit.Session.open(a, original);
    defer session.close();
    const req = try owners(session);
    const before = try saved(session);
    defer a.free(before);
    const overflow = try a.alloc(Request, 4097);
    defer a.free(overflow);
    @memset(overflow, req[0]);
    try std.testing.expectError(error.LimitExceeded, session.applyCellFills(overflow));
    try session.applyCellFills(&.{});
    try expectBytes(session, before);
}
test "cell fill batch HWP5 legacy solid preserves inactive original foreground after generic hatch fill work" {
    const original = try fixture();
    defer a.free(original);
    const session = try edit.Session.open(a, original);
    defer session.close();
    const rows = try session.cellLayoutSources(a, 0);
    defer a.free(rows);
    const bindings = try session.tableBindings(a, 0);
    defer a.free(bindings);
    var info = try session.formattingSource(a);
    defer info.deinit();
    for (rows) |row| {
        if (row.protected) continue;
        var live = false;
        for (bindings) |binding| if (binding.table_node == row.table_record_node and binding.list_node == row.list_node) {
            live = true;
            break;
        };
        if (!live) continue;
        const raw = try resources.resource(info.bytes, row.border_fill_id);
        const source = try @import("hwp5/docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(raw, .observed_absent);
        if (source.fill.data != .known or source.fill.flags != 1 or source.fill.data.known.pattern == null or source.fill.data.known.pattern.?.kind != -1) continue;
        const old_foreground = source.fill.data.known.pattern.?.foreground;
        const req: Request = .{ .section = 0, .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node), .fill = .{ .solid = .{ .color = 0x123456 } } };
        try session.applyCellFills(&.{req});
        const changed_rows = try session.cellLayoutSources(a, 0);
        defer a.free(changed_rows);
        var next = try session.formattingSource(a);
        defer next.deinit();
        for (changed_rows) |changed| if (changed.table_record_node == row.table_record_node and changed.list_node == row.list_node) {
            const payload = try resources.resource(next.bytes, changed.border_fill_id);
            const observed = try @import("hwp5/docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(payload, .observed_absent);
            try std.testing.expectEqual(old_foreground, observed.fill.data.known.pattern.?.foreground);
            try std.testing.expectEqual(@as(u32, 0x563412), observed.fill.data.known.pattern.?.background);
            try std.testing.expectEqualSlices(u8, raw[0..32], payload[0..32]);
            return;
        };
        return error.MissingCommittedLegacyOwner;
    }
    return error.MissingOriginalSolidNooriCell;
}
test "cell fill batch HWP5 sampled allocation failures preserve bytes revision and existing redo in V1 and V2" {
    const original = try fixture();
    defer a.free(original);
    for ([_]u8{ 0, 2 }) |mode| {
        var measured = std.testing.FailingAllocator.init(a, .{});
        const baseline = try edit.Session.open(measured.allocator(), original);
        defer baseline.close();
        var req = try owners(baseline);
        req[0].fill = variants[2];
        req[1].fill = variants[3];
        var baseline_history = try historyFor(measured.allocator(), baseline, mode);
        defer baseline_history.deinit();
        try std.testing.expect(try baseline_history.apply(baseline, .{ .set_cell_fills = req[0..1] }));
        try std.testing.expect(try baseline_history.undo(baseline));
        // Match the failure runs: serialization may populate lazy read-only views.
        const baseline_before = try saved(baseline);
        defer a.free(baseline_before);
        const start = measured.alloc_index;
        try std.testing.expect(try baseline_history.apply(baseline, .{ .set_cell_fills = &req }));
        const count = measured.alloc_index - start;
        try std.testing.expect(count > 3);
        for ([_]usize{ 0, count / 2, count - 1 }) |offset| {
            var failing = std.testing.FailingAllocator.init(a, .{});
            const session = try edit.Session.open(failing.allocator(), original);
            defer session.close();
            var history = try historyFor(failing.allocator(), session, mode);
            defer history.deinit();
            try std.testing.expect(try history.apply(session, .{ .set_cell_fills = req[0..1] }));
            try std.testing.expect(try history.undo(session));
            const before = try saved(session);
            defer a.free(before);
            const revision = history.revision();
            failing.fail_index = failing.alloc_index + offset;
            const result = history.apply(session, .{ .set_cell_fills = &req });
            failing.fail_index = std.math.maxInt(usize);
            try std.testing.expectError(error.OutOfMemory, result);
            try std.testing.expectEqual(revision, history.revision());
            try expectBytes(session, before);
            try std.testing.expect(try history.redo(session));
            try std.testing.expect(try history.undo(session));
            try std.testing.expect(try history.apply(session, .{ .set_cell_fills = &req }));
            try expectFills(session, &req);
        }
    }
}

test "cell fill batch HWP5 sparse left color plus hatch uses one style transaction without normalizing mixed borders" {
    const original = try fixture();
    defer a.free(original);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try edit.Session.open(a, original);
        defer session.close();
        var req = try owners(session);
        req[0].fill = variants[2];
        req[1].fill = variants[2];
        const before_ids = try ids(session, &req);
        var before_info = try session.formattingSource(a);
        defer before_info.deinit();
        const before = try saved(session);
        defer a.free(before);
        const colors = [_]u32{ 0x123456, 0x010203 };
        const raw_colors = [_]u32{ 0x563412, 0x030201 };
        var styles: [2]StyleRequest = undefined;
        for (req, colors, &styles) |owner, color, *style| {
            var patch: p.Patch = .{ .background = owner.fill };
            patch.border.edges[0] = .{ .color = color };
            style.* = .{ .section = owner.section, .table_node = owner.table_node, .list_node = owner.list_node, .patch = patch };
        }
        var history = try historyFor(a, session, mode);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .set_cell_styles = &styles }));
        try expectFills(session, &req);
        const current_ids = try ids(session, &req);
        var next_info = try session.formattingSource(a);
        defer next_info.deinit();
        for (before_ids, current_ids, raw_colors) |old_id, current_id, raw_color| {
            const old_payload = try resources.resource(before_info.bytes, old_id);
            const current_payload = try resources.resource(next_info.bytes, current_id);
            var expected: [32]u8 = undefined;
            @memcpy(&expected, old_payload[0..32]);
            std.mem.writeInt(u32, expected[4..8], raw_color, .little);
            // Exact raw comparison preserves every pre-existing width/style and other edge.
            try std.testing.expectEqualSlices(u8, &expected, current_payload[0..32]);
        }
        const changed = try saved(session);
        defer a.free(changed);
        try expectPreserved(original, changed, &req, current_ids);
        try std.testing.expect(!try history.apply(session, .{ .set_cell_styles = &styles }));
        try std.testing.expect(try history.undo(session));
        try expectBytes(session, before);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(try history.redo(session));
        try expectBytes(session, changed);
        try std.testing.expect(!try history.redo(session));
    }
}
test "cell fill batch HWP5 invalid trailing sparse style owner rolls back fill and color while retaining redo" {
    const original = try fixture();
    defer a.free(original);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try edit.Session.open(a, original);
        defer session.close();
        const req = try owners(session);
        var history = try historyFor(a, session, mode);
        defer history.deinit();
        try std.testing.expect(try history.apply(session, .{ .set_cell_fills = req[0..1] }));
        try std.testing.expect(try history.undo(session));
        const before = try saved(session);
        defer a.free(before);
        const revision = history.revision();
        var styles: [2]StyleRequest = undefined;
        for (req, &styles) |owner, *style| {
            var patch: p.Patch = .{ .background = variants[2] };
            patch.border.edges[0] = .{ .color = 0x123456 };
            style.* = .{ .section = owner.section, .table_node = owner.table_node, .list_node = owner.list_node, .patch = patch };
        }
        styles[1].list_node = std.math.maxInt(u32);
        try std.testing.expectError(error.InvalidCellDisplayOwner, history.apply(session, .{ .set_cell_styles = &styles }));
        try std.testing.expectEqual(revision, history.revision());
        try expectBytes(session, before);
        try std.testing.expect(try history.redo(session));
        try std.testing.expect(try history.undo(session));
        try expectBytes(session, before);
    }
}

fn expectPendingForeground(session: *const edit.Session, req: []const Request, color: u32, foreground: u32) !void {
    const current_ids = try ids(session, req);
    var info = try session.formattingSource(a);
    defer info.deinit();
    const payload = try resources.resource(info.bytes, current_ids[0]);
    const actual = try @import("hwp5/docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(payload, .observed_absent);
    try std.testing.expectEqual(@as(u32, 1), actual.fill.flags);
    try std.testing.expectEqual(@as(i32, -1), actual.fill.data.known.pattern.?.kind);
    try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(color), actual.fill.data.known.pattern.?.background);
    try std.testing.expectEqual(@import("model/rgb_color.zig").hwp5(foreground), actual.fill.data.known.pattern.?.foreground);
}

test "cell fill batch HWP5 pending hatch foreground precedes source nofill solid fallback undo redo reopen" {
    const original = try fixture();
    defer a.free(original);
    const seed = try edit.Session.open(a, original);
    defer seed.close();
    var seed_req = try owners(seed);
    seed_req[0].fill = .none;
    try seed.applyCellFills(seed_req[0..1]);
    // Reopen a real saved source whose selected original resource is no-fill.
    // The on-disk original fixture is never modified or replaced.
    const nofill_source = try saved(seed);
    defer a.free(nofill_source);
    for ([_]u8{ 0, 1, 2 }) |mode| {
        const session = try edit.Session.open(a, nofill_source);
        defer session.close();
        var req = try owners(session);
        const source_ids = try ids(session, &req);
        var source_info = try session.formattingSource(a);
        defer source_info.deinit();
        const before = try payloads.observe(try resources.resource(source_info.bytes, source_ids[0]));
        try std.testing.expectEqualDeep(@as(?p.Background, .none), before.background);
        req[0].fill = .{ .hatch = .{ .face = 0x123456, .hatch = 0x654321, .style = .HORIZONTAL } };
        try session.applyCellFills(req[0..1]);
        const pending_hatch = try saved(session);
        defer a.free(pending_hatch);
        var history = try historyFor(a, session, mode);
        defer history.deinit();
        req[0].fill = .{ .solid = .{ .color = 0xabcdef } };
        try std.testing.expect(try history.apply(session, .{ .set_cell_fills = req[0..1] }));
        try expectPendingForeground(session, &req, 0xabcdef, 0x654321);
        const solid = try saved(session);
        defer a.free(solid);
        try std.testing.expect(!try history.apply(session, .{ .set_cell_fills = req[0..1] }));
        try std.testing.expect(try history.undo(session));
        try expectBytes(session, pending_hatch);
        try std.testing.expect(!try history.undo(session));
        try std.testing.expect(try history.redo(session));
        try expectBytes(session, solid);
        try expectPendingForeground(session, &req, 0xabcdef, 0x654321);
        const reopened = try edit.Session.open(a, solid);
        defer reopened.close();
        try expectPendingForeground(reopened, &req, 0xabcdef, 0x654321);
        try expectBytes(reopened, solid);
    }
}
