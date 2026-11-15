const std = @import("std");
const query = @import("equation_sources.zig");
const a = std.testing.allocator;
const version = @import("../version.zig").Version{ .raw = 0x05010001 };
// 독립 고정 바이트: 속성1, UTF16LE A/NUL/짝 없는 서로게이트,
// 크기1000, 색0x00112233, 기준선-2, 미상7, 버전 v.
const payload = [_]u8{ 1, 0, 0, 0, 3, 0, 65, 0, 0, 0, 0, 0xd8, 0xe8, 3, 0, 0, 0x33, 0x22, 0x11, 0, 0xfe, 0xff, 7, 0, 1, 0, 118, 0 };
const owner = [_]u8{ 'd', 'e', 'q', 'e' };

fn record(out: *std.ArrayList(u8), tag: u32, level: u32, bytes: []const u8) !void {
    const bits = tag | (level << 10) | (@as(u32, @intCast(bytes.len)) << 20);
    var header: [4]u8 = undefined;
    std.mem.writeInt(u32, &header, bits, .little);
    try out.appendSlice(a, &header);
    try out.appendSlice(a, bytes);
}
fn section(out: *std.ArrayList(u8), bytes: []const u8) !void {
    try record(out, 71, 0, &owner);
    try record(out, 88, 1, bytes);
}

test "equation query preserves independent wire values and input borrowing" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try section(&raw, &payload);
    const rows = try query.read(a, raw.items, version, .version_only, .{});
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    const p = rows[0];
    try std.testing.expectEqual(@as(usize, 0), p.control_node);
    try std.testing.expectEqual(@as(usize, 1), p.equation_node);
    try std.testing.expectEqual(@as(u32, 1), p.attributes);
    try std.testing.expectEqual(@as(u32, 1000), p.font_size);
    try std.testing.expectEqual(@as(u32, 0x112233), p.color);
    try std.testing.expectEqual(@as(i16, -2), p.baseline);
    try std.testing.expectEqual(@as(u16, 7), p.unknown);
    try std.testing.expectEqualSlices(u8, &.{ 65, 0, 0, 0, 0, 0xd8 }, p.script);
    try std.testing.expectEqualSlices(u8, &.{ 118, 0 }, p.version_info);
    try std.testing.expect(p.font_name == null);
    try std.testing.expectEqual(@intFromPtr(raw.items.ptr) + 18, @intFromPtr(p.script.ptr));
}

test "equation query explicit layout retains rather than guesses font tail" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try section(&raw, &(payload ++ [_]u8{ 1, 0, 70, 0, 0xab }));
    const base = try query.read(a, raw.items, version, .version_only, .{});
    defer a.free(base);
    try std.testing.expect(base[0].font_name == null);
    try std.testing.expectEqualSlices(u8, &.{ 1, 0, 70, 0, 0xab }, base[0].extra);
    const full = try query.read(a, raw.items, version, .with_font, .{});
    defer a.free(full);
    try std.testing.expectEqualSlices(u8, &.{ 70, 0 }, full[0].font_name.?);
    try std.testing.expectEqualSlices(u8, &.{0xab}, full[0].extra);
}

test "equation query rejects missing duplicate orphan and unrelated parent" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try record(&raw, 71, 0, &owner);
    try std.testing.expectError(error.MissingEquation, query.read(a, raw.items, version, .version_only, .{}));
    try record(&raw, 88, 1, &payload);
    try record(&raw, 88, 1, &payload);
    try std.testing.expectError(error.DuplicateEquation, query.read(a, raw.items, version, .version_only, .{}));
    raw.clearRetainingCapacity();
    try record(&raw, 88, 0, &payload);
    try std.testing.expectError(error.OrphanEquation, query.read(a, raw.items, version, .version_only, .{}));
    raw.clearRetainingCapacity();
    try record(&raw, 71, 0, &.{ ' ', 'l', 'b', 't' });
    try record(&raw, 88, 1, &payload);
    try std.testing.expectError(error.OrphanEquation, query.read(a, raw.items, version, .version_only, .{}));
}

