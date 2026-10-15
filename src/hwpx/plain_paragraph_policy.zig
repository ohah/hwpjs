//! Eligibility for the plain path, not a general paragraph/control parser.
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validate(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !void {
    return validateWithTabs(tree, sites, locations, paragraph, false);
}

pub fn validateWithTabs(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize, allow_tabs: bool) !void {
    return validateMode(tree, sites, locations, paragraph, allow_tabs, false, false);
}

pub fn validateWithAnchors(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !void {
    return validateMode(tree, sites, locations, paragraph, true, true, false);
}

pub fn validateForCharacterFormat(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !void {
    return validateMode(tree, sites, locations, paragraph, true, false, true);
}
pub fn validateForFieldText(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) !void {
    return validateMode(tree, sites, locations, paragraph, true, true, true);
}

fn validateMode(tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize, allow_tabs: bool, allow_anchors: bool, allow_fields: bool) !void {
    const paragraph_index = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    var has_title_marker = false;
    var has_bookmark = false;
    var has_anchor = false;
    var has_bookmark_unsupported = false;
    var has_other_run_content = false;
    var has_non_space_inline = false;
    var has_line_break = false;
    var first_text_start: usize = tree.source.len;
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal == paragraph and !site.anchor_boundary) first_text_start = @min(first_text_start, site.start);
    }
    var child = tree.elements[paragraph_index].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "run")) {
            var run_child = element.first_child;
            while (run_child) |run_index| {
                const content = tree.elements[run_index];
                if (@import("retained_markpen_marker.zig").supported(tree, run_index)) {
                    run_child = content.next_sibling;
                    continue;
                }
                const bookmark = @import("retained_bookmark.zig").supported(tree, run_index) or @import("retained_bookmark.zig").directSupported(tree, run_index);
                if (bookmark) has_bookmark = true;
                const retained_field = allow_fields and @import("retained_field_marker.zig").supported(tree, run_index);
                if (!content.is(uri, "t") and !bookmark and !retained_field and !content.is(uri, "secPr") and !@import("retained_run_metadata.zig").supported(tree, run_index) and !(allow_anchors and @import("run_anchor.zig").kind(tree, run_index) != null)) has_bookmark_unsupported = true;
                if (!content.is(uri, "t") and !@import("retained_page_number.zig").supported(tree, run_index) and !@import("retained_number_restart.zig").supported(tree, run_index) and !@import("retained_bookmark.zig").supported(tree, run_index) and !@import("retained_run_metadata.zig").supported(tree, run_index) and !(allow_anchors and @import("run_anchor.zig").kind(tree, run_index) != null)) has_other_run_content = true;
                if (allow_anchors and @import("run_anchor.zig").kind(tree, run_index) != null) {
                    has_anchor = true;
                    run_child = content.next_sibling;
                    continue;
                }
                if (@import("retained_bookmark.zig").directSupported(tree, run_index)) {
                    run_child = content.next_sibling;
                    continue;
                }
                // Section metadata has no text position; field/object/switch
                // semantics are not projected by this plain editing path.
                if (content.is(uri, "ctrl")) {
                    if (allow_fields and @import("retained_field_marker.zig").supported(tree, run_index)) {
                        run_child = content.next_sibling;
                        continue;
                    }
                    if (@import("retained_note_number.zig").supported(tree, run_index, paragraph_index, first_text_start)) {
                        run_child = content.next_sibling;
                        continue;
                    }
                    if (!@import("retained_run_metadata.zig").supported(tree, run_index)) return error.UnsupportedParagraphControl;
                } else if (!content.is(uri, "t") and !content.is(uri, "secPr")) return error.UnsupportedParagraphControl;
                run_child = content.next_sibling;
            }
        } else if (!element.is(uri, "linesegarray")) return error.UnsupportedParagraphControl;
        child = element.next_sibling;
    }
    for (sites.items, locations) |site, location| {
        if (location.paragraph_ordinal != paragraph) continue;
        // Synthetic run sites have no inline text children. Direct run
        // controls were checked above, including the protected-anchor mode.
        if (site.missing_text and tree.elements[site.element_index].is(uri, "run")) continue;
        var inline_child = tree.elements[site.element_index].first_child;
        while (inline_child) |inline_index| {
            const inline_element = tree.elements[inline_index];
            if (@import("retained_markpen_marker.zig").supported(tree, inline_index)) {
                inline_child = inline_element.next_sibling;
                continue;
            }
            if (@import("title_mark_axis.zig").retained(tree, inline_index)) {
                has_title_marker = true;
                inline_child = inline_element.next_sibling;
                continue;
            }
            if (!allow_tabs or !@import("retained_inline_unit.zig").supported(tree, inline_index)) return error.UnsupportedInlineControl;
            const inline_kind = @import("retained_inline_unit.zig").kind(tree, inline_index);
            if (inline_kind != .nb_space and inline_kind != .fw_space) has_non_space_inline = true;
            if (inline_kind == .line_break) has_line_break = true;
            inline_child = inline_element.next_sibling;
        }
    }
    if (has_title_marker and has_anchor and !allow_anchors) return error.UnsupportedParagraphControl;
    if (has_title_marker and has_other_run_content) return error.UnsupportedParagraphControl;
    if (has_bookmark and has_bookmark_unsupported) return error.UnsupportedParagraphControl;
    if (has_title_marker and has_line_break) return error.UnsupportedInlineControl;
    if (has_bookmark and has_non_space_inline) return error.UnsupportedInlineControl;
}
