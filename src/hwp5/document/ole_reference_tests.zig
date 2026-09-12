const std = @import("std");
const t = std.testing;
const f = @import("test_fixture.zig");
const d = @import("validation.zig");
const framing = @import("../record.zig");
const rules = @import("../body/control_rules.zig");

fn section(a: std.mem.Allocator, id: u16) ![]u8 {
    const base = try f.section(a);
    defer a.free(base);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var it = framing.Iterator.init(base, .{});
    while (try it.next()) |record| {
        if (record.tag == 66) {
            const p = try a.dupe(u8, record.payload);
            defer a.free(p);
            f.put(p, 0, u32, 16);
            try f.frame(a, &out, record.tag, record.level, p);
        } else if (record.tag == 67) {
            var p = [_]u8{0} ** 32;
            @memcpy(p[0..16], record.payload);
            f.put(&p, 16, u16, 11);
            f.put(&p, 18, u32, rules.drawing_id);
            f.put(&p, 30, u16, 11);
            try f.frame(a, &out, record.tag, record.level, &p);
        } else try f.frame(a, &out, record.tag, record.level, record.payload);
    }
    var control = [_]u8{0} ** 44;
    f.put(&control, 0, u32, rules.drawing_id);
    try f.frame(a, &out, 71, 1, &control);
    var component = [_]u8{0} ** 100;
    f.put(&component, 0, u32, rules.id("$ole"));
    f.put(&component, 4, u32, rules.id("$ole"));
    try f.frame(a, &out, 76, 2, &component);
    var payload = [_]u8{0} ** 26;
    f.put(&payload, 0, u32, 1);
    f.put(&payload, 12, u16, id);
    try f.frame(a, &out, 84, 3, &payload);
    return out.toOwnedSlice(a);
}

fn check(a: std.mem.Allocator, second_id: u16) !void {
    const header = f.header();
    const original_info = try f.docInfo(a, 2);
    defer a.free(original_info);
    var it = framing.Iterator.init(original_info, .{});
    while (try it.next()) |record| if (record.tag == 17) {
        f.put(original_info, record.offset + record.raw.len - record.payload.len, u32, 1);
    };
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    try info.appendSlice(a, original_info);
    try f.frame(a, &info, 18, 1, &.{ 2, 0, 3, 0 });
    const first = try section(a, 1);
    defer a.free(first);
    const second = try section(a, second_id);
    defer a.free(second);
    // Input order differs from logical section order; failure must occur late.
    const sections = [_]d.types.Section{ .{ .index = 1, .bytes = second }, .{ .index = 0, .bytes = first } };
    const input: d.Input = .{ .header = &header, .doc_info = info.items, .sections = &sections };
    var options: d.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    var unselected = try d.inspectDecoded(a, input, options);
    defer unselected.deinit(a);
    for (unselected.sections) |s| {
        try t.expectEqual(@as(usize, 1), s.ole.pending_references);
        try t.expectEqual(@as(usize, 1), s.ole_references.unselected_references);
    }
    options.ole_references = .observed_ordinal;
    var selected = d.inspectDecoded(a, input, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        if (second_id > 1) {
            try t.expectEqual(error.InvalidOleBinaryReference, err);
            return;
        }
        return err;
    };
    defer selected.deinit(a);
    try t.expect(second_id <= 1);
    try t.expectEqual(unselected.total_records, selected.total_records);
    try t.expectEqual(unselected.total_bytes, selected.total_bytes);
    try t.expectEqual(@as(usize, 1), selected.sections[0].ole_references.ordinal_references);
    try t.expectEqual(@as(usize, @intFromBool(second_id != 0)), selected.sections[1].ole_references.ordinal_references);
    try t.expectEqual(@as(usize, @intFromBool(second_id == 0)), selected.sections[1].ole.pending_references);
}

test "OLE document ordinal selection cleans success zero and late failure under OOM" {
    for ([_]u16{ 0, 1, 2 }) |id| {
        try check(t.allocator, id);
        var debug: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(debug.deinit() == .ok) catch @panic("OleReferenceLeak");
        try check(debug.allocator(), id);
        try t.expectEqual(@as(usize, 0), debug.total_requested_bytes);
        try t.checkAllAllocationFailures(t.allocator, check, .{id});
    }
}
