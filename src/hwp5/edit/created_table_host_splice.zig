//! Atomic current paragraph text and retained generated-table coordinates.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("created_table_values.zig").Values;
const anchors = @import("created_table_anchor.zig");
const Delta = @import("created_table_text_delta.zig").Delta;
const records = @import("created_table_records.zig");
const Mapping = struct { direct: ?Delta, derived: Delta, after: []const u8 };

fn key(host: anchors.Host) u64 {
    return switch (host) {
        .original_node => |node| node,
        .generated_instance => |id| (@as(u64, 1) << 32) | id,
    };
}

pub fn apply(a: std.mem.Allocator, raw: []const u8, section: *model.Section, pending: *Values, version: @import("../version.zig").Version, edit: @import("plain_text.zig").Splice, resources: records.Resources, limits: records.Limits) !void {
    if (edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    if (edit.end_unit < edit.start_unit) return error.InvalidTextPosition;
    var draft = try @import("../../model/clone.zig").section(a, section.*);
    defer draft.deinit(a);
    var tables = try pending.clone(a, limits.max_bytes);
    defer tables.deinit(a);
    try @import("paragraph_splice.zig").apply(a, raw, version, &draft, edit, resources.paragraphs.char_shapes);
    if (@import("../../model/equality.zig").semantic(model.Section, section.*, draft)) return;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var mappings: std.AutoHashMap(u64, Mapping) = .init(scratch);
    const target = try anchors.identity(section.paragraphs[edit.paragraph]);
    for (tables.entries) |*entry| {
        const slot = try mappings.getOrPut(key(entry.anchor.host));
        if (!slot.found_existing) {
            const pi = try anchors.resolve(scratch, section, .{ .host = entry.anchor.host, .unit = 0 });
            const ai = try anchors.resolve(scratch, &draft, .{ .host = entry.anchor.host, .unit = 0 });
            const before = try @import("plain_text_content.zig").editableTextBytes(scratch, section.paragraphs[pi]);
            const after = try @import("plain_text_content.zig").editableTextBytes(scratch, draft.paragraphs[ai]);
            var intermediate: []const u8 = before;
            var direct: ?Delta = null;
            if (std.meta.eql(entry.anchor.host, target)) {
                const inserted = try std.unicode.utf8ToUtf16LeAlloc(scratch, edit.utf8);
                const count = std.math.cast(u32, inserted.len) orelse return error.LimitExceeded;
                direct = .{ .start = edit.start_unit, .deleted = edit.end_unit - edit.start_unit, .inserted = count };
                try @import("control_boundaries.zig").validate(before, edit.start_unit, edit.end_unit);
                const start = @as(usize, edit.start_unit) * 2;
                const end = @as(usize, edit.end_unit) * 2;
                const addition = std.math.mul(usize, inserted.len, 2) catch return error.LimitExceeded;
                const length = std.math.add(usize, before.len - (end - start), addition) catch return error.LimitExceeded;
                if (length > limits.max_bytes) return error.LimitExceeded;
                const bytes = try scratch.alloc(u8, length);
                @memcpy(bytes[0..start], before[0..start]);
                @memcpy(bytes[start..][0..addition], std.mem.sliceAsBytes(inserted));
                @memcpy(bytes[start + addition ..], before[end..]);
                intermediate = bytes;
            }
            slot.value_ptr.* = .{ .direct = direct, .derived = try @import("created_table_text_delta.zig").between(intermediate, after), .after = after };
        }
        const mapping = slot.value_ptr.*;
        const unit = if (mapping.direct) |change| try change.map(entry.anchor.unit) else entry.anchor.unit;
        entry.anchor.unit = try mapping.derived.map(unit);
        try @import("control_boundaries.zig").validate(mapping.after, entry.anchor.unit, entry.anchor.unit);
    }
    const verified = try @import("created_table_section.zig").write(a, raw, draft, &tables, version, resources, limits);
    defer a.free(verified);
    std.mem.swap(model.Section, section, &draft);
    std.mem.swap(Values, pending, &tables);
}
