//! Request-lifetime intent only. Claims and references are not execution grants.
const formatting = @import("formatting_patch.zig");
pub const edits = @import("independent_text_edits.zig");
pub const limits = struct {
    pub const request_bytes = 16 * 1024 * 1024;
    pub const request_depth = 16;
    pub const request_structure = 262144;
    pub const groups = 4096;
    pub const edits_count = 4096;
    pub const sections = 4096;
    pub const snapshot_paragraphs = 20000;
    pub const text_units = 4 * 1024 * 1024;
    pub const inserted_bytes = 4 * 1024 * 1024;
};
pub const Scope = enum { selection, @"complete-current-paragraph-snapshot" };
/// Counts include current source paragraphs and pending created-cell paragraphs.
pub const SectionCoverage = struct { section: u32, paragraphs: u32 };
pub const Coverage = struct {
    sections: []const SectionCoverage,
    paragraphs: u32,
    /// Subset of paragraphs, not an additional count to add to the total.
    created_cell_paragraphs: u32,
};
pub const Group = struct {
    ref: []const u8,
    before_units: u32,
    edits: []const edits.Edit,
    insertion: formatting.Patch = .{},
};
pub const Apply = struct {
    binding: formatting.Binding,
    scope: Scope,
    coverage: ?Coverage,
    groups: []const Group,
};
