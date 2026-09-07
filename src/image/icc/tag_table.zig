const std = @import("std");
const header = @import("header.zig");
const extent = @import("extent.zig");
const entry = @import("tag.zig");
pub const Tag = entry.Tag;
pub const layout = @import("tag_layout.zig");
pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    max_tags: usize = 100000,
    policy: layout.Policy,
};
pub const Table = struct {
    header: header.Header,
    /// Owned descriptors in original table order; tag data borrows the input.
    tags: []Tag,
    table_end: usize,
    storage: layout.Stats,
    pub fn deinit(self: *Table, a: std.mem.Allocator) void {
        a.free(self.tags);
        self.* = undefined;
    }
};
pub fn parse(a: std.mem.Allocator, bytes: []const u8, options: Options) !Table {
    const h = try extent.inspect(bytes, options.max_bytes);
    const start = header.size + 4;
    const count: usize = std.mem.readInt(u32, bytes[header.size..][0..4], .big);
    if (count > options.max_tags) return error.LimitExceeded;
    if (count > (bytes.len - start) / entry.entry_size) return error.InvalidIccTagTable;
    const table_end = start + count * entry.entry_size;
    const tags = try a.alloc(Tag, count);
    errdefer a.free(tags);
    const order = try a.alloc(usize, count);
    defer a.free(order);
    for (tags, order, 0..) |*tag, *index, i| {
        tag.* = try entry.parse(bytes[start + i * entry.entry_size ..][0..entry.entry_size], bytes, table_end);
        index.* = i;
    }
    std.mem.sort(usize, order, @as([]const Tag, tags), signatureLess);
    for (order, 0..) |i, position| {
        if (position != 0 and std.mem.eql(u8, &tags[i].signature, &tags[order[position - 1]].signature)) return error.DuplicateIccTag;
    }
    std.mem.sort(usize, order, @as([]const Tag, tags), offsetLess);
    const storage = try layout.inspect(bytes, table_end, tags, order, options.policy);
    return .{ .header = h, .tags = tags, .table_end = table_end, .storage = storage };
}
fn signatureLess(tags: []const Tag, left: usize, right: usize) bool {
    return std.mem.order(u8, &tags[left].signature, &tags[right].signature) == .lt;
}
fn offsetLess(tags: []const Tag, left: usize, right: usize) bool {
    const a = tags[left];
    const b = tags[right];
    return if (a.offset == b.offset) a.data.len < b.data.len else a.offset < b.offset;
}
