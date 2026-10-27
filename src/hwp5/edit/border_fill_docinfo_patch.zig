//! 기존 BorderFill record는 byte 보존하고 새 one-based ID만 발급합니다.
const std = @import("std");
const mappings = @import("../docinfo/id_mappings.zig");
pub const Result = struct { bytes: []u8, id: u16 };
pub fn write(a: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, source_id: u32, patch: @import("../../model/border_fill_patch.zig").Patch, limit: usize) !Result {
    if (source_id == 0) return error.MissingBorderFillReference;
    if (input.len > limit) return error.LimitExceeded;
    var it = @import("../record.zig").Iterator.init(input, .{});
    var count: usize = 0;
    var declared: i32 = 0;
    var offset: ?usize = null;
    var insertion: ?usize = null;
    var source: ?[]const u8 = null;
    var selected = false;
    while (try it.next()) |record| {
        if (record.tag == 17) {
            if (offset != null) return error.DuplicateIdMappings;
            const map = try mappings.IdMappings.parse(record.payload, version);
            declared = map.get(.border_fill) orelse return error.MissingIdMappings;
            offset = record.offset + record.raw.len - record.payload.len + @backingInt(mappings.Field.border_fill) * 4;
        }
        if (record.tag == 20) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            count += 1;
            selected = count == source_id;
            if (selected) source = record.payload;
            insertion = record.offset + record.raw.len;
        } else if (selected and record.level > 1) return error.UnsupportedBorderFillChildren else selected = false;
    }
    if (declared < 0 or @as(usize, @intCast(declared)) != count) return error.ResourceCountMismatch;
    if (count >= std.math.maxInt(u16)) return error.InvalidBorderFillReference;
    const payload = try @import("border_fill_payload_patch.zig").write(a, source orelse return error.InvalidBorderFillReference, patch, limit);
    defer a.free(payload);
    return .{ .bytes = try @import("docinfo_resource_append.zig").write(a, input, insertion orelse return error.MissingBorderFillReference, offset orelse return error.MissingIdMappings, declared, 20, payload, limit), .id = @intCast(count + 1) };
}
pub fn resource(input: []const u8, id: u32) ![]const u8 {
    if (id == 0) return error.MissingBorderFillReference;
    var it = @import("../record.zig").Iterator.init(input, .{});
    var count: u32 = 0;
    while (try it.next()) |r| if (r.tag == 20) {
        count += 1;
        if (count == id) return r.payload;
    };
    return error.InvalidBorderFillReference;
}
