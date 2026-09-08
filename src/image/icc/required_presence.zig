const tags = @import("required_tag_set.zig");
const plan = @import("required_plan.zig");
pub const Report = struct {
    required: tags.Set,
    missing: tags.Set,
    adaptation_condition_deferred: bool,
    payloads_deferred: bool = true,
    computational_model_deferred: bool = true,
};
/// Signature inventory only. Duplicates, tag bytes and header/context agreement
/// must be checked by their owners; an empty missing set is not a valid profile.
pub fn inspect(ctx: plan.Context, inventory: []const [4]u8) !Report {
    return inspectInventory(ctx, inventory);
}
/// Parsed descriptors, same presence rule; header/context agreement is external.
pub fn inspectTags(ctx: plan.Context, inventory: []const @import("tag.zig").Tag) !Report {
    return inspectInventory(ctx, inventory);
}
fn inspectInventory(ctx: plan.Context, inventory: anytype) !Report {
    const p = try plan.build(ctx);
    var missing = p.required;
    for (inventory) |value| {
        const signature = if (@TypeOf(value) == [4]u8) value else value.signature;
        if (tags.identify(signature)) |name| missing.remove(name);
    }
    return .{ .required = p.required, .missing = missing, .adaptation_condition_deferred = p.adaptation_condition_deferred };
}
