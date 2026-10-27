//! Native test diagnostic policy; product modules and the SDK remain unchanged.
const std = @import("std");

pub fn add(b: *std.Build, core: *std.Build.Module, baseline: *std.Build.Module) *std.Build.Step.Compile {
    const traces = b.option(bool, "native-stack-traces", "Record native test stack traces (default: true)") orelse true;

    const native = b.createModule(.{
        .root_source_file = core.root_source_file,
        .target = core.resolved_target,
        .optimize = core.optimize,
    });
    // Keep the reference test-only and preserve imports for either trace policy.
    for (core.import_table.keys(), core.import_table.values()) |name, module| native.addImport(name, module);
    native.addImport("baseline", baseline);
    if (traces) return b.addTest(.{ .root_module = native });
    const runner_path = b.graph.path(.zig_lib, "compiler/test_runner.zig");
    native.addImport("zig_default_test_runner", b.createModule(.{
        .root_source_file = runner_path,
        .target = core.resolved_target,
        .optimize = core.optimize,
    }));
    return b.addTest(.{
        .root_module = native,
        .test_runner = .{ .path = b.path("tools/native-test-runner.zig"), .mode = .server },
    });
}
