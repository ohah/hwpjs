//! Validated host measurements, borrowed only for the duration of layout.
const metrics = @import("layout_metrics.zig");
const types = @import("measurement_types.zig");

pub const Measurement = struct {
    request: usize,
    box: metrics.Box,
};

/// The host must return exactly one result per request in request order.
/// Ink bearings are not advance widths and must not be passed as Box.width.
pub fn validate(plan: *const types.Plan, values: []const Measurement, limits: metrics.Limits) !void {
    try metrics.validateLimits(limits);
    if (values.len != plan.requests.len) return error.EquationMeasurementCountMismatch;
    for (values, 0..) |value, index| {
        if (value.request != index) return error.EquationMeasurementOrderMismatch;
        try metrics.validate(value.box, limits);
    }
}
