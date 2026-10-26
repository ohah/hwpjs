//! 명령의 detached 후보에서만 만드는 숫자 출력 계획입니다. getter는 XML을 만들지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Range = @import("character_style_display_ranges.zig").Range;
const Options = @import("text_sites.zig").Options;

pub const Plan = struct {
    ranges: []Range,
    options: Options,
    max_xml_bytes: usize,
    signature: u64,
    template_element: usize,
    derived_gaps: []@import("title_derived_gap.zig").Gap = &.{},
    derived_gap_digest: u64 = 0,

    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.ranges);
        a.free(self.derived_gaps);
        self.* = undefined;
    }

    pub fn clone(self: *const Plan, a: std.mem.Allocator) !Plan {
        var copy = self.*;
        copy.ranges = try a.dupe(Range, self.ranges);
        errdefer a.free(copy.ranges);
        copy.derived_gaps = try a.dupe(@import("title_derived_gap.zig").Gap, self.derived_gaps);
        return copy;
    }

    pub fn validate(self: *const Plan, paragraph: *const Paragraph) !void {
        if ((self.derived_gaps.len != 0 or self.derived_gap_digest != 0) and @import("title_derived_gap.zig").digest(self.derived_gaps) != self.derived_gap_digest) return error.SourceBindingMismatch;
        if (paragraph.template_element != self.template_element or paragraph.title_fragment_owners == null or paragraph.character_styles == null or signature(paragraph) != self.signature) return error.SourceBindingMismatch;
    }
};

fn scalar(hash: *std.hash.Wyhash, value: anytype) void {
    hash.update(std.mem.asBytes(&value));
}

fn optionalId(hash: *std.hash.Wyhash, id: ?u32) void {
    scalar(hash, @as(u8, @intFromBool(id != null)));
    if (id) |value| scalar(hash, value);
}

/// padding이나 포인터 값은 해시하지 않습니다. clone 뒤에도 같은 값입니다.
fn signature(paragraph: *const Paragraph) u64 {
    var hash = std.hash.Wyhash.init(0);
    scalar(&hash, paragraph.template_element);
    scalar(&hash, paragraph.sites.items.len);
    for (paragraph.sites.items) |site| {
        scalar(&hash, site.element_index);
        scalar(&hash, site.start);
        scalar(&hash, site.end);
        scalar(&hash, site.text.len);
        scalar(&hash, @as(u8, @intFromBool(site.empty_element)));
        scalar(&hash, @as(u8, @intFromBool(site.missing_text)));
        scalar(&hash, @as(u8, @intFromBool(site.anchor_boundary)));
        hash.update(site.text);
    }
    if (paragraph.character_styles) |styles| {
        scalar(&hash, styles.len);
        for (styles) |span| {
            scalar(&hash, span.start_unit);
            scalar(&hash, span.end_unit);
            scalar(&hash, span.site_start_unit);
            scalar(&hash, span.site_index);
            scalar(&hash, span.run_element);
            optionalId(&hash, span.char_shape_id);
            scalar(&hash, @as(u8, @intFromBool(span.canonical_fragment != null)));
            if (span.canonical_fragment) |fragment| scalar(&hash, fragment);
        }
    }
    if (paragraph.title_fragment_owners) |owners| {
        scalar(&hash, owners.len);
        for (owners) |owner| {
            scalar(&hash, owner.element_index);
            scalar(&hash, owner.text_element);
            scalar(&hash, owner.start_unit);
            scalar(&hash, owner.end_unit);
            optionalId(&hash, owner.char_shape_id);
        }
    }
    scalar(&hash, @as(u8, @intFromBool(paragraph.title_positions != null)));
    scalar(&hash, @as(u8, @intFromBool(paragraph.pieces != null)));
    scalar(&hash, @as(u8, @intFromBool(paragraph.protected_positions != null)));
    return hash.final();
}

