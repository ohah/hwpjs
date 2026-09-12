const std = @import("std");
const core = @import("hwpjs");
pub const Prefix = struct {
    grid: core.hwp5.chart_grid_cells.Grid,
    reader: core.Reader,
    backdrop: core.hwp5.chart_backdrop.Backdrop,
    pub fn deinit(self: *Prefix) void {
        self.grid.deinit();
        self.* = undefined;
    }
};
/// Private corpus entry shared by TextBlock and Footnote probes.
pub fn read(a: std.mem.Allocator, contents: []const u8, limit: usize) !Prefix {
    var grid = try core.hwp5.chart_grid_cells.readObservedV6(a, contents, .{ .prelude = .{ .max_bytes = limit } });
    errdefer grid.deinit();
    var reader: core.Reader = .{ .bytes = contents, .offset = grid.payload_offset };
    _ = try reader.take(26);
    const backdrop = try core.hwp5.chart_backdrop.readObservedEmptyPicture(&reader, &grid.prelude.types);
    return .{ .grid = grid, .reader = reader, .backdrop = backdrop };
}
