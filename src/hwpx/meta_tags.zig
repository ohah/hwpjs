const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const document_xml = @import("document_xml.zig");
const direct_text = @import("xml_direct_text.zig");

pub const Options = struct {
    max_tags: usize = 100_000,
    max_name_bytes: usize = 4096,
    max_value_bytes: usize = 1024 * 1024,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const Tag = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    /// Owned expanded parent name; the source tree may be released.
    parent_uri: []const u8,
    parent_local_name: []const u8,
    /// Exact source bytes, including unknown attributes and descendants.
    raw_xml: []const u8,
    /// Owned normalized direct text/CDATA; descendant text is excluded.
    value: []const u8 = "",
    direct_children: usize = 0,
    other_attributes: usize = 0,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    tags: []const Tag,
    value_bytes: usize,
    owned_bytes: usize,
    direct_children: usize,
    other_attributes: usize,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const Budget = struct {
    max: usize,
    used: usize = 0,

    fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.max -| self.used) return error.LimitExceeded;
        const result = try a.dupe(u8, bytes);
        self.used += bytes.len;
        return result;
    }

    pub fn note(self: *Budget, count: usize) !void {
        if (count > self.max -| self.used) return error.LimitExceeded;
        self.used += count;
    }
};

const ContentContext = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    indices: *const std.AutoHashMapUnmanaged(usize, usize),
    builders: []std.ArrayList(u8),
    max_value_bytes: usize,
    budget: *Budget,
    value_bytes: *usize,

    fn onContent(raw: *anyopaque, event: tree_mod.Tree.ContentEvent) anyerror!void {
        const self: *ContentContext = @ptrCast(@alignCast(raw));
        const index = self.indices.get(event.parent_index) orelse return;
        const builder = &self.builders[index];
        try direct_text.append(self.temp_a, self.owned_a, builder, event.value, self.max_value_bytes, self.budget, self.value_bytes);
    }
};

/// Owns every 2011 hp:metaTag in selected section trees, regardless of its
/// parent kind. This reads XML strings, not application metadata semantics.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var tags: std.ArrayList(Tag) = .empty;
    var builders: std.ArrayList(std.ArrayList(u8)) = .empty;
    var value_bytes: usize = 0;
    var direct_children: usize = 0;
    var other_attributes: usize = 0;
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        var indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer indices.deinit(a);
        const first_tag = tags.items.len;
        for (tree.elements, 0..) |element, element_index| {
            if (!element.is(document_xml.paragraph_uri, "metaTag")) continue;
            const parent_index = element.parent orelse continue;
            if (tags.items.len >= options.max_tags) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            var tag: Tag = .{
                .section_ordinal = ordinal,
                .element_index = element_index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .raw_xml = try budget.copy(owned_a, tree.sourceOf(element_index)),
            };
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) tag.direct_children += 1;
            var start_tag = try attributes.parseStartTag(a, tree, element_index);
            defer start_tag.deinit(a);
            for (start_tag.attributes) |attribute| {
                if (!try xml.namespaces.isDeclaration(attribute.name)) tag.other_attributes += 1;
            }
            direct_children += tag.direct_children;
            other_attributes += tag.other_attributes;
            try tags.append(owned_a, tag);
            try builders.append(owned_a, .empty);
            try indices.put(a, element_index, tags.items.len - 1);
        }
        if (indices.count() == 0) continue;
        var content: ContentContext = .{
            .temp_a = a,
            .owned_a = owned_a,
            .indices = &indices,
            .builders = builders.items,
            .max_value_bytes = options.max_value_bytes,
            .budget = &budget,
            .value_bytes = &value_bytes,
        };
        try tree.visitContent(a, .{ .context = &content, .on_content = ContentContext.onContent });
        for (tags.items[first_tag..], first_tag..) |*tag, index| tag.value = try builders.items[index].toOwnedSlice(owned_a);
    }
    return .{
        .arena = arena,
        .sections = sections.len,
        .tags = try tags.toOwnedSlice(owned_a),
        .value_bytes = value_bytes,
        .owned_bytes = budget.used,
        .direct_children = direct_children,
        .other_attributes = other_attributes,
    };
}