test "equation query rejects every truncated payload and enforces budgets" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    for (0..payload.len) |len| {
        raw.clearRetainingCapacity();
        try section(&raw, payload[0..len]);
        try std.testing.expectError(error.UnexpectedEnd, query.read(a, raw.items, version, .version_only, .{}));
    }
    raw.clearRetainingCapacity();
    try section(&raw, &payload);
    try std.testing.expectError(error.LimitExceeded, query.read(a, raw.items, version, .version_only, .{ .max_equations = 0 }));
    try std.testing.expectError(error.LimitExceeded, query.read(a, raw.items, version, .version_only, .{ .max_script_bytes = 5 }));
    try std.testing.expectError(error.LimitExceeded, query.read(a, raw.items, version, .version_only, .{ .records = .{ .max_records = 1 } }));
    try std.testing.expectError(error.UnexpectedEnd, query.read(a, raw.items, version, .with_font, .{}));
    const exact = try query.read(a, raw.items, version, .version_only, .{ .max_script_bytes = 6, .max_equations = 1 });
    defer a.free(exact);
}

fn allocationProbe(allocator: std.mem.Allocator, raw: []const u8) !void {
    const rows = try query.read(allocator, raw, version, .version_only, .{});
    defer allocator.free(rows);
}
test "equation query allocation failures release all owned storage" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try section(&raw, &payload);
    try std.testing.checkAllAllocationFailures(a, allocationProbe, .{raw.items});
}

test "equation query aggregate budget and late failure leave source unchanged" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try section(&raw, &payload);
    try section(&raw, &payload);
    const original = try a.dupe(u8, raw.items);
    defer a.free(original);
    try std.testing.expectError(error.LimitExceeded, query.read(a, raw.items, version, .version_only, .{ .max_script_bytes = 11 }));
    const rows = try query.read(a, raw.items, version, .version_only, .{ .max_script_bytes = 12 });
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expectEqual(@as(usize, 2), rows[1].control_node);
    try std.testing.expectEqualSlices(u8, original, raw.items);
    try record(&raw, 71, 0, &owner);
    try std.testing.expectError(error.MissingEquation, query.read(a, raw.items, version, .version_only, .{}));
}

test "equation query empty and unrelated records never invent equation sites" {
    const empty = try query.read(a, &.{}, version, .version_only, .{});
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try record(&raw, 999, 0, &payload);
    const unknown = try query.read(a, raw.items, version, .version_only, .{});
    defer a.free(unknown);
    try std.testing.expectEqual(@as(usize, 0), unknown.len);
    try std.testing.expectError(error.UnsupportedVersion, query.read(a, raw.items, .{ .raw = 0x06000000 }, .version_only, .{}));
}

const anchor = [_]u8{ 11, 0, 'd', 'e', 'q', 'e', 0, 0, 0, 0, 0, 0, 0, 0, 11, 0 };
fn anchoredSection(out: *std.ArrayList(u8), equation_payload: []const u8) !void {
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 8, .little);
    try record(out, 66, 0, &header);
    try record(out, 67, 1, &anchor);
    try record(out, 71, 1, &(owner ++ @as([40]u8, @splat(0))));
    try record(out, 88, 2, equation_payload);
}
fn paragraph(tokens: []@import("../../model/document.zig").Token) @import("../../model/document.zig").Paragraph {
    return .{ .source_node = 0, .parent_node = null, .declared_units = 8, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = tokens, .character_runs = &.{}, .deferred_direct_records = 0 };
}

