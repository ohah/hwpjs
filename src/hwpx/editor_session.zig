//! Owned document session: orchestration only, no duplicated XML or ZIP parser.
const std = @import("std");
const package = @import("package.zig");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const locations_module = @import("text_site_locations.zig");
const scanner = @import("section_text.zig");
const zip_writer = @import("../zip/replace_writer.zig");

pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_xml_bytes: usize = 128 * 1024 * 1024,
    max_text_bytes: usize = 64 * 1024 * 1024,
    max_sites: usize = 1_000_000,
    max_sections: usize = 4096,
};
pub const Section = struct {
    tree: tree_module.Tree,
    sites: sites_module.Sites,
    locations: []scanner.Location,
    entry_index: usize,
    first_paragraph: usize,
    last_paragraph: usize,
    field_dirty: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .empty,
    fn deinit(self: *Section, a: std.mem.Allocator) void {
        self.field_dirty.deinit(a);
        a.free(self.locations);
        self.sites.deinit(a);
        self.tree.deinit(a);
    }
};
pub const Session = struct {
    allocator: std.mem.Allocator,
    source: []u8,
    sections: []Section,
    options: Options,

    pub fn deinit(self: *Session) void {
        for (self.sections) |*section| section.deinit(self.allocator);
        self.allocator.free(self.sections);
        self.allocator.free(self.source);
        self.* = undefined;
    }

    pub fn splice(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        return self.spliceMode(section_index, paragraph, start, deleted, inserted, false);
    }

    pub fn spliceAnchored(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        return self.spliceMode(section_index, paragraph, start, deleted, inserted, true);
    }

    fn spliceMode(self: *Session, section_index: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, anchored: bool) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const selected = &self.sections[section_index];
        if (paragraph < selected.first_paragraph or paragraph > selected.last_paragraph) return error.InvalidParagraphIndex;
        var other_bytes: usize = 0;
        for (self.sections, 0..) |section, index| {
            if (index == section_index) continue;
            for (section.sites.items) |site| {
                if (site.text.len > self.options.max_text_bytes -| other_bytes) return error.LimitExceeded;
                other_bytes += site.text.len;
            }
        }
        if (try @import("formula_section_save.zig").hasFormula(self.allocator, &selected.tree)) {
            const trees = try self.allocator.alloc(tree_module.Tree, self.sections.len);
            defer self.allocator.free(trees);
            for (self.sections, trees) |section, *tree| tree.* = section.tree;
            return @import("formula_splice.zig").spliceMode(self.allocator, trees, section_index, &selected.sites, selected.locations, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, anchored);
        }
        if (anchored) return @import("anchor_paragraph_edit.zig").splice(self.allocator, &selected.tree, &selected.sites, selected.locations, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes);
        return @import("plain_paragraph_edit.zig").spliceWithTabs(self.allocator, &selected.tree, &selected.sites, selected.locations, paragraph, start, deleted, inserted, self.options.max_text_bytes - other_bytes, true);
    }

    pub fn canEdit(self: *const Session, section_index: usize, paragraph: usize) !bool {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
        @import("plain_paragraph_policy.zig").validateWithTabs(&section.tree, &section.sites, section.locations, paragraph, true) catch |err| switch (err) {
            error.MissingTextSite, error.UnsupportedParagraphControl, error.UnsupportedInlineControl => return false,
            else => return err,
        };
        return true;
    }

    pub fn anchorText(self: *const Session, section_index: usize, paragraph: usize) ![]u8 {
        if (section_index >= self.sections.len) return error.InvalidSectionIndex;
        const section = &self.sections[section_index];
        if (paragraph < section.first_paragraph or paragraph > section.last_paragraph) return error.InvalidParagraphIndex;
        return @import("anchor_paragraph_edit.zig").text(self.allocator, &section.tree, &section.sites, section.locations, paragraph, self.options.max_text_bytes);
    }

    pub fn spliceFieldLabel(self: *Session, section_index: usize, paragraph: usize, begin_element: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
        return @import("field_label_session.zig").splice(self, section_index, paragraph, begin_element, start, deleted, inserted);
    }
    pub fn fieldLabels(self: *const Session, section_index: usize, paragraph: usize) ![]@import("field_label_targets.zig").Target {
        return @import("field_label_targets.zig").list(self, section_index, paragraph, 4096);
    }

    /// Caller owns the result with Session.allocator. Save is side-effect free.
    pub fn save(self: *const Session) ![]u8 {
        const a = self.allocator;
        const trees = try a.alloc(tree_module.Tree, self.sections.len);
        defer a.free(trees);
        for (self.sections, trees) |section, *tree| tree.* = section.tree;
        var replacements: std.ArrayList(zip_writer.Replacement) = .empty;
        defer {
            for (replacements.items) |replacement| a.free(replacement.bytes);
            replacements.deinit(a);
        }
        var xml_bytes: usize = 0;
        for (self.sections, 0..) |*section, index| {
            const bytes = try @import("formula_section_save.zig").write(a, trees, index, &section.sites, siteOptions(self.options), section.field_dirty.items, self.options.max_xml_bytes -| xml_bytes);
            errdefer a.free(bytes);
            try replacements.append(a, .{ .entry_index = section.entry_index, .bytes = bytes });
            xml_bytes += bytes.len;
        }
        return zip_writer.write(a, self.source, replacements.items, .{ .max_output_bytes = self.options.max_output_bytes });
    }
};

