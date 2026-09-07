const xyz = @import("xyz_type.zig");
/// ICC.1:2001-04 section 6.5.26. Does not impose this rule on newer editions.
pub fn validateV2_2001(array: xyz.Array) !void {
    for (0..array.count()) |i| {
        for (try array.at(i)) |value| if (value < 0) return error.InvalidIccV2XyzValue;
    }
}
