//! Owned partial document projection shared by format adapters and editors.
//! This is deliberately not the legacy hwpjs JSON schema or a save model.
const std = @import("std");

pub const Format = enum { hwp5, hwpx };
pub const Coverage = enum { paragraph_text_and_style_references };
pub const TextEncoding = enum { utf8, utf16le };

pub const Token = struct {
    start_unit: u32,
    kind: enum { text, control },
    encoding: TextEncoding,
    /// Original encoded bytes, including any control payload and terminator.
    raw: []u8,
};

pub const CharacterRun = struct { start_unit: u32, char_shape_id: u32 };
pub const TextRange = struct { start_unit: u32, end_unit: u32, tag: u32 };
pub const FieldAttributes = struct { source_node: u32, attributes: u32 };
pub const NumberGrouping = enum { none, thousands };
/// Numeric result is authoritative; command/display bytes are derived outputs.
pub const FormulaResult = struct {
    source_node: u32,
    value: f64,
    grouping: NumberGrouping,
    /// Sticky edit history; restoring a numeric value does not undo this flag.
    modified: bool = false,
};

pub const Paragraph = struct {
    /// Null for newly created paragraphs; never forge an original node index.
    source_node: ?u32,
    /// Header template provenance for generated paragraphs, not an original node.
    header_template: ?u32 = null,
    /// Serialized paragraph ID; distinct from immutable source record index.
    /// Original duplicates/zero are preserved, never normalized on load.
    instance_id: u32 = 0,
    parent_node: ?u32,
    declared_units: u32,
    text_present: bool,
    para_shape_id: u16,
    style_id: u8,
    tokens: []Token,
    character_runs: []CharacterRun,
    /// Null means not projected; controlled editors may own explicit ranges.
    range_tags: ?[]TextRange = null,
    /// Materialized field values, not raw command copies or a second save model.
    field_attributes: ?[]FieldAttributes = null,
    formula_results: ?[]FormulaResult = null,
    /// Direct records not represented by this projection. Never treated as saved.
    deferred_direct_records: usize,

    pub fn originalNode(self: Paragraph) !u32 {
        const node = self.source_node orelse return error.MissingParagraphSource;
        if (self.header_template != null) return error.SourceBindingMismatch;
        return node;
    }

    pub fn deinit(self: *Paragraph, a: std.mem.Allocator) void {
        for (self.tokens) |token| a.free(token.raw);
        a.free(self.tokens);
        a.free(self.character_runs);
        if (self.range_tags) |ranges| a.free(ranges);
        if (self.field_attributes) |fields| a.free(fields);
        if (self.formula_results) |results| a.free(results);
        self.* = undefined;
    }
};

pub const TableCellSize = struct { source_list_node: u32, width: u32, height: u32 };
pub const PictureResizeMatrices = struct {
    translation: [6]f64,
    scale: [6]f64,
    scale_index: u16,
    display: ?[2]u32,
};
pub const PictureCurrentSize = struct {
    source_picture_node: u32,
    width: u32,
    height: u32,
    resize_matrices: ?PictureResizeMatrices = null,
};

pub const Section = struct {
    paragraphs: []Paragraph,
    /// All source records, including those outside represented paragraphs.
    source_record_count: usize,
    table_cell_sizes: ?[]TableCellSize = null,
    picture_current_sizes: ?[]PictureCurrentSize = null,

    pub fn deinit(self: *Section, a: std.mem.Allocator) void {
        for (self.paragraphs) |*paragraph| paragraph.deinit(a);
        a.free(self.paragraphs);
        if (self.table_cell_sizes) |values| a.free(values);
        if (self.picture_current_sizes) |values| a.free(values);
        self.* = undefined;
    }
};

pub const ParagraphMarginPatch = struct {
    left: ?i32 = null,
    right: ?i32 = null,
    indent: ?i32 = null,
    before: ?i32 = null,
    after: ?i32 = null,
};
pub const ParagraphSpacing = struct { kind: u32, value: i32 };
pub const CharacterUnderlineKind = enum(u2) { none, bottom, center, top };
pub const CharacterPropertyPatch = struct { size: ?i32 = null, bold: ?bool = null, italic: ?bool = null, emboss: ?bool = null, engrave: ?bool = null, superscript: ?bool = null, subscript: ?bool = null, outline_kind: ?@import("character_outline_kind.zig").Kind = null, strike_enabled: ?bool = null, underline_kind: ?CharacterUnderlineKind = null, underline_color: ?u32 = null, text_color: ?u32 = null, shade: ?@import("shade_color.zig").Intent = null, font_ids: ?@import("character_fonts.zig").Values = null };
pub const CharacterResourceIntent = struct { source_id: u32, properties: CharacterPropertyPatch };
pub const ParagraphResourceIntent = struct { source_id: u16, alignment: u3, margins: ParagraphMarginPatch = .{}, spacing: ?ParagraphSpacing = null };
pub const Document = struct {
    format: Format,
    coverage: Coverage = .paragraph_text_and_style_references,
    sections: []Section,
    paragraph_resources: []ParagraphResourceIntent = &.{},
    character_resources: []CharacterResourceIntent = &.{},
    font_resources: @import("font_resource_values.zig").Values = .{},

    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        a.free(self.paragraph_resources);
        a.free(self.character_resources);
        self.font_resources.deinit(a);
        for (self.sections) |*section| section.deinit(a);
        a.free(self.sections);
        self.* = undefined;
    }
};
