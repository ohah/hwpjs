const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Span = @import("contents_inline_fork.zig").Span;

pub const Relocation = struct { start: usize, end: usize, replacement: []u8 };
pub const Prepared = struct {
    relocations: []Relocation,
    pub fn deinit(self: Prepared, a: std.mem.Allocator) void {
        for (self.relocations) |item| a.free(item.replacement);
        a.free(self.relocations);
    }
};

/// Moves type declarations removed with one observed Grid cell to the first
/// surviving later reference of each type. Known wire bytes plus declaration
/// expansion must explain the complete target span.
pub fn prepare(a: std.mem.Allocator, chart: *const Contents, target: Span, known_length: usize, excluded: []const Span) !Prepared {
    if (target.start > target.end or target.end > chart.source.len) return error.InvalidChartGridCellSpan;
    const table = &chart.prefix.grid.prelude.types;
    var expansion: usize = 0;
    var relocation_count: usize = 0;
    var introduced_count: usize = 0;
    for (table.references.items) |reference| {
        const overlaps = reference.start < target.end and reference.end > target.start;
        if (!overlaps) continue;
        if (reference.start < target.start or reference.end > target.end or reference.end - reference.start < 4)
            return error.InvalidChartTypeReferenceSpan;
        try validateReference(chart, reference);
        if (!reference.introduced) {
            if (reference.end - reference.start != 4) return error.InvalidChartTypeReferenceSpan;
            continue;
        }
        introduced_count += 1;
        if (introduced_count > 3) return error.InvalidChartGridCellSpan;
        expansion = std.math.add(usize, expansion, reference.end - reference.start - 4) catch return error.LimitExceeded;
        if (try findDestination(chart, reference.id, target.end, excluded) != null) relocation_count += 1;
    }
    const expected = std.math.add(usize, known_length, expansion) catch return error.LimitExceeded;
    if (target.end - target.start != expected) return error.InvalidChartGridCellSpan;

    const relocations = try a.alloc(Relocation, relocation_count);
    errdefer a.free(relocations);
    var built: usize = 0;
    errdefer for (relocations[0..built]) |item| a.free(item.replacement);
    for (table.references.items) |reference| {
        if (!reference.introduced or reference.start < target.start or reference.end > target.end) continue;
        const destination = (try findDestination(chart, reference.id, target.end, excluded)) orelse continue;
        if (std.mem.readInt(u32, chart.source[destination.start..][0..4], .little) != reference.id)
            return error.InvalidChartTypeReferenceSpan;
        relocations[built] = .{
            .start = destination.start,
            .end = destination.end,
            .replacement = try a.dupe(u8, chart.source[reference.start..reference.end]),
        };
        built += 1;
    }
    return .{ .relocations = relocations };
}

fn validateReference(chart: *const Contents, reference: @import("type_table.zig").ReferenceSpan) !void {
    const source = chart.source;
    if (reference.start > reference.end or reference.end > source.len or reference.end - reference.start < 4 or
        std.mem.readInt(u32, source[reference.start..][0..4], .little) != reference.id)
        return error.InvalidChartTypeReferenceSpan;
    if (!reference.introduced) {
        if (reference.end - reference.start != 4) return error.InvalidChartTypeReferenceSpan;
        return;
    }
    const definition = chart.prefix.grid.prelude.types.definitions.get(reference.id) orelse return error.InvalidChartTypeReferenceSpan;
    if (reference.end - reference.start != definition.raw_name.len + 8 or
        @as(usize, std.mem.readInt(u16, source[reference.start + 4 ..][0..2], .little)) != definition.raw_name.len or
        !std.mem.eql(u8, source[reference.start + 6 ..][0..definition.raw_name.len], definition.raw_name) or
        std.mem.readInt(u16, source[reference.end - 2 ..][0..2], .little) != definition.version)
        return error.InvalidChartTypeReferenceSpan;
}

fn findDestination(chart: *const Contents, id: u32, after: usize, excluded: []const Span) !?@import("type_table.zig").ReferenceSpan {
    for (chart.prefix.grid.prelude.types.references.items) |reference| {
        if (reference.id != id or reference.introduced or reference.start < after) continue;
        try validateReference(chart, reference);
        var edited = false;
        for (excluded) |span| {
            if (reference.start < span.end and reference.end > span.start) {
                edited = true;
                break;
            }
        }
        if (!edited) return reference;
    }
    return null;
}