/// writer와 다른 zero 추정 규칙을 구현하지 않고 같은 출력/collector를 사용합니다.
/// 임시 section은 namespace/ancestor 문맥 보존용이며 Session에 설치하거나 저장하지 않습니다.
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: Options, max_xml_bytes: usize) !?Plan {
    if (paragraph.title_fragment_owners == null) return null;
    // 기존 typed title/tab/anchor 경로를 숫자 text 전용 계획으로 새로 거부하지 않습니다.
    for (paragraph.character_styles orelse return error.InvalidTextSites) |span| {
        if (span.tab_element != null or span.anchor_element != null) {
            if (paragraph.title_output_projection != null) return error.SourceBindingMismatch;
            return null;
        }
    }
    if (paragraph.title_positions != null or paragraph.pieces != null or paragraph.protected_positions != null or paragraph.generated_id != null) return error.UnsupportedStructuralCharacterStyle;
    var fragmented_runs: std.ArrayList(usize) = .empty;
    defer fragmented_runs.deinit(a);
    const paragraph_xml = try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptionsTrace(a, tree, paragraph, &.{}, options, max_xml_bytes, &fragmented_runs);
    defer a.free(paragraph_xml);
    if (paragraph.template_element >= tree.elements.len) return error.SourceBindingMismatch;
    const source = tree.elements[paragraph.template_element];
    const bytes = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = source.start_tag.start, .end = source.end, .text = "", .serialized_xml = paragraph_xml }}, max_xml_bytes);
    defer a.free(bytes);
    var output_tree = try @import("xml_part_tree.zig").parse(a, bytes, .section, tree.section_ordinal orelse return error.InvalidSectionIndex, tree.item_index, .{ .max_xml_bytes = max_xml_bytes });
    defer output_tree.deinit(a);
    var output_sites = try @import("text_sites.zig").collect(a, &output_tree, options);
    defer output_sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &output_tree, &output_sites, options);
    defer a.free(locations);
    var output_owner: ?usize = null;
    for (output_tree.elements, 0..) |element, index| {
        if (element.start_tag.start != source.start_tag.start or !element.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
        if (output_owner != null) return error.SourceBindingMismatch;
        output_owner = index;
    }
    const owner = output_owner orelse return error.SourceBindingMismatch;
    var ordinal: ?usize = null;
    for (output_sites.items, locations) |site, location| {
        if ((try @import("paragraph_site_owner.zig").optionalAncestor(&output_tree, site.element_index)) != owner) continue;
        if (ordinal) |before| {
            if (before != location.paragraph_ordinal) return error.SourceBindingMismatch;
        } else ordinal = location.paragraph_ordinal;
    }
    const selected = ordinal orelse return error.MissingTextSite;
    try @import("plain_paragraph_policy.zig").validateForFieldText(&output_tree, &output_sites, locations, selected);
    const positions = try @import("paragraph_text_positions.zig").buildForFieldText(a, &output_tree, &output_sites, locations, selected);
    defer a.free(positions);
    // 이번 계획은 source-owned text/title만 받습니다. canonical element index를 공개하지 않습니다.
    for (positions) |position| if (position.kind != .text) return error.UnsupportedInlineControl;
    const ranges = try @import("character_style_display_ranges.zig").build(a, &output_tree, &output_sites, positions, options.max_sites);
    errdefer a.free(ranges);
    const gaps = try @import("title_derived_gap.zig").collect(a, tree, paragraph, &output_tree, owner, &output_sites, options.max_sites, fragmented_runs.items);
    return .{ .ranges = ranges, .options = options, .max_xml_bytes = max_xml_bytes, .signature = signature(paragraph), .template_element = paragraph.template_element, .derived_gaps = gaps, .derived_gap_digest = @import("title_derived_gap.zig").digest(gaps) };
}

/// 기존 계획은 새 준비가 성공한 뒤에만 버립니다. 호출 대상은 아직 미게시 후보여야 합니다.
pub fn refresh(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph) !void {
    const old = paragraph.title_output_projection orelse return;
    var next = (try prepare(a, tree, paragraph, old.options, old.max_xml_bytes)) orelse return error.SourceBindingMismatch;
    errdefer next.deinit(a);
    paragraph.title_output_projection.?.deinit(a);
    paragraph.title_output_projection = next;
}
