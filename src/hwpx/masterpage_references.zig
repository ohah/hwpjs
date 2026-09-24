const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");
const document_xml = @import("document_xml.zig");
const manifest = @import("content_manifest.zig");
const structure = @import("document_structure.zig");
const parts = @import("masterpage_parts.zig");

pub const Options = struct {
    parts: parts.Options = .{},
    max_section_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_section_xml_bytes: usize = 256 * 1024 * 1024,
    max_references: usize = 65_535,
    max_declarations: usize = 65_535,
    max_attribute_bytes: usize = 4096,
    xml: document_xml.Options = .{},
};

pub const Resolution = enum { resolved, absent_id, missing_target, ambiguous_target };

pub const Reference = struct {
    section_ordinal: usize,
    id_ref: ?[]u8,
    part_index: ?usize,
    resolution: Resolution,

    fn deinit(self: *Reference, a: std.mem.Allocator) void {
        if (self.id_ref) |v| a.free(v);
    }
};

/// secPr/@masterPageCnt is retained as a raw declaration; corpus examples
/// disagree with the number of observed hp:masterPage nodes, so it is not
/// treated as an equality constraint without further specification.
pub const CountDeclaration = struct {
    section_ordinal: usize,
    raw: []u8,

    fn deinit(self: *CountDeclaration, a: std.mem.Allocator) void {
        a.free(self.raw);
    }
};

pub const Report = struct {
    parts: parts.Report,
    references: []Reference,
    count_declarations: []CountDeclaration,
    section_xml_bytes: usize,
    resolved: usize,
    absent_id: usize,
    missing_target: usize,
    ambiguous_target: usize,
    duplicate_part_ids: usize,
    unreferenced_parts: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        self.parts.deinit(a);
        for (self.references) |*v| v.deinit(a);
        a.free(self.references);
        for (self.count_declarations) |*v| v.deinit(a);
        a.free(self.count_declarations);
        self.* = undefined;
    }
};

const Target = union(enum) { unique: usize, ambiguous };
const TargetIndex = std.StringHashMapUnmanaged(Target);

const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    targets: *const TargetIndex,
    ordinal: usize,
    references: *std.ArrayList(Reference),
    declarations: *std.ArrayList(CountDeclaration),

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.section_uri, "sec")) return error.InvalidSectionRoot;
            return;
        }
        if (try attrs.element(tag, scope, document_xml.paragraph_uri, "secPr")) {
            const value = try attrs.attribute(self.a, tag, scope, "masterPageCnt", self.options.max_attribute_bytes);
            if (value) |v| {
                errdefer self.a.free(v);
                _ = try values.unsigned32(v);
                if (self.declarations.items.len == self.options.max_declarations) return error.LimitExceeded;
                try self.declarations.append(self.a, .{ .section_ordinal = self.ordinal, .raw = v });
            }
        }
        if (!try attrs.element(tag, scope, document_xml.paragraph_uri, "masterPage")) return;
        if (self.references.items.len == self.options.max_references) return error.LimitExceeded;
        const id = try attrs.attribute(self.a, tag, scope, "idRef", self.options.max_attribute_bytes);
        errdefer if (id) |v| self.a.free(v);
        var index: ?usize = null;
        var resolution: Resolution = .absent_id;
        if (id) |value| {
            if (value.len != 0) {
                resolution = .missing_target;
                if (self.targets.get(value)) |target| {
                    switch (target) {
                        .unique => |part_index| {
                            index = part_index;
                            resolution = .resolved;
                        },
                        .ambiguous => resolution = .ambiguous_target,
                    }
                }
            }
        }
        try self.references.append(self.a, .{ .section_ordinal = self.ordinal, .id_ref = id, .part_index = index, .resolution = resolution });
    }
};

pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, content: manifest.Manifest, sections: []const structure.Section, options: Options) !Report {
    var part_report = try parts.inspect(a, archive, content.items, options.parts);
    errdefer part_report.deinit(a);
    var refs: std.ArrayList(Reference) = .empty;
    defer {
        for (refs.items) |*v| v.deinit(a);
        refs.deinit(a);
    }
    var declarations: std.ArrayList(CountDeclaration) = .empty;
    defer {
        for (declarations.items) |*v| v.deinit(a);
        declarations.deinit(a);
    }
    var targets: TargetIndex = .empty;
    defer targets.deinit(a);
    var duplicate_part_ids: usize = 0;
    for (part_report.parts, 0..) |part, part_index| {
        const entry = try targets.getOrPut(a, part.id);
        if (entry.found_existing) {
            duplicate_part_ids += 1;
            entry.value_ptr.* = .ambiguous;
        } else entry.value_ptr.* = .{ .unique = part_index };
    }
    var remaining = options.max_total_section_xml_bytes;
    for (sections, 0..) |section, ordinal| {
        if (section.item_index >= content.items.len) return error.InvalidManifestItemIndex;
        const item = content.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        if (entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const max_bytes = @min(options.max_section_xml_bytes, remaining);
        const bytes = try archive.decode(archive.entries[entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var context: Context = .{ .a = a, .options = options, .targets = &targets, .ordinal = ordinal, .references = &refs, .declarations = &declarations };
        _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
        remaining -= bytes.len;
    }
    var used = try a.alloc(bool, part_report.parts.len);
    defer a.free(used);
    @memset(used, false);
    var resolved: usize = 0;
    var absent_id: usize = 0;
    var missing_target: usize = 0;
    var ambiguous_target: usize = 0;
    for (refs.items) |ref| switch (ref.resolution) {
        .resolved => {
            used[ref.part_index.?] = true;
            resolved += 1;
        },
        .absent_id => absent_id += 1,
        .missing_target => missing_target += 1,
        .ambiguous_target => ambiguous_target += 1,
    };
    var unreferenced_parts: usize = 0;
    for (used) |value| unreferenced_parts += @intFromBool(!value);
    const owned_refs = try refs.toOwnedSlice(a);
    errdefer {
        for (owned_refs) |*ref| ref.deinit(a);
        a.free(owned_refs);
    }
    const owned_declarations = try declarations.toOwnedSlice(a);
    return .{
        .parts = part_report,
        .references = owned_refs,
        .count_declarations = owned_declarations,
        .section_xml_bytes = options.max_total_section_xml_bytes - remaining,
        .resolved = resolved,
        .absent_id = absent_id,
        .missing_target = missing_target,
        .ambiguous_target = ambiguous_target,
        .duplicate_part_ids = duplicate_part_ids,
        .unreferenced_parts = unreferenced_parts,
    };
}
