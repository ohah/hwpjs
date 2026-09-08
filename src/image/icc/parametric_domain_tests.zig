const std = @import("std");
const t = std.testing;
const domain = @import("parametric_domain.zig");
const Curve = @import("parametric_curve.zig").Curve;
fn curve(kind: @import("parametric_curve.zig").Function, values: []const i32) Curve {
    var c = Curve{ .function = kind, .values = @splat(0) };
    @memcpy(c.values[0..values.len], values);
    return c;
}
test "parametric whole domain checks poles and non-real branches" {
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type0, &.{0})));
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type0, &.{-65536})));
    try domain.validate(curve(.type0, &.{32768}));
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type3, &.{ -65536, 65536, -32768, 0, 0 })));
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type3, &.{ 32768, 65536, -32768, 0, 0 })));
    // Positive integer power remains defined through a zero and on negative bases.
    try domain.validate(curve(.type3, &.{ 131072, 65536, -32768, 0, 0 }));
    try domain.validate(curve(.type3, &.{ -65536, 0, -65536, 0, 0 }));
}
test "parametric whole domain excludes inactive branch but includes x one" {
    try domain.validate(curve(.type4, &.{ 32768, -65536, -65536, 65536, 65537, 0, 0 }));
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type4, &.{ 32768, -65536, -65536, 65536, 65536, 0, 0 })));
    try domain.validate(curve(.type1, &.{ -65536, 65536, -131072 }));
    try t.expectError(error.UndefinedIccCurveThreshold, domain.validate(curve(.type1, &.{ 65536, 0, 1 })));
}
test "parametric branch fractions preserve negative a and extreme coefficients" {
    const p = (try domain.powerDomain(curve(.type2, &.{ 65536, -49, 1, 0 }))).?;
    try t.expectEqual(@as(u64, 1), p.start.numerator);
    try t.expectEqual(@as(u64, 49), p.start.denominator);
    const min = std.math.minInt(i32);
    try domain.validate(curve(.type1, &.{ 65536, min, min }));
    try t.expectError(error.UndefinedIccCurvePower, domain.validate(curve(.type1, &.{ 32768, min, min })));
    const edge = (try domain.powerDomain(curve(.type1, &.{ 65536, min, std.math.maxInt(i32) }))).?;
    try t.expectEqual(@as(u64, 2147483647), edge.start.numerator);
    try t.expectEqual(@as(u64, 2147483648), edge.start.denominator);
}
