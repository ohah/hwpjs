const m = @import("layout_metrics.zig");
pub const Result = struct { box: m.Box, first: m.Placement, second: m.Placement };
/// Baseline-aligned associative row composition; no font measurement policy.
pub fn join(first: m.Box, second: m.Box, limits: m.Limits) !Result {
    try m.validate(first, limits);
    try m.validate(second, limits);
    const placements = [_]m.Placement{
        .{ .box = first, .x = 0, .baseline = 0 },
        .{ .box = second, .x = first.width, .baseline = 0 },
    };
    return .{ .box = try m.envelope(first.width + second.width, &placements, limits), .first = placements[0], .second = placements[1] };
}
