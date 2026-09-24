const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content_manifest = @import("content_manifest.zig");
const links = @import("binary_reference_links.zig");
const selection = @import("compatibility_selection.zig");
const masterpage_parts = @import("masterpage_parts.zig");

pub const Mode = enum { header, section, master_page };

pub const Options = struct {
    max_header_xml_bytes: usize = 32 * 1024 * 1024,
    max_section_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_xml_bytes: usize = 256 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_sites: usize = 1_000_000,
    branch_policy: selection.Policy = .{},
    xml: document_xml.Options = .{},
};

const Node = enum {
    other,
    head,
    section,
    master_page,
    sub_list,
    ref_list,
    fontfaces,
    fontface,
    font,
    subst_font,
    border_fills,
    border_fill,
    paragraph,
    run,
    container,
    switch_element,
    branch,
    drawing,
    picture,
    ole,
    fill_brush,
    image_brush,
    image,
};
const Frame = struct {
    kind: Node = .other,
    active: bool = true,
    selected: selection.State = .{},
    active_scope: bool = true,
};

const Context = struct {
    allocator: std.mem.Allocator,
    mode: Mode,
    options: Options,
    source_item_index: usize,
    manifest: content_manifest.Manifest,
    index: *const links.Index,
    report: *links.Report,
    stack: [256]Frame = @splat(.{}),
    sub_lists: usize = 0,

    fn drawing(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !bool {
        for ([_][]const u8{ "rect", "ellipse", "polygon", "arc", "curve", "line", "connectLine", "textart", "unknown", "presentation" }) |local| {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, local)) return true;
        }
        return false;
    }

    fn classify(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !Node {
        const parent = if (depth == 1) Node.other else self.stack[depth - 2].kind;
        if (depth == 1) {
            return switch (self.mode) {
                .header => if (try attrs.element(tag, scope, document_xml.head_uri, "head")) .head else error.InvalidHeaderRoot,
                .section => if (try attrs.element(tag, scope, document_xml.section_uri, "sec")) .section else error.InvalidSectionRoot,
                .master_page => if (try masterpage_parts.isRootTag(tag, scope)) .master_page else error.InvalidMasterPageRoot,
            };
        }
        if (self.mode == .master_page and parent == .master_page and try masterpage_parts.isDirectSubListTag(tag, scope)) return .sub_list;
        if (self.mode == .header) {
            if (parent == .head and try attrs.element(tag, scope, document_xml.head_uri, "refList")) return .ref_list;
            if (parent == .ref_list) {
                if (try attrs.element(tag, scope, document_xml.head_uri, "fontfaces")) return .fontfaces;
                if (try attrs.element(tag, scope, document_xml.head_uri, "borderFills")) return .border_fills;
            }
            if (parent == .fontfaces and try attrs.element(tag, scope, document_xml.head_uri, "fontface")) return .fontface;
            if (parent == .fontface and try attrs.element(tag, scope, document_xml.head_uri, "font")) return .font;
            if (parent == .font and try attrs.element(tag, scope, document_xml.head_uri, "substFont")) return .subst_font;
            if (parent == .border_fills and try attrs.element(tag, scope, document_xml.head_uri, "borderFill")) return .border_fill;
        } else {
            if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) return .paragraph;
            if (parent == .paragraph and try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) return .run;
            if ((parent == .run or parent == .container or parent == .branch) and try attrs.element(tag, scope, document_xml.paragraph_uri, "switch")) return .switch_element;
            if (parent == .switch_element) {
                if (try attrs.element(tag, scope, document_xml.paragraph_uri, "case")) return .branch;
                if (try attrs.element(tag, scope, document_xml.paragraph_uri, "default")) return .branch;
            }
            if (parent == .run or parent == .container or parent == .branch) {
                if (try attrs.element(tag, scope, document_xml.paragraph_uri, "container")) return .container;
                if (try attrs.element(tag, scope, document_xml.paragraph_uri, "pic")) return .picture;
                if (try attrs.element(tag, scope, document_xml.paragraph_uri, "ole")) return .ole;
                if (try drawing(tag, scope)) return .drawing;
            }
        }
        if ((parent == .border_fill or (self.mode != .header and parent == .drawing)) and try attrs.element(tag, scope, document_xml.core_uri, "fillBrush")) return .fill_brush;
        if (parent == .fill_brush and try attrs.element(tag, scope, document_xml.core_uri, "imgBrush")) return .image_brush;
        if ((parent == .picture or parent == .image_brush) and try attrs.element(tag, scope, document_xml.core_uri, "img")) return .image;
        return .other;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) return;
        if (depth == 0 or depth > self.stack.len) return error.LimitExceeded;
        const node = try self.classify(tag, scope, depth);
        const parent: Frame = if (depth == 1) .{} else self.stack[depth - 2];
        var frame: Frame = .{ .kind = node, .active = parent.active, .active_scope = parent.active_scope };
        if (self.mode == .master_page) {
            if (depth == 1) frame.active_scope = false else if (depth == 2) {
                frame.active_scope = node == .sub_list;
                frame.active = frame.active_scope;
                self.sub_lists += @intFromBool(frame.active_scope);
            }
        }
        if (parent.active and parent.kind == .switch_element and node == .branch) {
            const is_case = try attrs.element(tag, scope, document_xml.paragraph_uri, "case");
            frame.active = try selection.choose(self.allocator, tag, scope, is_case, self.options.max_attribute_bytes, self.options.branch_policy, &self.stack[depth - 2].selected);
        }
        if (tag.kind == .start) self.stack[depth - 1] = frame;
        if (!frame.active or !frame.active_scope) return;
        const kind: ?links.Kind = switch (node) {
            .font => .header_font,
            .subst_font => .header_substitute_font,
            .ole => if (self.mode == .master_page) .master_ole else .section_ole,
            .image => if (self.mode == .header) .header_brush_image else if (self.stack[depth - 2].kind == .picture) (if (self.mode == .master_page) .master_picture else .section_picture) else (if (self.mode == .master_page) .master_brush_image else .section_brush_image),
            else => null,
        };
        const raw_id = try attrs.attribute(self.allocator, tag, scope, "binaryItemIDRef", self.options.max_attribute_bytes);
        if (kind == null and raw_id == null) return;
        if (self.report.observed_sites == self.options.max_sites) {
            if (raw_id) |id| self.allocator.free(id);
            return error.LimitExceeded;
        }
        self.report.observed_sites += 1;
        if (kind) |value| return links.note(self.allocator, self.report, self.index, self.manifest, value, self.source_item_index, raw_id);
        return links.noteUnclassified(self.allocator, self.report, self.source_item_index, raw_id.?);
    }
};

/// Parses one selected XML member. The caller supplies the shared manifest
/// index, report and remaining byte budget for its own selection domain.
pub const ReadResult = struct { xml_bytes: usize, sub_lists: usize };

pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, source_item_index: usize, mode: Mode, manifest: content_manifest.Manifest, index: *const links.Index, report: *links.Report, options: Options, remaining: *usize, master_part_limit: ?usize) !ReadResult {
    const per_file = switch (mode) {
        .header => options.max_header_xml_bytes,
        .section => options.max_section_xml_bytes,
        .master_page => master_part_limit orelse return error.MissingMasterPageLimit,
    };
    const max_bytes = @min(per_file, remaining.*);
    const bytes = try archive.decode(entry, max_bytes);
    defer archive.allocator.free(bytes);
    var context: Context = .{ .allocator = a, .mode = mode, .options = options, .source_item_index = source_item_index, .manifest = manifest, .index = index, .report = report };
    _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    remaining.* -= bytes.len;
    switch (mode) {
        .header => report.header_xml_bytes = bytes.len,
        .section => report.section_xml_bytes += bytes.len,
        .master_page => {},
    }
    return .{ .xml_bytes = bytes.len, .sub_lists = context.sub_lists };
}
