//! Owned decoded Section drafts. FileHeader/CFB/Session remain unchanged.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Values = struct {
    shadow: @import("../body/shadow.zig").Shadow,
    metadata_reserved: u8,
    shadow_alpha: u8,
};
pub const Draft = struct {
    sections: [][]u8,
    source_version: Version,
    target_version: Version,
    converted_styles: usize,
    complete_document: bool = false,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        for (self.sections) |bytes| a.free(bytes);
        a.free(self.sections);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, sources: []const []const u8, from: Version, to: Version, current_and_reserved: []const u32, values: Values, max_ids: usize, max_output: usize) !Draft {
    if (from.raw != 0x05000107 or to.raw != 0x05000300) return error.UnsupportedDrawingMigrationTarget;
    if (sources.len > max_ids) return error.LimitExceeded;
    var count: usize = 0;
    for (sources) |bytes| {
        var it = @import("../record.zig").Iterator.init(bytes, .{});
        while (try it.next()) |record| if (record.tag == 76) {
            if (count >= max_ids) return error.LimitExceeded;
            count += 1;
        };
    }
    const ids = try @import("drawing_migration_ids.zig").plan(a, sources, from, current_and_reserved, count, max_ids);
    defer a.free(ids);
    const sections = try a.alloc([]u8, sources.len);
    var completed: usize = 0;
    errdefer {
        for (sections[0..completed]) |bytes| a.free(bytes);
        a.free(sections);
    }
    var next: usize = 0;
    var total: usize = 0;
    for (sources, 0..) |raw, section_index| {
        const first_style = next;
        var tree = try @import("source_tree.zig").parse(a, raw, from, .{});
        defer tree.deinit(a);
        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(a);
        const limit = max_output - total;
        for (tree.nodes, 0..) |node, index| {
            const record = node.record.framing;
            if (record.tag == 76) {
                const layout = try @import("../body/shape_validation.zig").componentLayout(tree, index);
                const component = try @import("../body/shape_component.zig").Component.parse(record.payload, layout);
                const style = try @import("drawing_style_migration.zig").prepare(a, component.extra, from, to, .{ .shadow = values.shadow, .metadata = .{ .instance_id = ids[next], .reserved = values.metadata_reserved, .shadow_alpha = values.shadow_alpha } }, limit);
                defer a.free(style);
                const prefix = record.payload.len - component.extra.len;
                const length = std.math.add(usize, prefix, style.len) catch return error.LimitExceeded;
                if (length > limit) return error.LimitExceeded;
                const payload = try a.alloc(u8, length);
                defer a.free(payload);
                @memcpy(payload[0..prefix], record.payload[0..prefix]);
                @memcpy(payload[prefix..], style);
                try @import("../record_writer.zig").append(a, &out, record.tag, record.level, payload, limit);
                next += 1;
            } else {
                if (out.items.len > limit or record.raw.len > limit - out.items.len) return error.LimitExceeded;
                try out.appendSlice(a, record.raw);
            }
        }
        var target = try @import("source_tree.zig").parse(a, out.items, to, .{});
        defer target.deinit(a);
        const report = try @import("../body/shape_validation.zig").inspectDetailed(target, .{ .tail = .alpha_shadow_metadata }, 0);
        if (report.styles.unknown != 0 or report.styles.extra_bytes != 0 or report.styles.parsed != next - first_style) return error.UnsupportedDrawingMigrationSource;
        total += out.items.len;
        sections[section_index] = try out.toOwnedSlice(a);
        completed += 1;
    }
    if (next != ids.len) return error.SourceBindingMismatch;
    return .{ .sections = sections, .source_version = from, .target_version = to, .converted_styles = next };
}
