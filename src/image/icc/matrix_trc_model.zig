const plan = @import("required_plan.zig");
const signatures = @import("signatures.zig");
const names = @import("required_tag_set.zig");
const xyz = @import("xyz_tag.zig");
const trc = @import("trc_tag.zig");
pub const Model = struct {
    /// Row-major matrix assembled from the three XYZ column tags.
    coefficients: [9]i32,
    /// Curve sample storage borrows the immutable profile bytes.
    curves: [3]trc.Curve,
    profile_semantics_deferred: bool = true,
    transform_priority_deferred: bool = true,
};
/// Explicit matrix/TRC selection, not automatic LUT priority resolution.
/// Table must come from tag_table.parse and retain immutable profile storage.
pub fn assemble(table: *const @import("tag_table.zig").Table, edition: trc.Edition) !Model {
    if (edition != .v4_2022 or table.header.version.major != 4) return error.UnsupportedIccMatrixModelEdition;
    _ = try plan.build(.{
        .edition = edition,
        .profile_class = try signatures.profileClass(table.header.profile_class),
        .data_space = table.header.data_space,
        .pcs = table.header.pcs,
        .model = .matrix,
        .measurement_white = .unknown,
    });
    var columns: [3]?[3]i32 = @splat(null);
    var curves: [3]?trc.Curve = @splat(null);
    for (table.tags) |tag| {
        const name = names.identify(tag.signature) orelse continue;
        const column: ?usize = switch (name) {
            .rXYZ => 0,
            .gXYZ => 1,
            .bXYZ => 2,
            else => null,
        };
        const channel: ?usize = switch (name) {
            .rTRC => 0,
            .gTRC => 1,
            .bTRC => 2,
            else => null,
        };
        if (column) |i| {
            if (columns[i] != null) return error.DuplicateIccTag;
            columns[i] = (try xyz.parse(tag.signature, tag.data)).?.xyz;
        }
        if (channel) |i| {
            if (curves[i] != null) return error.DuplicateIccTag;
            curves[i] = (try trc.parse(tag.signature, tag.data, edition)).?.curve;
        }
    }
    var result: Model = undefined;
    result.profile_semantics_deferred = true;
    result.transform_priority_deferred = true;
    for (0..3) |column| {
        const values = columns[column] orelse return error.MissingIccMatrixModelTag;
        result.curves[column] = curves[column] orelse return error.MissingIccMatrixModelTag;
        for (values, 0..) |v, row| result.coefficients[row * 3 + column] = v;
    }
    return result;
}
