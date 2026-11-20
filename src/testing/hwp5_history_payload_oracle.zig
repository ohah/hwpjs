//! Test-only fresh Noori payload proof, independent of Session/history cost APIs.
//! Raw lengths were counted with independent CFB/raw-DEFLATE/record parsing:
//! b7d026a6c99355023c6efd7220d1035c88e7c7a22e5bc1f98566f56da33fc893.
//! No new numeric payload answer and no historical catalog rewrite.
const std = @import("std");
const model = @import("../model/document.zig");
const Tables = @import("../hwp5/edit/created_table_values.zig").Values;
const Backgrounds = @import("../hwp5/edit/cell_background_values.zig").Values;
const ChartResources = @import("../hwp5/chart/created_resources.zig").Values;

// Explicit storage headers, not a call to the implementation under test.
// The source contract separately checks these fields against the two private
// checkpoint State declarations. Model widths remain the actual current types.
const DocumentStorage = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: model.Document,
    max_bytes: usize,
};
const TableStorage = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    document: *const anyopaque,
    document_bytes: usize,
    tables: []Tables,
    backgrounds: Backgrounds,
    charts: ChartResources,
    limit: usize,
};

pub fn freshNoori(input: []const u8) !usize {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    try std.testing.expectEqualStrings("b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f", &hex);
    // One section, 65 paragraphs, 124 text/control tokens, 3454 owned raw
    // bytes, and 139 character runs. Fresh projection owns no resource intents,
    // source rebase, generated tables, or original-cell background intents.
    return @sizeOf(DocumentStorage) + @sizeOf(TableStorage) +
        @sizeOf(model.Section) + @sizeOf(Tables) +
        65 * @sizeOf(model.Paragraph) + 124 * @sizeOf(model.Token) +
        3454 + 139 * @sizeOf(model.CharacterRun);
}
