//! Prepared DocInfo only. Body/CFB/FileHeader conversion is not authorized.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Defaults = struct {
    character: @import("character_shape_migration.zig").Defaults = .{},
    paragraph_attributes2: ?u32 = null,
    auxiliary: ?@import("docinfo_migration_auxiliary.zig").Options = null,
};
pub const Draft = struct {
    source_version: Version,
    target_version: Version,
    bytes: []u8,
    character_records: usize,
    paragraph_records: usize,
    body_outline_references: usize,
    auxiliary_records: usize,
    complete_document: bool = false,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, input: []const u8, from: Version, to: Version, defaults: Defaults, limit: usize) !Draft {
    if (to.raw != 0x05000300 or from.raw > to.raw) return error.UnsupportedDocInfoTransitionTarget;
    const resources = try @import("../docinfo/resources.zig").inspect(input, from, .{});
    try resources.validateKnownCounts();
    const references = try @import("../docinfo/references.zig").inspect(input, from, .{});
    try references.validateKnown();
    const auxiliary = if (defaults.auxiliary) |options| try @import("docinfo_migration_auxiliary.zig").inspect(a, input, resources.bin_data_count, options) else 0;
    if (references.unknown_records != auxiliary) return error.UnsupportedDocInfoMigrationRecord;
    var semantic = try @import("../docinfo/reader.zig").Iterator.init(input, from, .{});
    var body_outlines: usize = 0;
    while (try semantic.next()) |record| if (record.value == .para_shape) {
        const shape = record.value.para_shape;
        if ((shape.attributes >> 23) & 3 == 1 and shape.head_id == 0) body_outlines += 1;
    };
    // Only the known section-default outline dependency may remain deferred.
    // Unknown fills, bullets and style kinds are never approved by this draft.
    if (references.deferred != body_outlines) return error.UnsupportedDocInfoMigrationRecord;
    if (defaults.character.border_fill_id) |id| if (id != 0 and id > resources.count(.border_fill)) return error.InvalidResourceReference;
    var iterator = @import("../record.zig").Iterator.init(input, .{});
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    var characters: usize = 0;
    var paragraphs: usize = 0;
    while (try iterator.next()) |record| {
        const payload: ?[]u8 = switch (record.tag) {
            17 => blk: {
                const target = try @import("../docinfo/id_mappings.zig").IdMappings.parse(record.payload, to);
                if (target.count() > target.expectedCount()) return error.UnsupportedIdMappingMigration;
                if (target.count() == target.expectedCount()) break :blk null;
                if (target.count() + 1 != target.expectedCount()) return error.UnsupportedIdMappingMigration;
                const bytes = try a.alloc(u8, record.payload.len + 4);
                @memcpy(bytes[0..record.payload.len], record.payload);
                std.mem.writeInt(i32, bytes[record.payload.len..][0..4], std.math.cast(i32, resources.memo_shape_count) orelse {
                    a.free(bytes);
                    return error.LimitExceeded;
                }, .little);
                break :blk bytes;
            },
            21 => blk: {
                characters += 1;
                break :blk try @import("character_shape_migration.zig").prepare(a, record.payload, from, to, defaults.character, limit);
            },
            25 => blk: {
                paragraphs += 1;
                const source = try @import("../docinfo/para_shape.zig").ParaShape.parse(record.payload, from);
                break :blk try @import("paragraph_shape_migration.zig").prepare(a, record.payload, from, to, if (source.attributes2 == null) defaults.paragraph_attributes2 else null, limit);
            },
            23 => blk: {
                const source = try @import("../docinfo/numbering.zig").Numbering.parse(record.payload, from);
                const target = try @import("../docinfo/numbering.zig").Numbering.parse(record.payload, to);
                if (source.extra.len != 0 or target.extra.len != 0 or (source.starts == null) != (target.starts == null)) return error.UnsupportedNumberingMigration;
                // Preserve EOF absence; never invent seven zero/one starts.
                break :blk null;
            },
            else => null,
        };
        defer if (payload) |bytes| a.free(bytes);
        if (payload) |bytes| {
            if (!std.mem.eql(u8, bytes, record.payload)) {
                try @import("../record_writer.zig").append(a, &out, record.tag, record.level, bytes, limit);
                continue;
            }
        }
        if (out.items.len > limit or record.raw.len > limit - out.items.len) return error.LimitExceeded;
        try out.appendSlice(a, record.raw);
    }
    const target = try @import("../docinfo/references.zig").inspect(out.items, to, .{});
    try target.validateKnown();
    const target_resources = try @import("../docinfo/resources.zig").inspect(out.items, to, .{});
    try target_resources.validateKnownCounts();
    const target_auxiliary = if (defaults.auxiliary) |options| try @import("docinfo_migration_auxiliary.zig").inspect(a, out.items, target_resources.bin_data_count, options) else 0;
    if (target.unknown_records != target_auxiliary or target_auxiliary != auxiliary or target.deferred != body_outlines) return error.UnsupportedDocInfoMigrationRecord;
    return .{ .source_version = from, .target_version = to, .bytes = try out.toOwnedSlice(a), .character_records = characters, .paragraph_records = paragraphs, .body_outline_references = body_outlines, .auxiliary_records = auxiliary };
}
