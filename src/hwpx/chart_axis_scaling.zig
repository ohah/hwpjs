//! Explicit axis scale inputs, not an automatic range or layout policy.
const std = @import("std");
const Tree = @import("chart_tree.zig").Tree;
const scalar = @import("chart_scalar_field.zig");
const uri = @import("chart_namespace.zig").uri;
pub const Orientation = enum { minMax, maxMin };
pub const DisplayIssue = enum { missing_value, non_finite, invalid_range, invalid_log_base, non_positive_log_range };
pub const Scaling = struct {
    node: usize,
    orientation: ?scalar.Field(Orientation) = null,
    minimum: ?scalar.Field(scalar.Number) = null,
    maximum: ?scalar.Field(scalar.Number) = null,
    log_base: ?scalar.Field(scalar.Number) = null,
    pub fn displayIssue(self: Scaling) ?DisplayIssue {
        if (self.orientation) |field| if (field.value == null) return .missing_value;
        for ([_]?scalar.Field(scalar.Number){ self.minimum, self.maximum, self.log_base }) |field| {
            if (field) |present| {
                const value = present.value orelse return .missing_value;
                if (value != .finite) return .non_finite;
            }
        }
        if (self.log_base) |field| if (field.value) |value| {
            if (value.finite < 2 or value.finite > 1000) return .invalid_log_base;
        };
        if (self.minimum) |low| if (self.maximum) |high| {
            if (low.value != null and high.value != null and low.value.?.finite >= high.value.?.finite) return .invalid_range;
        };
        if (self.log_base != null) {
            if (self.minimum) |field| if (field.value) |value| {
                if (value.finite <= 0) return .non_positive_log_range;
            };
            if (self.maximum) |field| if (field.value) |value| {
                if (value.finite <= 0) return .non_positive_log_range;
            };
        }
        return null;
    }
};

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Scaling {
    if (node >= tree.elements.len or !tree.elements[node].is(uri, "scaling")) return error.InvalidChartAxisScaling;
    var output: Scaling = .{ .node = node };
    var child = tree.elements[node].first_child;
    while (child) |index| {
        const field = tree.elements[index];
        if (field.is(uri, "orientation")) {
            if (output.orientation != null) return error.DuplicateChartAxisScalingField;
            output.orientation = try scalar.read(Orientation, a, tree, index, limit, error.InvalidChartAxisScaling);
        } else if (field.is(uri, "min")) {
            if (output.minimum != null) return error.DuplicateChartAxisScalingField;
            output.minimum = try scalar.read(scalar.Number, a, tree, index, limit, error.InvalidChartAxisScaling);
        } else if (field.is(uri, "max")) {
            if (output.maximum != null) return error.DuplicateChartAxisScalingField;
            output.maximum = try scalar.read(scalar.Number, a, tree, index, limit, error.InvalidChartAxisScaling);
        } else if (field.is(uri, "logBase")) {
            if (output.log_base != null) return error.DuplicateChartAxisScalingField;
            output.log_base = try scalar.read(scalar.Number, a, tree, index, limit, error.InvalidChartAxisScaling);
        }
        child = field.next_sibling;
    }
    return output;
}
