const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const grids = @import("grid_cells.zig");
const transitions = @import("grid_backdrop.zig");
const footnotes = @import("footnote.zig");
const legends = @import("legend.zig");
const objects = @import("object_table.zig");
pub const Options = struct {
    grid: grids.Options = .{},
    footnote: @import("text_block.zig").Options = .{},
    objects: objects.Options = .{},
    max_legend_name_bytes: usize = 65535,
};
pub const Prefix = struct {
    grid: grids.Grid,
    transition: transitions.Block,
    footnote: footnotes.Footnote,
    objects: objects.Table,
    legend: legends.Legend,
    end: usize,
    pub fn deinit(self: *Prefix) void {
        self.objects.deinit();
        self.grid.deinit();
        self.* = undefined;
    }
};
/// Selected Contents v6 through Legend. Owns Grid/table storage; Strings borrow
/// bytes. No root/grid opaque-word identity inference. Frees all on failure.
pub fn readObservedV6(a: std.mem.Allocator, bytes: []const u8, options: Options) !Prefix {
    var grid = try grids.readObservedV6(a, bytes, options.grid);
    errdefer grid.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = grid.payload_offset };
    const transition = try transitions.readObservedEmptyPicture(&reader, &grid.prelude.types);
    const footnote = try footnotes.readObservedV1(&reader, &grid.prelude.types, options.footnote);
    var scope = objects.Table.init(a, options.objects);
    errdefer scope.deinit();
    try @import("initial_objects.zig").register(&scope, grid, transition.backdrop, footnote);
    const legend = try legends.readObservedV1(&reader, &grid.prelude.types, &scope, options.max_legend_name_bytes);
    return .{ .grid = grid, .transition = transition, .footnote = footnote, .objects = scope, .legend = legend, .end = reader.offset };
}
