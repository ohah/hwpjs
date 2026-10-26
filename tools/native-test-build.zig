//! Native test diagnostic policy; product modules and the SDK remain unchanged.
const std = @import("std");

pub fn add(b: *std.Build, core: *std.Build.Module) *std.Build.Step.Compile {
    const traces = b.option(bool, "native-stack-traces", "Record native test stack traces (default: true)") orelse true;
    if (traces) return b.addTest(.{ .root_module = core });

    const native = b.createModule(.{
        .root_source_file = core.root_source_file,
        .target = core.resolved_target,
        .optimize = core.optimize,
    });
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
