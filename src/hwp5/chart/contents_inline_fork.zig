const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Objects = @import("object_table.zig");
const ids = @import("object_ids.zig");
const patches = @import("contents_patch.zig");
const strings = @import("string_wire.zig");

pub const Prepared = struct {
    target: []u8,
    target_start: usize,
    target_end: usize,
    relocation: ?[]u8,
    relocation_start: usize,
    relocation_end: usize,
    pub fn deinit(self: Prepared, a: std.mem.Allocator) void {
        if (self.relocation) |value| a.free(value);
        a.free(self.target);
    }
};
pub const Span = struct { start: usize, end: usize };
const Inspection = struct { length_start: usize, payload_end: usize, next_alias: ?Objects.ReferenceSpan };

/// Gives one introduced String site a new identity. If the old identity has
/// later aliases, its original definition is relocated to the first alias so
/// every other consumer keeps the old bytes and trailer.
pub fn forkIntroduced(a: std.mem.Allocator, value: *const Contents, target: *const Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const prepared = try prepare(a, value, target, new_object_id, bytes, trailer);
    defer prepared.deinit(a);
    if (prepared.relocation) |relocation|
        return patches.applyOriginal(a, value, &.{ .{ .start = prepared.target_start, .end = prepared.target_end, .replacement = prepared.target }, .{ .start = prepared.relocation_start, .end = prepared.relocation_end, .replacement = relocation } }, max_output_bytes);
    return patches.applyOriginal(a, value, &.{.{ .start = prepared.target_start, .end = prepared.target_end, .replacement = prepared.target }}, max_output_bytes);
}

pub fn prepare(a: std.mem.Allocator, value: *const Contents, target: *const Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8) !Prepared {
    return prepareAvoiding(a, value, target, new_object_id, bytes, trailer, &.{});
}

pub fn prepareAvoiding(a: std.mem.Allocator, value: *const Contents, target: *const Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8, excluded: []const Span) !Prepared {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(new_object_id);
    if (value.prefix.objects.entries.contains(new_object_id)) return error.DuplicateChartObjectId;
    const inspected = try inspectIntroduced(value, target, excluded);
    const source = value.source;
    const target_len = target.end - target.start - (inspected.payload_end - inspected.length_start) + bytes.len + 3;
    const replacement = try a.alloc(u8, target_len);
    errdefer a.free(replacement);
    const prefix_len = inspected.length_start - target.start;
    @memcpy(replacement[0..prefix_len], source[target.start..inspected.length_start]);
    std.mem.writeInt(u32, replacement[0..4], new_object_id, .little);
    std.mem.writeInt(u16, replacement[prefix_len..][0..2], @intCast(bytes.len), .little);
    @memcpy(replacement[prefix_len + 2 ..][0..bytes.len], bytes);
    replacement[prefix_len + 2 + bytes.len] = trailer;
    @memcpy(replacement[prefix_len + 3 + bytes.len ..], source[inspected.payload_end..target.end]);

    if (inspected.next_alias) |alias| {
        const relocated = try strings.serializeKnown(a, value, target.value.object_id, target.value.bytes, target.value.trailer);
        return .{ .target = replacement, .target_start = target.start, .target_end = target.end, .relocation = relocated, .relocation_start = alias.start, .relocation_end = alias.end };
    }
    return .{ .target = replacement, .target_start = target.start, .target_end = target.end, .relocation = null, .relocation_start = 0, .relocation_end = 0 };
}

/// Replaces a known-type inline String definition with a null slot. Any later
/// aliases retain the old identity through the same relocation contract used
/// by String forking.
pub fn prepareNullAvoiding(a: std.mem.Allocator, value: *const Contents, target: *const Objects.Reference, excluded: []const Span) !Prepared {
    const inspected = try inspectIntroduced(value, target, excluded);
    if (target.end - target.start != target.value.bytes.len + 19) return error.ChartGridCellOwnsTypeDeclaration;
    const replacement = try a.alloc(u8, 4);
    @memset(replacement, 0xff);
    if (inspected.next_alias) |alias| {
        const relocated = try strings.serializeKnown(a, value, target.value.object_id, target.value.bytes, target.value.trailer);
        return .{ .target = replacement, .target_start = target.start, .target_end = target.end, .relocation = relocated, .relocation_start = alias.start, .relocation_end = alias.end };
    }
    return .{ .target = replacement, .target_start = target.start, .target_end = target.end, .relocation = null, .relocation_start = 0, .relocation_end = 0 };
}

fn inspectIntroduced(value: *const Contents, target: *const Objects.Reference, excluded: []const Span) !Inspection {
    if (!target.introduced) return error.ExpectedInlineChartString;
    const registered = switch (value.prefix.objects.entries.get(target.value.object_id) orelse return error.InvalidChartStringReferenceGraph) {
        .string => |string| string,
        else => return error.InvalidChartStringReferenceGraph,
    };
    if (registered.object_id != target.value.object_id or registered.bytes.ptr != target.value.bytes.ptr or registered.bytes.len != target.value.bytes.len or registered.trailer != target.value.trailer)
        return error.InvalidChartStringReferenceGraph;

    const source = value.source;
    if (target.start > target.end or target.end > source.len or target.end - target.start < 7)
        return error.InvalidChartStringDefinitionSpan;
    if (std.mem.readInt(u32, source[target.start..][0..4], .little) != target.value.object_id)
        return error.InvalidChartStringDefinitionSpan;
    const source_address = @intFromPtr(source.ptr);
    const payload_address = @intFromPtr(target.value.bytes.ptr);
    if (payload_address < source_address) return error.InvalidChartStringDefinitionSpan;
    const payload_start = payload_address - source_address;
    if (payload_start < target.start + 2 or payload_start > target.end or target.value.bytes.len > target.end - payload_start)
        return error.InvalidChartStringDefinitionSpan;
    const length_start = payload_start - 2;
    const payload_end = payload_start + target.value.bytes.len + 1;
    if (payload_end > target.end or std.mem.readInt(u16, source[length_start..][0..2], .little) != target.value.bytes.len or source[payload_end - 1] != target.value.trailer)
        return error.InvalidChartStringDefinitionSpan;

    var matched_definition = false;
    var next_alias: ?Objects.ReferenceSpan = null;
    for (value.prefix.objects.references.items) |reference| {
        if (reference.object_id != target.value.object_id) continue;
        if (reference.start == target.start and reference.end == target.end and reference.introduced) {
            if (matched_definition) return error.InvalidChartStringReferenceGraph;
            matched_definition = true;
            continue;
        }
        if (reference.introduced or reference.start < target.end or reference.end - reference.start != 4)
            return error.InvalidChartStringReferenceGraph;
        var edited = false;
        for (excluded) |span| if (span.start == reference.start and span.end == reference.end) {
            edited = true;
            break;
        };
        if (edited) continue;
        if (next_alias == null or reference.start < next_alias.?.start) next_alias = reference;
    }
    if (!matched_definition) return error.InvalidChartStringReferenceGraph;

    return .{ .length_start = length_start, .payload_end = payload_end, .next_alias = next_alias };
}
