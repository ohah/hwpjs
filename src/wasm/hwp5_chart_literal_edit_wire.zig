//! Optional ABI v1. Strict finite portable numbers; all 64-bit identities use words.
//! Raw ABI bytes cannot authenticate a painter. The worker must own final rasterization.
const std = @import("std");
const types = @import("../hwp5/chart/literal_edit_request.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
pub const version: u32 = 1;
pub const max_request_bytes = 16 * 1024 * 1024;
pub const max_reply_bytes = 16 * 1024 * 1024;
pub const max_png_bytes = 8 * 1024 * 1024;
pub const Words = struct {
    lo: u32,
    hi: u32,
    pub fn from(integer: u64) Words {
        return .{ .lo = @truncate(integer), .hi = @truncate(integer >> 32) };
    }
    pub fn value(self: Words) u64 {
        return @as(u64, self.hi) << 32 | self.lo;
    }
};
pub const Ticket = struct {
    document: Words,
    generation: Words,
    owner: Words,
    epoch: Words,
    pub fn from(t: epoch.Ticket) Ticket {
        return .{ .document = Words.from(t.binding.document), .generation = Words.from(t.binding.generation), .owner = Words.from(t.binding.owner), .epoch = Words.from(t.epoch) };
    }
    pub fn native(self: Ticket) epoch.Ticket {
        return .{ .binding = .{ .document = self.document.value(), .generation = self.generation.value(), .owner = self.owner.value() }, .epoch = self.epoch.value() };
    }
};
pub const Witness = struct {
    profile: @FieldType(types.Plan, "profile"),
    ticket: Ticket,
    viewEpoch: Words,
    historyRevision: u32,
    owners: []const types.Target,
    source_xml_sha256: [32]u8,
    pixel_width: u32,
    pixel_height: u32,
    pub fn plan(self: Witness, edits: []const types.Edit) types.Plan {
        return .{ .profile = self.profile, .binding = self.ticket.native(), .owners = self.owners, .source_xml_sha256 = self.source_xml_sha256, .edits = edits };
    }
};
pub const Preview = struct { schemaVersion: u32, witness: Witness, edits: []const types.Edit };
pub const Rendered = struct { source_xml_sha256: [32]u8, pixel_width: u32, pixel_height: u32 };
pub const Commit = struct { schemaVersion: u32, witness: Witness, edits: []const types.Edit, rendered: ?Rendered };
pub fn parse(comptime T: type, a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(T) {
    if (bytes.len == 0 or bytes.len > max_request_bytes) return error.LimitExceeded;
    const parsed = try std.json.parseFromSlice(T, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
    errdefer parsed.deinit();
    if (parsed.value.schemaVersion != version) return error.UnsupportedChartLiteralEditWire;
    try types.validate(parsed.value.witness.plan(parsed.value.edits));
    const witness = parsed.value.witness;
    if (witness.pixel_width < 64 or witness.pixel_height < 64 or witness.pixel_width > 2048 or witness.pixel_height > 2048 or @as(u64, witness.pixel_width) * witness.pixel_height > 4 * 1024 * 1024) return error.ChartCreatePreviewPixelLimit;
    return parsed;
}
pub fn validateFence(witness: Witness, ticket: epoch.Ticket, view: u64, revision: u32) !void {
    const supplied = witness.ticket.native();
    if (!std.meta.eql(supplied.binding, ticket.binding)) return error.SourceBindingMismatch;
    if (supplied.epoch != ticket.epoch) return error.StaleMutationEpoch;
    if (witness.viewEpoch.value() != view or witness.historyRevision != revision) return error.StaleCurrentReference;
}
pub fn rendered(w: ?Rendered, image: []const u8) !?@import("../hwp5/chart/create_rendered_resources.zig").Payload {
    if (image.len > max_png_bytes) return error.LimitExceeded;
    const r = w orelse {
        if (image.len != 0) return error.UnexpectedChartLiteralEditNoopRaster;
        return null;
    };
    if (image.len == 0) return error.MissingChartLiteralEditRaster;
    return .{ .source_xml_sha256 = r.source_xml_sha256, .pixel_width = r.pixel_width, .pixel_height = r.pixel_height, .bytes = image };
}
pub fn lease(a: std.mem.Allocator, value: *const @import("../hwp5/chart/literal_edit_lease.zig").Lease, view: u64, revision: u32) ![]u8 {
    return @import("../json/bounded_stringify.zig").encode(a, .{
        .schemaVersion = version,
        .scope = "hwp5-chart-literal-edit-lease",
        .executionAuthority = false,
        .witness = Witness{ .profile = value.context.patch.profile, .ticket = Ticket.from(value.binding), .viewEpoch = Words.from(view), .historyRevision = revision, .owners = &.{value.target}, .source_xml_sha256 = value.source_xml_sha256, .pixel_width = value.context.input.width, .pixel_height = value.context.input.height },
        .literals = value.context.patch.data.data,
        .limits = .{ .owners = types.max_owners, .logicalEdits = types.max_edits, .inputValueBytes = types.max_input_bytes, .requestBytes = max_request_bytes, .replyBytes = max_reply_bytes, .pngBytes = max_png_bytes },
    }, max_reply_bytes);
}
