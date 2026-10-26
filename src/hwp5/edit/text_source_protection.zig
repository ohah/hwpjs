//! Extra source protection, not paragraph/range write permission.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Snapshot = struct {
    mode: enum { strict, retained_click, retained_memo, retained_company },
    protected_paragraphs: []bool,
    retained_headers: ?usize,

    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        a.free(self.protected_paragraphs);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, decoded: []const []const u8, version: Version, section: usize, current: model.Section) !Snapshot {
    const policy = @import("text_source_policy.zig");
    try policy.validateUnselected(a, decoded, version, section);
    policy.validateSelected(a, decoded[section], version) catch |err| switch (err) {
        error.UnsupportedSectionControl => {
            if (try @import("company_source.zig").has(decoded[section])) {
                const company = try @import("company_text_protection.zig").read(a, decoded[section], version, current);
                return .{ .mode = .retained_company, .protected_paragraphs = company.protected_paragraphs, .retained_headers = company.retained_headers };
            }
            const plan = try @import("memo_text_protection.zig").read(a, decoded[section], version, current);
            return .{ .mode = .retained_memo, .protected_paragraphs = plan.protected_paragraphs, .retained_headers = plan.retained_headers };
        },
        error.UnsupportedCrossParagraphField => {
            const plan = try @import("click_field_retention.zig").read(a, decoded[section], version, current);
            return .{ .mode = .retained_click, .protected_paragraphs = plan.protected_paragraphs, .retained_headers = plan.bound_headers };
        },
        else => return err,
    };
    const protected = try a.alloc(bool, current.paragraphs.len);
    @memset(protected, false);
    return .{ .mode = .strict, .protected_paragraphs = protected, .retained_headers = null };
}
