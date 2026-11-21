//! Detached DocInfo candidate. No Session, History or source buffer is mutated.
const std = @import("std");
const BinData = @import("../docinfo/bin_data.zig").BinData;
const Version = @import("../version.zig").Version;
const ids = @import("create_single_ids.zig");
pub const Prepared = struct {
    bytes: []u8,
    ids: ids.Plan,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, version: Version, direct_names: []const []const u8, limit: usize) !Prepared {
    return prepareResource(a, input, version, direct_names, null, limit);
}
pub fn prepareEmbedding(a: std.mem.Allocator, input: []const u8, version: Version, direct_names: []const []const u8, extension: []const u8, limit: usize) !Prepared {
    if (!std.mem.eql(u8, extension, "png") and !std.mem.eql(u8, extension, "jpg")) return error.UnsupportedReplacementImageFormat;
    return prepareResource(a, input, version, direct_names, extension, limit);
}
fn prepareResource(a: std.mem.Allocator, input: []const u8, version: Version, direct_names: []const []const u8, extension: ?[]const u8, limit: usize) !Prepared {
    if (input.len > limit) return error.LimitExceeded;
    var records: std.ArrayList(BinData) = .empty;
    defer records.deinit(a);
    var it = @import("../record.zig").Iterator.init(input, .{});
    var declared: ?i32 = null;
    var mapping_offset: usize = 0;
    var insert_at: usize = 0;
    var in_mapping = false;
    var binary_owner = false;
    while (try it.next()) |record| {
        const end = record.offset + record.raw.len;
        if (record.tag == 17) {
            if (declared != null) return error.DuplicateIdMappings;
            if (record.level != 0) return error.InvalidDocInfoLevel;
            const mapping = try @import("../docinfo/id_mappings.zig").IdMappings.parse(record.payload, version);
            declared = mapping.get(.bin_data) orelse return error.MissingIdMappings;
            mapping_offset = record.offset + record.raw.len - record.payload.len;
            insert_at = end;
            in_mapping = true;
        } else if (record.level == 0) in_mapping = false;
        if (record.tag == 18) {
            if (!in_mapping or record.level != 1) return error.InvalidDocInfoLevel;
            if (records.items.len >= std.math.maxInt(u16) - 1) return error.LimitExceeded;
            try records.append(a, try BinData.parse(record.payload));
            insert_at = end;
            binary_owner = true;
        } else if (binary_owner) {
            // Unknown children stay with their old resource, never the new one.
            if (record.level > 1) insert_at = end else binary_owner = false;
        }
    }
    const count = declared orelse return error.MissingIdMappings;
    if (count < 0) return error.NegativeMappingCount;
    if (@as(usize, @intCast(count)) != records.items.len) return error.ResourceCountMismatch;
    const allocated = try ids.plan(records.items, direct_names);
    // Exactly one uncompressed resource: STORAGE for chart, EMBEDDING for picture.
    // Chart retains its original four-byte payload and independent presentation.
    var payload: [12]u8 = @splat(0);
    std.mem.writeInt(u16, payload[0..2], if (extension != null) 0x21 else 0x22, .little);
    std.mem.writeInt(u16, payload[2..4], allocated.physical, .little);
    const length: usize = if (extension) |ext| blk: {
        std.mem.writeInt(u16, payload[4..6], @intCast(ext.len), .little);
        for (ext, 0..) |value, i| std.mem.writeInt(u16, payload[6 + i * 2 ..][0..2], value, .little);
        break :blk 6 + ext.len * 2;
    } else 4;
    const output = try @import("../edit/docinfo_resource_append.zig").write(a, input, insert_at, mapping_offset, count, 18, payload[0..length], limit);
    return .{ .bytes = output, .ids = allocated };
}