pub fn open(a: std.mem.Allocator, input: []const u8, options: Options) !Session {
    if (input.len > options.max_input_bytes) return error.LimitExceeded;
    const source = try a.dupe(u8, input);
    errdefer a.free(source);
    var document = try package.inspectDocument(a, source, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{ .max_sections = options.max_sections });
    defer structure.deinit(a);
    var sections: std.ArrayList(Section) = .empty;
    defer {
        for (sections.items) |*section| section.deinit(a);
        sections.deinit(a);
    }
    var counters: scanner.Report = .{};
    var xml_bytes: usize = 0;
    var text_bytes: usize = 0;
    var site_count: usize = 0;
    for (structure.sections, 0..) |section, ordinal| {
        const entry_index = document.manifest.items[section.item_index].entry_index orelse return error.ExternalSpineXml;
        const xml = try document.archive.decode(document.archive.entries[entry_index], options.max_xml_bytes -| xml_bytes);
        defer a.free(xml);
        var tree = try tree_module.parse(a, xml, .section, ordinal, section.item_index, .{ .max_xml_bytes = options.max_xml_bytes -| xml_bytes });
        errdefer tree.deinit(a);
        var sites = try sites_module.collect(a, &tree, siteOptions(options));
        errdefer sites.deinit(a);
        if (sites.items.len > options.max_sites -| site_count) return error.LimitExceeded;
        site_count += sites.items.len;
        for (sites.items) |site| {
            if (site.text.len > options.max_text_bytes -| text_bytes) return error.LimitExceeded;
            text_bytes += site.text.len;
        }
        const first = counters.paragraphs + 1;
        const locations = try locations_module.buildWithCounters(a, &tree, &sites, siteOptions(options), &counters);
        errdefer a.free(locations);
        try sections.append(a, .{ .tree = tree, .sites = sites, .locations = locations, .entry_index = entry_index, .first_paragraph = first, .last_paragraph = counters.paragraphs });
        xml_bytes += xml.len;
    }
    return .{ .allocator = a, .source = source, .sections = try sections.toOwnedSlice(a), .options = options };
}

fn siteOptions(options: Options) sites_module.Options {
    return .{ .materialize_tab_boundaries = true, .branch_policy = .{ .mode = .selected }, .max_text_bytes = options.max_text_bytes, .max_sites = options.max_sites };
}
