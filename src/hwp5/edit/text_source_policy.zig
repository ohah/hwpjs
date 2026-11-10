//! Conservative whole-source policy. Scoped protection is queried separately.
const std = @import("std");
pub fn validate(a: std.mem.Allocator, decoded: []const []const u8, version: @import("../version.zig").Version, section: usize) !void {
    try validateUnselected(a, decoded, version, section);
    try validateSelected(a, decoded[section], version);
}

pub fn validateUnselected(a: std.mem.Allocator, decoded: []const []const u8, version: @import("../version.zig").Version, section: usize) !void {
    if (section >= decoded.len) return error.InvalidSection;
    for (decoded, 0..) |bytes, index| {
        if (@import("builtin").is_test) Testing.slot();
        if (index != section) try validateOther(a, bytes, version);
    }
}

pub fn validateSelected(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    const policy = @import("source_policy.zig");
    if (try policy.hasNamedFields(source)) {
        try policy.validateFieldTextTransaction(a, source, version);
        try @import("field_source_bindings.zig").validateText(a, source, version);
    } else _ = try policy.hasFormulas(a, source, version);
}

/// Same unselected SSOT for one entry in an already selected batch inventory.
pub const validateUnselectedSection = validateOther;

fn validateOther(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version) !void {
    if (@import("builtin").is_test) Testing.policy(source.len);
    try @import("source_policy.zig").validateUnselectedTextSection(a, source, version);
}

/// Test-only observer: counts actual original/scoped SSOT calls, not a model.
pub const Work = if (@import("builtin").is_test) struct {
    policy_calls: usize = 0,
    policy_bytes: usize = 0,
    scanned_slots: usize = 0,
    bound_slots: usize = 0,
    scoped_requests: usize = 0,
} else void;
pub const Testing = if (@import("builtin").is_test) struct {
    threadlocal var active: ?*Work = null;
    pub fn watch(work: *Work) void {
        std.debug.assert(active == null);
        active = work;
    }
    pub fn unwatch() void {
        active = null;
    }
    fn slot() void {
        if (active) |w| w.scanned_slots += 1;
    }
    fn policy(bytes: usize) void {
        if (active) |w| {
            w.policy_calls += 1;
            w.policy_bytes += bytes;
        }
    }
    fn bind(slots: usize) void {
        if (active) |w| w.bound_slots += slots;
    }
    fn request() void {
        if (active) |w| w.scoped_requests += 1;
    }
} else struct {};

const Version = @import("../version.zig").Version;
const Ticket = @import("../../model/history_mutation_epoch.zig").Ticket;
const PreparedState = struct {
    allocator: std.mem.Allocator,
    owner: *const anyopaque,
    list: []const []const u8,
    bindings: []const []const u8,
    version: Version,
    ticket: Ticket,
    phase: union(enum) { none, except: usize, all } = .none,
};
/// Request-local immutable unselected-policy result. Construction owns only
/// source pointer/length bindings, not bytes or a caller-supplied success bit.
/// Source bytes/slots must stay immutable and owner/ticket live until destroy.
/// The Session constructor supplies these facts from its private state.
pub const UnselectedContext = opaque {
    fn state(self: *UnselectedContext) *PreparedState {
        return @ptrCast(@alignCast(self));
    }
    pub fn create(a: std.mem.Allocator, owner: *const anyopaque, source: []const []const u8, version: Version, ticket: Ticket) !*UnselectedContext {
        const self = try a.create(PreparedState);
        errdefer a.destroy(self);
        const bindings = try a.dupe([]const u8, source);
        self.* = .{ .allocator = a, .owner = owner, .list = source, .bindings = bindings, .version = version, .ticket = ticket };
        if (@import("builtin").is_test) Testing.bind(source.len);
        return @ptrCast(self);
    }
    /// First selected source keeps the original SSOT/error/OOM ordering before
    /// introducing cache allocations. Only that successful pass becomes proof.
    pub fn prepareFirst(a: std.mem.Allocator, owner: *const anyopaque, source: []const []const u8, version: Version, ticket: Ticket, section: usize) !*UnselectedContext {
        try validateUnselected(a, source, version, section);
        const context = try create(a, owner, source, version, ticket);
        context.state().phase = .{ .except = section };
        return context;
    }
    pub fn destroy(self: *UnselectedContext) void {
        const s = self.state();
        const a = s.allocator;
        a.free(s.bindings);
        a.destroy(s);
    }
    fn bound(s: *const PreparedState, source: []const []const u8, index: usize) !void {
        if (s.bindings[index].ptr != source[index].ptr or s.bindings[index].len != source[index].len) return error.SourceBindingMismatch;
    }
    pub fn validate(self: *UnselectedContext, owner: *const anyopaque, source: []const []const u8, version: Version, ticket: Ticket, section: usize) !void {
        const s = self.state();
        if (owner != s.owner or source.ptr != s.list.ptr or source.len != s.list.len or version.raw != s.version.raw or !std.meta.eql(ticket, s.ticket)) return error.SourceBindingMismatch;
        if (section >= source.len) return error.InvalidSection;
        try bound(s, source, section);
        if (@import("builtin").is_test) Testing.request();
        switch (s.phase) {
            .none => {
                for (source, 0..) |bytes, i| {
                    if (@import("builtin").is_test) Testing.slot();
                    try bound(s, source, i);
                    if (i != section) try validateOther(s.allocator, bytes, version);
                }
                // Only successful complete passes are cached. Failure/OOM keeps
                // the old order on retry and never grants partial acceptance.
                s.phase = .{ .except = section };
            },
            .except => |excluded| if (section != excluded) {
                try bound(s, source, excluded);
                try validateOther(s.allocator, source[excluded], version);
                s.phase = .all;
            },
            .all => {},
        }
    }
};
