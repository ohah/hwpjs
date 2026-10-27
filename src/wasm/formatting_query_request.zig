//! Read-only selectors. The caller resolves each owner against the live session.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const d = @import("formatting_patch_request.zig");
pub const Selector = struct { section: u32, paragraph: u32, ranges: []const m.Range };
pub const Query = struct { binding: m.Binding, selectors: []const Selector, fields: ?[]const []const u8 };
pub const Request = struct {
    arena: std.heap.ArenaAllocator,
    value: Query,
    pub fn deinit(self: *Request) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
/// catalog is Native-owned; omitted fields means all, [] means binding/targets only.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, catalog: []const []const u8) !Request {
    if (bytes.len > m.limits.request_bytes) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const aa = arena.allocator();
    const root = try std.json.parseFromSliceLeaky(std.json.Value, aa, bytes, .{ .allocate = .alloc_always, .duplicate_field_behavior = .@"error" });
    try d.keys(root, &.{ "schemaVersion", "binding", "selectors", "fields" });
    if (try d.uint(try d.required(root, "schemaVersion"), 1) != 1) return error.InvalidFormattingSchema;
    const binding = try d.decodeBinding(try d.required(root, "binding"), true);
    const items = try d.array(try d.required(root, "selectors"));
    if (items.len == 0 or items.len > m.limits.targets) return error.LimitExceeded;
    const selectors = try aa.alloc(Selector, items.len);
    var total: usize = 0;
    for (items, 0..) |item, index| {
        try d.keys(item, &.{ "kind", "section", "paragraph", "ranges" });
        if (!std.mem.eql(u8, try d.string(try d.required(item, "kind")), "original-paragraph")) return error.UnsupportedFormattingOwner;
        const section: u32 = @intCast(try d.uint(try d.required(item, "section"), 0xffffffff));
        const paragraph: u32 = @intCast(try d.uint(try d.required(item, "paragraph"), 0xffffffff));
        for (selectors[0..index]) |previous| if (previous.section == section and previous.paragraph == paragraph) return error.DuplicateFormattingTarget;
        const ranges = if (d.get(item, "ranges")) |value| try d.decodeRanges(aa, value) else &.{};
        total = try std.math.add(usize, total, ranges.len);
        if (total > m.limits.ranges) return error.LimitExceeded;
        selectors[index] = .{ .section = section, .paragraph = paragraph, .ranges = ranges };
    }
    var fields: ?[]const []const u8 = null;
    if (d.get(root, "fields")) |value| {
        const names = try d.array(value);
        if (names.len > catalog.len) return error.LimitExceeded;
        const output = try aa.alloc([]const u8, names.len);
        for (names, 0..) |name, index| {
            const text = try d.string(name);
            var exists = false;
            for (catalog) |known| if (std.mem.eql(u8, text, known)) {
                exists = true;
                break;
            };
            if (!exists) return error.UnknownFormattingField;
            for (output[0..index]) |previous| if (std.mem.eql(u8, previous, text)) return error.DuplicateFormattingField;
            output[index] = text;
        }
        fields = output;
    }
    return .{ .arena = arena, .value = .{ .binding = binding, .selectors = selectors, .fields = fields } };
}
