//! Read-only, owned document projection shared by format adapters.
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

pub const Paragraph = struct {
    source_node: u32,
    parent_node: ?u32,
    declared_units: u32,
    text_present: bool,
    para_shape_id: u16,
    style_id: u8,
    tokens: []Token,
    character_runs: []CharacterRun,
    /// Direct records not represented by this projection. Never treated as saved.
    deferred_direct_records: usize,

    pub fn deinit(self: *Paragraph, a: std.mem.Allocator) void {
        for (self.tokens) |token| a.free(token.raw);
        a.free(self.tokens);
        a.free(self.character_runs);
        self.* = undefined;
    }
};

pub const Section = struct {
    paragraphs: []Paragraph,
    /// All source records, including those outside represented paragraphs.
    source_record_count: usize,

    pub fn deinit(self: *Section, a: std.mem.Allocator) void {
        for (self.paragraphs) |*paragraph| paragraph.deinit(a);
        a.free(self.paragraphs);
        self.* = undefined;
    }
};

pub const Document = struct {
    format: Format,
    coverage: Coverage = .paragraph_text_and_style_references,
    sections: []Section,

    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        for (self.sections) |*section| section.deinit(a);
        a.free(self.sections);
        self.* = undefined;
    }
};
