//! Delegate all execution and result accounting to the installed Zig runner.
const std = @import("std");
const default_runner = @import("zig_default_test_runner");

pub const std_options: std.Options = .{
    .logFn = default_runner.std_options.logFn,
    .allow_stack_tracing = false,
};

pub const main = default_runner.main;
