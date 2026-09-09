const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;

pub fn readOptions(r: *core.Reader, limit: usize) !core.image.jpeg_progressive_frame.Options {
    const policy = try r.readInt(u8);
    if (policy > 1) return error.InvalidJpegCompletionPolicy;
    const trailing = try r.readInt(u8);
    const stored = try r.readInt(u32);
    const storage_bytes = try r.readInt(u32);
    const visits = try r.readInt(u32);
    const scans = try r.readInt(u32);
    const restarts = try r.readInt(u32);
    const pixels = try r.readInt(u64);
    return .{ .completion = if (policy == 0) .preserve_partial else .require_full, .structure = .{ .allow_trailing_bytes = trailing != 0, .max_scans = scans, .max_restarts = restarts, .frame = .{ .max_pixels = pixels }, .markers = .{ .max_bytes = limit } }, .storage = .{ .max_blocks = stored, .max_bytes = storage_bytes }, .max_block_visits = visits };
}

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    var options = try readOptions(&r, limit);
    options.storage.max_bytes = @min(options.storage.max_bytes, limit);
    var image = try core.image.jpeg_progressive_frame.decode(a, bytes[r.offset..], options);
    defer image.deinit(a);
    if (48 + @as(u64, image.planes.len) * 232 + @as(u64, image.stored_blocks) * 256 > limit) return error.LimitExceeded;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for ([_]usize{ image.width, image.height, image.precision, image.planes.len, image.stored_blocks, image.block_visits, image.progression.scans, image.restarts, image.progression.unseen_coefficients, image.progression.partial_coefficients, image.progression.full_coefficients, image.trailing_bytes }) |value| try int(a, &out, u32, @intCast(value));
    for (image.planes) |*plane| {
        const table = if (plane.quantization) |*q| q.view() else null;
        for ([_]usize{ plane.component.id, plane.component.sampling, plane.component.quantization, plane.visible.width, plane.visible.height, plane.grid.extent.width, plane.grid.extent.height, @intFromBool(table != null), if (table) |q| q.precision else 255, if (table) |q| q.destination else 255 }) |value| try int(a, &out, u32, @intCast(value));
        try out.appendSlice(a, &plane.levels);
        for (0..64) |k| try int(a, &out, u16, if (table) |q| q.value(k).? else 0);
        for (plane.grid.values) |block| for (block) |value| try int(a, &out, i32, value);
    }
    return out.toOwnedSlice(a);
}
