//! Own deterministic saved 2x2 table, authored before the insets operation under test.
//! Defaults differ from dormant cell values so serializer regressions cannot hide at zero.
const std = @import("std");
pub fn make(a: std.mem.Allocator) ![]u8 {
    const seed = try @import("cell_vertical_alignment_file_fixture.zig").make(a);
    defer a.free(seed);
    var session = try @import("editor_session.zig").open(a, seed, .{});
    defer session.deinit();
    const section = session.sections[0];
    const xml = section.tree.source;
    const table_before = "<hp:inMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/>";
    const cell_before = "<hp:cellMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/>";
    if (std.mem.count(u8, xml, table_before) != 1 or std.mem.count(u8, xml, cell_before) != 4) return error.OwnCellInsetsFixturePreimageMismatch;
    const table = try std.mem.replaceOwned(u8, a, xml, table_before, "<hp:inMargin left=\"144\" right=\"288\" top=\"432\" bottom=\"576\"/>");
    defer a.free(table);
    const cells = try std.mem.replaceOwned(u8, a, table, cell_before, "<hp:cellMargin left=\"10\" right=\"20\" top=\"30\" bottom=\"40\"/>");
    defer a.free(cells);
    return @import("../zip/replace_writer.zig").write(a, seed, &.{.{ .entry_index = section.entry_index, .bytes = cells }}, .{ .max_output_bytes = session.options.max_output_bytes });
}
