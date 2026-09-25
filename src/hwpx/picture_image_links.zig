const std = @import("std");
const part_tree = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const manifest = @import("content_manifest.zig");
const binary_links = @import("binary_reference_links.zig");

pub const Options = struct {
    max_sites: usize = 500_000,
    max_attribute_bytes: usize = 4096,
};

pub const Site = struct {
    part_kind: part_tree.PartKind,
    part_item_index: usize,
    section_ordinal: ?usize,
    picture_element_index: usize,
    image_element_index: usize,
    id: ?[]u8,
    target: binary_links.Target,
};

pub const Report = struct {
    sections: usize,
    master_pages: usize,
    sites: []Site,
    counts: [@typeInfo(binary_links.TargetState).@"enum".fields.len]usize,

    pub fn count(self: *const Report, state: binary_links.TargetState) usize {
        return self.counts[@intFromEnum(state)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.sites) |site| if (site.id) |id| a.free(id);
        a.free(self.sites);
        self.* = undefined;
    }
};

const Collector = struct {
    a: std.mem.Allocator,
    items: manifest.Manifest,
    index: binary_links.Index,
    options: Options,
    sites: std.ArrayList(Site) = .empty,
    counts: [@typeInfo(binary_links.TargetState).@"enum".fields.len]usize = @splat(0),

    fn deinit(self: *Collector) void {
        for (self.sites.items) |site| if (site.id) |id| self.a.free(id);
        self.sites.deinit(self.a);
        self.index.deinit(self.a);
    }

    fn scan(self: *Collector, tree: *const part_tree.Tree) !void {
        if (tree.elements.len == 0) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, element_index| {
            if (!element.is(document_xml.core_uri, "img")) continue;
            const parent_index = element.parent orelse continue;
            if (parent_index >= element_index) return error.InvalidPartTree;
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "pic")) continue;
            if (self.sites.items.len == self.options.max_sites) return error.LimitExceeded;
            const raw = try tree.attributeValue(self.a, element_index, "", "binaryItemIDRef");
            const id = if (raw) |value| try value.toUtf8(self.a, self.options.max_attribute_bytes) else null;
            errdefer if (id) |owned| self.a.free(owned);
            const target = binary_links.resolve(&self.index, self.items, id);
            try self.sites.append(self.a, .{
                .part_kind = tree.part_kind,
                .part_item_index = tree.item_index,
                .section_ordinal = tree.section_ordinal,
                .picture_element_index = parent_index,
                .image_element_index = element_index,
                .id = id,
                .target = target,
            });
            self.counts[@intFromEnum(target.state)] += 1;
        }
    }

    fn finish(self: *Collector, sections: usize, master_pages: usize) !Report {
        const sites = try self.sites.toOwnedSlice(self.a);
        return .{ .sections = sections, .master_pages = master_pages, .sites = sites, .counts = self.counts };
    }
};

/// Raw, namespace-aware direct pic/img sites in structure-selected sections.
/// The report borrows no XML or OPF strings; it preserves only scalar indices.
pub fn inspectSections(a: std.mem.Allocator, items: manifest.Manifest, sections: []const part_tree.Tree, options: Options) !Report {
    var collector: Collector = .{ .a = a, .items = items, .index = try binary_links.Index.init(a, items), .options = options };
    defer collector.deinit();
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal) return error.InvalidPartKind;
        try collector.scan(tree);
    }
    return collector.finish(sections.len, 0);
}

/// Same direct-child and ID rules for already selected master-page trees.
/// Selection of active switch branches is deliberately not inferred here.
pub fn inspectMasterTrees(a: std.mem.Allocator, items: manifest.Manifest, trees: []const part_tree.Tree, options: Options) !Report {
    var collector: Collector = .{ .a = a, .items = items, .index = try binary_links.Index.init(a, items), .options = options };
    defer collector.deinit();
    for (trees) |*tree| {
        if (tree.part_kind != .master_page or tree.section_ordinal != null) return error.InvalidPartKind;
        try collector.scan(tree);
    }
    return collector.finish(0, trees.len);
}
