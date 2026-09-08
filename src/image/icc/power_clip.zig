const Curve = @import("parametric_curve.zig").Curve;
const partitioner = @import("power_partition.zig");
const levels = @import("power_level.zig");
const locator = @import("affine_root_location.zig");
const order = @import("power_root_order.zig");
const classify = @import("power_clip_classify.zig");
pub const types = @import("power_clip_types.zig");
const Cut = struct { boundary: types.LevelRoot, at_end: bool };
fn append(plan: *types.Plan, interval: types.Interval, kind: types.Kind, direction: types.Direction) !void {
    if (plan.count == plan.pieces.len) return error.InvalidIccPowerPartitionInvariant;
    plan.pieces[plan.count] = .{ .interval = interval, .kind = kind, .direction = if (kind == .power) direction else .constant };
    plan.count += 1;
}
/// Full active power-branch clipping partition. An undecided step publishes no partial plan.
pub fn partition(comptime precision: u16, curve: Curve) !types.Result {
    const raw = try partitioner.partition(curve);
    var plan = types.Plan{ .source = raw.source orelse return .inactive };
    for (raw.pieces[0..raw.count]) |part| {
        const interval = part.power.interval;
        var current = types.Interval{ .start = .{ .rational = interval.start }, .end = .{ .rational = interval.end }, .start_included = interval.start_included, .end_included = interval.end_included };
        var kind = (try classify.initial(precision, part)) orelse return .undecided;
        if (part.direction == .constant) {
            try append(&plan, current, kind, .constant);
            continue;
        }
        var cuts: [2]Cut = undefined;
        var count: usize = 0;
        for ([_]types.Level{ .zero, .one }) |target| {
            const solutions = levels.solve(part.power.g, part.power.offset, target.encoded());
            if (solutions != .finite) return error.InvalidIccPowerPartitionInvariant;
            for (solutions.finite.roots[0..solutions.finite.count]) |root| {
                const where = try locator.locate(precision, root, part.power.a, part.power.b, interval);
                switch (where) {
                    .absent, .start => continue,
                    .undecided => return .undecided,
                    .interior, .end => {
                        if (count == cuts.len) return error.InvalidIccPowerPartitionInvariant;
                        cuts[count] = .{ .boundary = .{ .value = root, .level = target }, .at_end = where == .end };
                        count += 1;
                    },
                    .entire, .singleton => return error.InvalidIccPowerPartitionInvariant,
                }
            }
        }
        if (count == 2) {
            const relation = try order.inAffine(cuts[0].boundary.value, cuts[1].boundary.value, part.power.a);
            if (relation == .eq) return error.InvalidIccPowerPartitionInvariant;
            if (relation == .gt) {
                const tmp = cuts[0];
                cuts[0] = cuts[1];
                cuts[1] = tmp;
            }
        }
        var ended = false;
        for (cuts[0..count], 0..) |cut, index| {
            const boundary: types.Boundary = if (cut.at_end) .{ .rational = interval.end } else .{ .level_root = cut.boundary };
            var before = current;
            before.end = boundary;
            before.end_included = false;
            try append(&plan, before, kind, part.direction);
            current.start = boundary;
            current.start_included = true;
            if (cut.at_end) {
                if (index + 1 != count) return error.InvalidIccPowerPartitionInvariant;
                try append(&plan, current, if (cut.boundary.level == .zero) .zero else .one, .constant);
                ended = true;
            } else kind = classify.after(cut.boundary.level, part.direction);
        }
        if (!ended) try append(&plan, current, kind, part.direction);
    }
    return .{ .plan = plan };
}
