//! Immutable section source provenance. Tree owns XML and its index; locations
//! belong to that exact tree. Active Section fields are borrowed aliases.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const scanner = @import("section_text.zig");
const sites_mod = @import("text_sites.zig");
pub const Basis = struct {
    tree: trees.Tree,
    locations: []scanner.Location,
    first_paragraph: usize,
    last_paragraph: usize,
    seal: u64,

    /// Immutable canonical URI ordinal for each indexed element. Built once
    /// with a pointer map; validation/clone require no map or scratch allocation.
    uri_indices: []usize,
    pub const SealWork = struct { source_bytes: usize = 0, uri_bytes: usize = 0, elements: usize = 0, locations: usize = 0 };
    const CanonicalElement = struct {
        uri: usize,
        local_offset: usize,
        local_length: usize,
        encoding: @import("../xml/scalars.zig").Encoding,
        start_tag: trees.Span,
        end_tag: ?trees.Span,
        end: usize,
        parent: ?usize,
        first_child: ?usize,
        next_sibling: ?usize,
        last_child: ?usize,
    };
    /// Takes tree/locations only on success. Auxiliary URI ordinals use a.
    pub fn init(a: std.mem.Allocator, tree: trees.Tree, locations: []scanner.Location, first: usize, last: usize) !Basis {
        const indices = try a.alloc(usize, tree.elements.len);
        errdefer a.free(indices);
        var map: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer map.deinit(a);
        for (tree.uris, 0..) |uri, index| {
            // Empty URI views are normalized separately, independent of allocator.
            if (uri.len == 0) continue;
            const entry = try map.getOrPut(a, @intFromPtr(uri.ptr));
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = index;
        }
        for (tree.elements, indices) |element, *index| {
            index.* = if (element.name.uri.len == 0) std.math.maxInt(usize) else map.get(@intFromPtr(element.name.uri.ptr)) orelse return error.SourceBindingMismatch;
        }
        var value: Basis = .{ .tree = tree, .locations = locations, .first_paragraph = first, .last_paragraph = last, .uri_indices = indices, .seal = 0 };
        value.seal = try value.digest(null);
        return value;
    }
    fn canonicalElement(self: *const Basis, index: usize) !CanonicalElement {
        const element = self.tree.elements[index];
        const uri_index = self.uri_indices[index];
        if (uri_index == std.math.maxInt(usize)) {
            if (element.name.uri.len != 0) return error.SourceBindingMismatch;
        } else {
            if (uri_index >= self.tree.uris.len) return error.SourceBindingMismatch;
            const uri = self.tree.uris[uri_index];
            if (element.name.uri.ptr != uri.ptr or element.name.uri.len != uri.len or uri.len == 0) return error.SourceBindingMismatch;
        }
        const base = @intFromPtr(self.tree.source.ptr);
        const pointer = @intFromPtr(element.name.local.raw.ptr);
        if (pointer < base) return error.SourceBindingMismatch;
        const offset = pointer - base;
        if (offset > self.tree.source.len or element.name.local.raw.len > self.tree.source.len - offset) return error.SourceBindingMismatch;
        return .{ .uri = uri_index, .local_offset = offset, .local_length = element.name.local.raw.len, .encoding = element.name.local.encoding, .start_tag = element.start_tag, .end_tag = element.end_tag, .end = element.end, .parent = element.parent, .first_child = element.first_child, .next_sibling = element.next_sibling, .last_child = element.last_child };
    }
    fn digest(self: *const Basis, work: ?*SealWork) !u64 {
        if (self.uri_indices.len != self.tree.elements.len) return error.SourceBindingMismatch;
        var hash = std.hash.Wyhash.init(0);
        std.hash.autoHash(&hash, self.tree.source.len);
        hash.update(self.tree.source);
        std.hash.autoHash(&hash, self.tree.part_kind);
        std.hash.autoHash(&hash, self.tree.section_ordinal);
        std.hash.autoHash(&hash, self.tree.item_index);
        std.hash.autoHash(&hash, self.tree.xml_report);
        std.hash.autoHash(&hash, self.tree.uris.len);
        if (work) |w| w.source_bytes += self.tree.source.len;
        for (self.tree.uris) |uri| {
            std.hash.autoHash(&hash, uri.len);
            hash.update(uri);
            if (work) |w| w.uri_bytes += uri.len;
        }
        std.hash.autoHash(&hash, self.tree.elements.len);
        for (0..self.tree.elements.len) |index| {
            std.hash.autoHash(&hash, try self.canonicalElement(index));
            if (work) |w| w.elements += 1;
        }
        std.hash.autoHash(&hash, self.locations.len);
        for (self.locations) |location| {
            std.hash.autoHash(&hash, location);
            if (work) |w| w.locations += 1;
        }
        std.hash.autoHash(&hash, self.first_paragraph);
        std.hash.autoHash(&hash, self.last_paragraph);
        return hash.final();
    }
    /// Deterministic work accounting for the actual seal path, not wall time.
    pub fn sealWork(self: *const Basis) !SealWork {
        var work: SealWork = .{};
        _ = try self.digest(&work);
        return work;
    }
    /// Exact canonical equality. Never compare shared URI bytes per element or
    /// compare allocation addresses across clones.
    pub fn equal(self: *const Basis, other: *const Basis) !bool {
        if (self.seal != other.seal or self.first_paragraph != other.first_paragraph or self.last_paragraph != other.last_paragraph or self.tree.part_kind != other.tree.part_kind or self.tree.section_ordinal != other.tree.section_ordinal or self.tree.item_index != other.tree.item_index or !std.meta.eql(self.tree.xml_report, other.tree.xml_report) or self.tree.uris.len != other.tree.uris.len or self.tree.elements.len != other.tree.elements.len or self.locations.len != other.locations.len or !std.mem.eql(u8, self.tree.source, other.tree.source)) return false;
        if (self.uri_indices.len != self.tree.elements.len or other.uri_indices.len != other.tree.elements.len) return error.SourceBindingMismatch;
        for (self.tree.uris, other.tree.uris) |left, right| if (!std.mem.eql(u8, left, right)) return false;
        for (0..self.tree.elements.len) |index| if (!std.meta.eql(try self.canonicalElement(index), try other.canonicalElement(index))) return false;
        for (self.locations, other.locations) |left, right| if (!std.meta.eql(left, right)) return false;
        return true;
    }
    pub fn validate(self: *const Basis) !void {
        if (self.tree.part_kind != .section or self.tree.section_ordinal == null or self.first_paragraph == 0 or self.last_paragraph < self.first_paragraph - 1 or self.seal != try self.digest(null)) return error.SourceBindingMismatch;
        for (self.locations) |location| {
            if (location.section_ordinal != self.tree.section_ordinal.? or location.item_index != self.tree.item_index or location.paragraph_ordinal < self.first_paragraph or location.paragraph_ordinal > self.last_paragraph) return error.SourceBindingMismatch;
        }
    }
    pub fn deinit(self: *Basis, a: std.mem.Allocator) void {
        a.free(self.uri_indices);
        a.free(self.locations);
        self.tree.deinit(a);
        self.* = undefined;
    }
    pub fn byteSize(self: *const Basis, limit: usize) !usize {
        var total = std.math.add(usize, self.tree.source.len, std.math.mul(usize, self.uri_indices.len, @sizeOf(usize)) catch return error.LimitExceeded) catch return error.LimitExceeded;
        total = std.math.add(usize, total, std.math.mul(usize, self.tree.elements.len, @sizeOf(trees.Element)) catch return error.LimitExceeded) catch return error.LimitExceeded;
        total = std.math.add(usize, total, std.math.mul(usize, self.tree.uris.len, @sizeOf([]u8)) catch return error.LimitExceeded) catch return error.LimitExceeded;
        for (self.tree.uris) |uri| total = std.math.add(usize, total, uri.len) catch return error.LimitExceeded;
        total = std.math.add(usize, total, std.math.mul(usize, self.locations.len, @sizeOf(scanner.Location)) catch return error.LimitExceeded) catch return error.LimitExceeded;
        if (total > limit) return error.LimitExceeded;
        return total;
    }
    // Exact clone, no parse scratch allocations. Only source-local names and
    // interned URI views need relocation; the parser remains the sole indexer.
    pub fn clone(self: *const Basis, a: std.mem.Allocator) !Basis {
        try self.validate();
        const source = try a.dupe(u8, self.tree.source);
        errdefer a.free(source);
        const elements = try a.dupe(trees.Element, self.tree.elements);
        errdefer a.free(elements);
        const uris = try a.alloc([]u8, self.tree.uris.len);
        var initialized: usize = 0;
        errdefer {
            for (uris[0..initialized]) |uri| a.free(uri);
            a.free(uris);
        }
        for (self.tree.uris, uris) |old, *uri| {
            uri.* = try a.dupe(u8, old);
            initialized += 1;
        }
        for (self.tree.elements, elements, self.uri_indices) |old, *element, uri_index| {
            const start = @intFromPtr(old.name.local.raw.ptr) -| @intFromPtr(self.tree.source.ptr);
            if (@intFromPtr(old.name.local.raw.ptr) < @intFromPtr(self.tree.source.ptr) or start > source.len or old.name.local.raw.len > source.len - start) return error.SourceBindingMismatch;
            element.name.local.raw = source[start..][0..old.name.local.raw.len];
            if (old.name.uri.len == 0) {
                element.name.uri = "";
            } else {
                element.name.uri = uris[uri_index];
            }
        }
        const indices = try a.dupe(usize, self.uri_indices);
        errdefer a.free(indices);
        const locations = try a.dupe(scanner.Location, self.locations);
        var tree = self.tree;
        tree.source = source;
        tree.elements = elements;
        tree.uris = uris;
        return .{ .tree = tree, .locations = locations, .uri_indices = indices, .first_paragraph = self.first_paragraph, .last_paragraph = self.last_paragraph, .seal = self.seal };
    }
};

