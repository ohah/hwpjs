//! Source resource IDs are Native-owned. No fake original-cell owners are made.
const std = @import("std");
const patch = @import("../../model/border_fill_patch.zig");
const Version = @import("../version.zig").Version;
const existing = @import("cell_background_write.zig");
pub const Request = struct { source_id: u16, patch: patch.Patch };
pub const Result = struct { bytes: []u8, ids: []u16, border_count: usize };
pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, requests: []const Request, limit: usize) !Result {
    var index = try existing.resourceIndex(a, input, version, limit);
    defer index.deinit(a);
    const ids = try a.alloc(u16, requests.len);
    errdefer a.free(ids);
    if (requests.len == 0) return .{ .bytes = try a.dupe(u8, input), .ids = ids, .border_count = index.resources.len };
    var clones = std.AutoHashMap(existing.CloneKey, u16).init(a);
    defer clones.deinit();
    var payloads: std.ArrayList([]u8) = .empty;
    defer {
        for (payloads.items) |payload| a.free(payload);
        payloads.deinit(a);
    }
    // Explicit new-output NONE/black profile for an owned table whose optional
    // HWP5 resource ID is zero. This never interprets an unknown old resource.
    const empty: [40]u8 = @splat(0);
    for (requests, ids) |request, *id| {
        const source = if (request.source_id == 0) existing.Resource{ .payload = &empty } else try index.resource(request.source_id);
        if (source.children) return error.UnsupportedBorderFillChildren;
        var change = request.patch;
        if (change.background != null and change.background.? == .solid and change.background.?.solid.hatch_color == null) {
            change.background = (try @import("cell_background_values.zig").solidPatch(source.payload, change.background.?.solid.color)).background;
        }
        const key = try existing.CloneKey.init(request.source_id, change);
        const slot = try clones.getOrPut(key);
        if (!slot.found_existing) {
            const payload = try @import("border_fill_payload_patch.zig").write(a, source.payload, change, limit);
            errdefer a.free(payload);
            if (std.mem.eql(u8, payload, source.payload)) {
                slot.value_ptr.* = request.source_id;
                a.free(payload);
            } else {
                if (index.resources.len + payloads.items.len >= std.math.maxInt(u16)) return error.InvalidBorderFillReference;
                try payloads.append(a, payload);
                slot.value_ptr.* = @intCast(index.resources.len + payloads.items.len);
            }
        }
        id.* = slot.value_ptr.*;
    }
    if (payloads.items.len == 0) return .{ .bytes = try a.dupe(u8, input), .ids = ids, .border_count = index.resources.len };
    const insertion = index.insertion orelse block: {
        var it = @import("../record.zig").Iterator.init(input, .{});
        while (try it.next()) |record| if (record.tag > 20 and record.level <= 1) break :block record.offset;
        break :block input.len;
    };
    const mapping = index.mapping orelse return error.MissingIdMappings;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, input[0..insertion]);
    for (payloads.items) |payload| try @import("../record_writer.zig").append(a, &out, 20, 1, payload, limit);
    if (input.len - insertion > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, input[insertion..]);
    std.mem.writeInt(i32, out.items[mapping..][0..4], @intCast(index.resources.len + payloads.items.len), .little);
    return .{ .bytes = try out.toOwnedSlice(a), .ids = ids, .border_count = index.resources.len + payloads.items.len };
}
