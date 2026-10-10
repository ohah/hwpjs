//! Derived source/display UTF-16 axes; no cache, mutation, or editing permission.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const uri = @import("document_xml.zig").paragraph_uri;
const source_record_units = @import("../hwp5/body/control.zig").units(.extended);
pub fn retained(tree: *const trees.Tree, index: usize) bool {
    if (index >= tree.elements.len) return false;
    const marker = tree.elements[index];
    if (!marker.is(uri, "titleMark") or marker.first_child != null) return false;
    if (marker.end_tag) |end| if (end.start != marker.start_tag.end) return false;
    const text = marker.parent orelse return false;
    const run = tree.elements[text].parent orelse return false;
    const paragraph = tree.elements[run].parent orelse return false;
    return tree.elements[text].is(uri, "t") and tree.elements[run].is(uri, "run") and tree.elements[paragraph].is(uri, "p");
}
pub const Mark = struct { element: usize, display_unit: usize, source_unit: usize, ignore: ?bool, kind: enum { title_mark, number_setting, bookmark, anchor, section_setting, run_setting } = .title_mark };
fn displayWidth(mark: Mark) usize {
    return if (mark.kind == .anchor) 1 else 0;
}
pub const Axis = struct {
    marks: []Mark,
    display_units: usize,
    source_units: usize,
    pub fn deinit(self: *Axis, a: std.mem.Allocator) void {
        a.free(self.marks);
        self.* = undefined;
    }
    pub fn toSource(self: Axis, display: usize, affinity: enum { before, after }) !usize {
        try self.validate();
        if (display > self.display_units) return error.InvalidTextPosition;
        var source = display;
        for (self.marks) |mark| if (if (mark.kind == .anchor) display > mark.display_unit else mark.display_unit < display or (mark.display_unit == display and affinity == .after)) {
            source = std.math.add(usize, source, source_record_units - displayWidth(mark)) catch return error.LimitExceeded;
        };
        return source;
    }
    pub fn toDisplay(self: Axis, source: usize) !usize {
        try self.validate();
        if (source > self.source_units) return error.InvalidTextPosition;
        var display = source;
        for (self.marks) |mark| {
            if (source > mark.source_unit and source < mark.source_unit + source_record_units) return error.ProtectedInlineControl;
            if (source >= mark.source_unit + source_record_units) display -= source_record_units - displayWidth(mark);
        }
        return display;
    }
    fn validate(self: Axis) !void {
        var retained_units: usize = 0;
        var previous: usize = 0;
        for (self.marks) |mark| {
            if (mark.display_unit < previous or mark.display_unit > self.display_units) return error.SourceBindingMismatch;
            const expected = std.math.add(usize, mark.display_unit, retained_units) catch return error.LimitExceeded;
            if (mark.source_unit != expected) return error.SourceBindingMismatch;
            previous = std.math.add(usize, mark.display_unit, displayWidth(mark)) catch return error.LimitExceeded;
            if (previous > self.display_units) return error.SourceBindingMismatch;
            retained_units = std.math.add(usize, retained_units, source_record_units - displayWidth(mark)) catch return error.LimitExceeded;
        }
        const total = std.math.add(usize, self.display_units, retained_units) catch return error.LimitExceeded;
        if (self.source_units != total) return error.SourceBindingMismatch;
    }
};
const Atom = struct { offset: usize, units: usize = 0, mark: ?struct { element: usize, ignore: ?bool, kind: @FieldType(Mark, "kind") = .title_mark } = null };
pub fn build(a: std.mem.Allocator, tree: *const trees.Tree, sites: *const sites_mod.Sites, locations: []const @import("section_text.zig").Location, paragraph: usize) !Axis {
    const owner = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    var atoms: std.ArrayList(Atom) = .empty;
    defer atoms.deinit(a);
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        try atoms.append(a, .{ .offset = site.start, .units = try @import("text_site_edit.zig").utf16Length(site.text) });
    }
    var run = tree.elements[owner].first_child;
    while (run) |index| : (run = tree.elements[index].next_sibling) {
        if (tree.elements[index].is(uri, "linesegarray")) continue;
        if (!tree.elements[index].is(uri, "run")) return error.UnsupportedParagraphControl;
        var text = tree.elements[index].first_child;
        while (text) |text_index| : (text = tree.elements[text_index].next_sibling) {
            if (!tree.elements[text_index].is(uri, "t")) {
                if (@import("retained_bookmark.zig").directSupported(tree, text_index) or tree.elements[text_index].is(uri, "secPr")) {
                    try atoms.append(a, .{ .offset = tree.elements[text_index].start_tag.start, .mark = .{ .element = text_index, .ignore = null, .kind = if (tree.elements[text_index].is(uri, "secPr")) .section_setting else .bookmark } });
                    continue;
                }
                if (@import("run_anchor.zig").kind(tree, text_index) != null) {
                    try atoms.append(a, .{ .offset = tree.elements[text_index].start_tag.start, .mark = .{ .element = text_index, .ignore = null, .kind = .anchor } });
                    continue;
                }
                if (@import("retained_bookmark.zig").supported(tree, text_index) or @import("retained_run_metadata.zig").supported(tree, text_index)) {
                    var setting = tree.elements[text_index].first_child;
                    while (setting) |node| : (setting = tree.elements[node].next_sibling) {
                        try atoms.append(a, .{ .offset = tree.elements[node].start_tag.start, .mark = .{ .element = node, .ignore = null, .kind = if (@import("retained_bookmark.zig").settingSupported(tree, node)) .bookmark else if (@import("retained_page_number.zig").settingSupported(tree, node) or @import("retained_number_restart.zig").settingSupported(tree, node)) .number_setting else .run_setting } });
                    }
                    continue;
                }
                if (!@import("retained_page_number.zig").supported(tree, text_index) and !@import("retained_number_restart.zig").supported(tree, text_index)) return error.UnsupportedParagraphControl;
                try atoms.append(a, .{ .offset = tree.elements[text_index].start_tag.start, .mark = .{ .element = text_index, .ignore = null, .kind = .number_setting } });
                continue;
            }
            var child = tree.elements[text_index].first_child;
            while (child) |mark_index| : (child = tree.elements[mark_index].next_sibling) {
                const mark = tree.elements[mark_index];
                const inline_kind = @import("retained_inline_unit.zig").kind(tree, mark_index);
                if (inline_kind == .nb_space or inline_kind == .fw_space or inline_kind == .tab) {
                    try atoms.append(a, .{ .offset = mark.start_tag.start, .units = 1 });
                    continue;
                }
                if (!retained(tree, mark_index)) return error.UnsupportedInlineControl;
                const raw = try tree.attributeValue(a, mark_index, "", "ignore");
                const ignore: ?bool = if (raw) |value| try @import("table_xml_fields.zig").boolean(a, value, 4096) else null;
                try atoms.append(a, .{ .offset = mark.start_tag.start, .mark = .{ .element = mark_index, .ignore = ignore } });
            }
        }
    }
    std.mem.sort(Atom, atoms.items, {}, struct {
        fn less(_: void, left: Atom, right: Atom) bool {
            return left.offset < right.offset or (left.offset == right.offset and left.mark == null and right.mark != null);
        }
    }.less);
    var marks: std.ArrayList(Mark) = .empty;
    errdefer marks.deinit(a);
    var display: usize = 0;
    var source: usize = 0;
    for (atoms.items) |atom| {
        if (atom.mark) |mark| {
            try marks.append(a, .{ .element = mark.element, .display_unit = display, .source_unit = source, .ignore = mark.ignore, .kind = mark.kind });
            source = std.math.add(usize, source, source_record_units) catch return error.LimitExceeded;
            if (mark.kind == .anchor) display = std.math.add(usize, display, 1) catch return error.LimitExceeded;
        } else {
            display = std.math.add(usize, display, atom.units) catch return error.LimitExceeded;
            source = std.math.add(usize, source, atom.units) catch return error.LimitExceeded;
        }
    }
    return .{ .marks = try marks.toOwnedSlice(a), .display_units = display, .source_units = source };
}
