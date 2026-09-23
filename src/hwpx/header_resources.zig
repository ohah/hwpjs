const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");

pub const Kind = enum(u8) { border_fill, char_shape, tab, numbering, bullet, para_shape, style };
const Descriptor = struct { group: []const u8, item: []const u8 };
const descriptors = [_]Descriptor{
    .{ .group = "borderFills", .item = "borderFill" },
    .{ .group = "charProperties", .item = "charPr" },
    .{ .group = "tabProperties", .item = "tabPr" },
    .{ .group = "numberings", .item = "numbering" },
    .{ .group = "bullets", .item = "bullet" },
    .{ .group = "paraProperties", .item = "paraPr" },
    .{ .group = "styles", .item = "style" },
};

pub const Options = struct {
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_resource_ids: usize = 1_000_000,
    xml: document_xml.Options = .{},
};

pub const Table = struct {
    present: bool = false,
    declared_count: ?u32 = null,
    ids: std.ArrayList(u32) = .empty,

    pub fn countMatches(self: *const Table) ?bool {
        return if (self.declared_count) |count| count == self.ids.items.len else null;
    }

    /// The ID list is sorted after a successful read. It is not an array index.
    pub fn hasId(self: *const Table, id: u32) bool {
        var lo: usize = 0;
        var hi: usize = self.ids.items.len;
        while (lo < hi) {
            const mid = lo + (hi - lo) / 2;
            const value = self.ids.items[mid];
            if (value == id) return true;
            if (value < id) lo = mid + 1 else hi = mid;
        }
        return false;
    }
};

pub const Report = struct {
    xml_bytes: usize,
    tables: [descriptors.len]Table,

    pub fn table(self: *const Report, kind: Kind) *const Table {
        return &self.tables[@intFromEnum(kind)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (&self.tables) |*entry| entry.ids.deinit(a);
        self.* = undefined;
    }
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    tables: [descriptors.len]Table = @splat(.{}),
    ref_list_seen: bool = false,
    within_ref_list: bool = false,
    current_group: ?Kind = null,
    total_ids: usize = 0,

    fn deinit(self: *Context) void {
        for (&self.tables) |*table| table.ids.deinit(self.allocator);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 3) self.current_group = null;
            if (depth == 2) self.within_ref_list = false;
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "head")) return error.InvalidHeaderRoot;
            return;
        }
        if (depth == 2) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "refList")) return;
            if (self.ref_list_seen) return error.DuplicateReferenceList;
            self.ref_list_seen = true;
            self.within_ref_list = tag.kind == .start;
            return;
        }
        if (!self.within_ref_list) return;
        if (depth == 3) {
            for (descriptors, 0..) |descriptor, index| {
                if (!try attrs.element(tag, scope, document_xml.head_uri, descriptor.group)) continue;
                const table = &self.tables[index];
                if (table.present) return error.DuplicateResourceTable;
                table.present = true;
                const raw_count = try attrs.attribute(self.allocator, tag, scope, "itemCnt", self.options.max_attribute_bytes);
                defer if (raw_count) |value| self.allocator.free(value);
                if (raw_count) |value| table.declared_count = std.fmt.parseInt(u32, value, 10) catch return error.InvalidResourceCount;
                self.current_group = if (tag.kind == .empty) null else @enumFromInt(index);
                return;
            }
            return;
        }
        if (depth != 4) return;
        const kind = self.current_group orelse return;
        const index = @intFromEnum(kind);
        if (!try attrs.element(tag, scope, document_xml.head_uri, descriptors[index].item)) return;
        const raw_id = (try attrs.attribute(self.allocator, tag, scope, "id", self.options.max_attribute_bytes)) orelse return error.MissingResourceId;
        defer self.allocator.free(raw_id);
        const id = std.fmt.parseInt(u32, raw_id, 10) catch return error.InvalidResourceId;
        if (self.total_ids == self.options.max_resource_ids) return error.LimitExceeded;
        try self.tables[index].ids.append(self.allocator, id);
        self.total_ids += 1;
    }
};

fn less(_: void, a: u32, b: u32) bool {
    return a < b;
}

/// Owns only ID inventories; unknown refList groups and item payloads remain
/// unvalidated. The package layer chooses the exact unencrypted header entry.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, options: Options) !Report {
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer a.free(bytes);
    var context: Context = .{ .allocator = a, .options = options };
    errdefer context.deinit();
    _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    if (!context.ref_list_seen) return error.MissingReferenceList;
    for (&context.tables) |*table| {
        std.mem.sort(u32, table.ids.items, {}, less);
        if (table.ids.items.len > 1) {
            for (table.ids.items[1..], table.ids.items[0 .. table.ids.items.len - 1]) |id, previous| {
                if (id == previous) return error.DuplicateResourceId;
            }
        }
    }
    return .{ .xml_bytes = bytes.len, .tables = context.tables };
}
