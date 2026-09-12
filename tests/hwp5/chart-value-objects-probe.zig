const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const Value = core.hwp5.chart_value_object.Value;
fn raw(a: std.mem.Allocator, out: *std.ArrayList(u8), value: Value) !void {
    switch (value) {
        .string => |s| try out.appendSlice(a, s.bytes),
        .number => |n| try int(a, out, u64, n.bits),
    }
}
// Test-only grid scope. Values are read by the shared object resolver; every
// non-null slot is immediately resolved again from its four-byte ID alone.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const per = try input.readInt(u32);
    const total = try input.readInt(u32);
    const max_objects = try input.readInt(u32);
    const contents = bytes[input.offset..];
    if (contents.len > limit) return error.LimitExceeded;
    var head = try core.hwp5.chart_grid_prelude.readObservedV6(a, contents, .{});
    defer head.deinit();
    var objects = core.hwp5.chart_object_table.Table.init(a, .{ .max_objects = max_objects, .max_string_bytes = per, .max_total_string_bytes = total });
    defer objects.deinit();
    var reader: core.Reader = .{ .bytes = contents, .offset = head.payload_offset };
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, &@as([28]u8, @splat(0)));
    const count = @as(usize, head.rows) * head.columns;
    for (0..count) |_| {
        const start = reader.offset;
        var peek = reader;
        if (try peek.readInt(u32) == 0xffffffff) {
            reader = peek;
            for ([_]usize{ 0xffffffff, 0, start, reader.offset, 0, 0, 0, 0, 0 }) |field| try int(a, &out, u32, @intCast(field));
            continue;
        }
        const ref = try objects.readValueObservedV1(&reader, &head.types, per);
        const id = switch (ref.value) {
            .string => |s| s.object_id,
            .number => |n| n.object_id,
        };
        var id_bytes: [4]u8 = undefined;
        std.mem.writeInt(u32, &id_bytes, id, .little);
        var lookup: core.Reader = .{ .bytes = &id_bytes };
        const again = try objects.readValueObservedV1(&lookup, &head.types, per);
        const kind: u32 = if (ref.value == .string) 1 else 2;
        const length = switch (ref.value) {
            .string => |s| s.bytes.len,
            .number => 8,
        };
        const trailer: u16 = switch (ref.value) {
            .string => |s| s.trailer,
            .number => |n| n.trailer,
        };
        inline for (.{ id, kind, start, reader.offset, trailer, length, @intFromBool(ref.introduced), @intFromBool(again.introduced), lookup.offset }) |field| try int(a, &out, u32, @intCast(field));
        try raw(a, &out, ref.value);
        try raw(a, &out, again.value);
    }
    const fields = [_]usize{ head.rows, head.columns, count, reader.offset, head.types.definitions.count(), objects.entries.count(), objects.string_bytes };
    for (fields, 0..) |field, i| std.mem.writeInt(u32, out.items[i * 4 ..][0..4], @intCast(field), .little);
    return out.toOwnedSlice(a);
}
