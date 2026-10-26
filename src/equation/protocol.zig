//! Stateless JSON boundary shared by native tests and the optional WASM ABI.
const std = @import("std");
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
pub const max_input_bytes = 16 * 1024 * 1024;
pub const max_output_bytes = 32 * 1024 * 1024;
const Input = struct {
    operation: enum { measure, layout },
    source: []const u8,
    size: f64,
    script_scale: f64,
    fraction_scale: f64,
    allow_unclosed_groups: bool = false,
    measurements: ?[]const measured.Measurement = null,
    layout: ?layout.Options = null,
};
pub fn run(a: std.mem.Allocator, input: []const u8) ![]u8 {
    if (input.len > max_input_bytes) return error.EquationProtocolLimitExceeded;
    const parsed = try std.json.parseFromSlice(Input, a, input, .{ .allocate = .alloc_always });
    defer parsed.deinit();
    const value = parsed.value;
    if (value.source.len > 1024 * 1024) return error.EquationProtocolLimitExceeded;
    if (value.operation == .measure and (value.measurements != null or value.layout != null)) return error.InvalidEquationProtocolOperation;
    if (value.operation == .layout and (value.measurements == null or value.layout == null)) return error.InvalidEquationProtocolOperation;
    var tree = try parser.parse(a, value.source, .{ .delimiter_policy = .preserve_with_diagnostics });
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = value.size, .script_scale = value.script_scale, .fraction_scale = value.fraction_scale, .allow_unclosed_groups = value.allow_unclosed_groups });
    defer plan.deinit();
    const output = switch (value.operation) {
        .measure => try std.json.Stringify.valueAlloc(a, .{ .requests = plan.requests, .blockers = plan.blockers, .ready = plan.ready(), .radical_layout = true, .grid_layout = true, .matrix_delimiters = true, .decoration_layout = true, .integral_layout = true, .limit_layout = true, .open_group_recovery = true, .recovered_open_groups = plan.recovered_open_groups, .recovery_diagnostics = tree.diagnostics, .pile_layout = true }, .{}),
        .layout => blk: {
            // Never let host JSON relax native limits or increase work budgets.
            const supplied = value.layout.?;
            try @import("layout_metrics.zig").validateLimits(supplied.limits);
            var options = supplied;
            options.limits.max_extent = @min(options.limits.max_extent, 1_000_000);
            options.max_steps = @min(options.max_steps, 4 * 1024 * 1024);
            var result = try layout.build(a, &tree, &plan, value.measurements.?, options);
            defer result.deinit();
            break :blk try std.json.Stringify.valueAlloc(a, .{ .box = result.box, .glyphs = result.glyphs, .rules = result.rules, .paths = result.paths, .rectangles = result.rectangles, .curves = result.curves, .recovered_open_groups = plan.recovered_open_groups, .recovery_diagnostics = tree.diagnostics }, .{});
        },
    };
    errdefer a.free(output);
    if (output.len > max_output_bytes) return error.EquationProtocolLimitExceeded;
    return output;
}