pub const Prepared = struct {
    basis: Basis,
    sites: sites_mod.Sites,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.sites.deinit(a);
        self.basis.deinit(a);
        self.* = undefined;
    }
};
/// Parse a standalone candidate using the same parser/scanner as Session.open.
/// Caller supplies the current document-wide first paragraph, never ZIP bytes.
pub fn prepare(a: std.mem.Allocator, xml: []const u8, ordinal: usize, item: usize, first: usize, options: @import("editor_session.zig").Options) !Prepared {
    if (first == 0) return error.InvalidParagraphIndex;
    const parsed = try trees.parseWithContent(a, xml, .section, ordinal, item, .{ .max_xml_bytes = options.max_xml_bytes });
    defer if (parsed.events) |events| a.free(events);
    var tree = parsed.tree;
    errdefer tree.deinit(a);
    const policy = @import("editor_session.zig").siteOptions(options);
    var sites = try sites_mod.collectParsed(a, &parsed, policy);
    errdefer sites.deinit(a);
    var report: scanner.Report = .{ .paragraphs = first - 1 };
    const locations = try @import("text_site_locations.zig").buildParsedWithCounters(a, &parsed, &sites, policy, &report);
    errdefer a.free(locations);
    var basis = try Basis.init(a, tree, locations, first, report.paragraphs);
    errdefer a.free(basis.uri_indices);
    try basis.validate();
    if (sites.items.len > options.max_sites) return error.LimitExceeded;
    var bytes: usize = 0;
    for (sites.items) |site| {
        if (site.text.len > options.max_text_bytes -| bytes) return error.LimitExceeded;
        bytes += site.text.len;
    }
    return .{ .basis = basis, .sites = sites };
}
