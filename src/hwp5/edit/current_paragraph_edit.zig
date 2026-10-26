//! Native current-view edit contract, not a raw source paragraph ordinal.
pub const Splice = struct {
    section: usize,
    reference: @import("created_table_paragraphs.zig").Reference,
    start_unit: u32,
    end_unit: u32,
    utf8: []const u8,
};