test "equation query sites bind source links to current anchors without script parsing" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try anchoredSection(&raw, &.{});
    var control = anchor;
    var prefix = [_]u8{ 88, 0, 89, 0 };
    var tokens = [_]@import("../../model/document.zig").Token{
        .{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = &prefix },
        .{ .start_unit = 2, .kind = .control, .encoding = .utf16le, .raw = &control },
    };
    const rows = try query.sites(a, raw.items, version, &.{paragraph(&tokens)}, .{});
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(@as(usize, 2), rows[0].control_node);
    try std.testing.expectEqual(@as(usize, 3), rows[0].equation_node);
    try std.testing.expectEqual(@as(usize, 0), rows[0].paragraph_node);
    try std.testing.expectEqual(@as(usize, 0), rows[0].source_unit);
    try std.testing.expectEqual(@as(u32, 2), rows[0].current_unit);
    try std.testing.expectError(error.UnexpectedEnd, query.readSelected(a, raw.items, version, 3, .version_only, .{}));
    control[2] = 0;
    try std.testing.expectError(error.SourceBindingMismatch, query.sites(a, raw.items, version, &.{paragraph(&tokens)}, .{}));
    try std.testing.expectError(error.MissingCurrentControlAnchor, query.sites(a, raw.items, version, &.{paragraph(&.{})}, .{}));
    try std.testing.expectError(error.MissingCurrentEquationAnchor, query.sites(a, raw.items, version, &.{}, .{}));
}

fn sitesAllocationProbe(allocator: std.mem.Allocator, raw: []const u8, current: []const @import("../../model/document.zig").Paragraph) !void {
    const rows = try query.sites(allocator, raw, version, current, .{});
    defer allocator.free(rows);
}
test "equation query sites and selected detail preserve identity and allocation ownership" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try anchoredSection(&raw, &payload);
    var control = anchor;
    var tokens = [_]@import("../../model/document.zig").Token{.{ .start_unit = 0, .kind = .control, .encoding = .utf16le, .raw = &control }};
    const p = paragraph(&tokens);
    try std.testing.checkAllAllocationFailures(a, sitesAllocationProbe, .{ raw.items, @as([]const @import("../../model/document.zig").Paragraph, &.{p}) });
    try std.testing.expectError(error.SourceBindingMismatch, query.sites(a, raw.items, version, &.{ p, p }, .{}));
    try std.testing.expectError(error.InvalidEquationNode, query.readSelected(a, raw.items, version, 2, .version_only, .{}));
    const selected = try query.readSelected(a, raw.items, version, 3, .version_only, .{});
    try std.testing.expectEqualSlices(u8, &.{ 65, 0, 0, 0, 0, 0xd8 }, selected.script);
}

fn wireAllocationProbe(allocator: std.mem.Allocator, site: query.Site, source: query.Source) !void {
    const bytes = try @import("../../wasm/hwp5_equation_sources.zig").encodeSource(allocator, site, source, .version_only);
    defer allocator.free(bytes);
}
test "equation query wire uses numeric UTF16 units rather than JSON text" {
    const wire = @import("../../wasm/hwp5_equation_sources.zig");
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try anchoredSection(&raw, &payload);
    const selected = try query.readSelected(a, raw.items, version, 3, .version_only, .{});
    const site: query.Site = .{ .control_node = 2, .equation_node = 3, .paragraph_node = 0, .paragraph = 0, .source_unit = 0, .current_unit = 0 };
    const bytes = try wire.encodeSource(a, site, selected, .version_only);
    defer a.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const words = parsed.value.object.get("scriptUtf16LE").?.array.items;
    try std.testing.expectEqual(@as(i64, 65), words[0].integer);
    try std.testing.expectEqual(@as(i64, 0), words[1].integer);
    try std.testing.expectEqual(@as(i64, 0xd800), words[2].integer);
    try std.testing.expectError(error.InvalidEquationLayout, wire.layout(2));
    var wrong = site;
    wrong.equation_node = 9;
    try std.testing.expectError(error.SourceBindingMismatch, wire.encodeSource(a, wrong, selected, .version_only));
    try std.testing.checkAllAllocationFailures(a, wireAllocationProbe, .{ site, selected });
}

test "equation query selected detail never decodes an unrelated malformed script" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    try section(&raw, &payload);
    try section(&raw, &.{});
    const selected = try query.readSelected(a, raw.items, version, 1, .version_only, .{});
    try std.testing.expectEqual(@as(u32, 1000), selected.font_size);
    try std.testing.expectError(error.UnexpectedEnd, query.readSelected(a, raw.items, version, 3, .version_only, .{}));
    try std.testing.expectError(error.UnexpectedEnd, query.read(a, raw.items, version, .version_only, .{}));
}
