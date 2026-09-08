const std = @import("std");
const types = @import("trend_evidence.zig");
test "trend evidence distinguishes missing proof from proof of both directions" {
    const expected = [_]types.Trend{ .constant, .nondecreasing, .nonincreasing, .nonmonotonic, .undecided, .undecided, .undecided, .nonmonotonic };
    for (expected, 0..) |value, bits| {
        var evidence: types.Evidence = .{};
        evidence.add(.constant);
        if (bits & 1 != 0) evidence.add(.increasing);
        if (bits & 2 != 0) evidence.jump(.lt);
        if (bits & 4 != 0) evidence.jump(null);
        evidence.jump(.eq);
        try std.testing.expectEqual(value, evidence.finish());
    }
    var evidence: types.Evidence = .{};
    evidence.jump(.gt);
    try std.testing.expectEqual(.nondecreasing, evidence.finish());
    evidence.add(.decreasing);
    try std.testing.expectEqual(.nonmonotonic, evidence.finish());
}
