//! One source binding, query projection and normalized plan per live Native session.
//! WASM modules supply their EXISTING Session/History pointers; no second document.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const p = @import("../model/formatting_projection.zig");
const Binding = @import("../model/formatting_binding.zig").State;
const Query = @import("formatting_query_request.zig").Query;
const commands = @import("formatting_patch_commands.zig");
const Budget = @import("../model/formatting_budget.zig").Budget;
pub fn Service(comptime format: @import("../model/document.zig").Format) type {
    const Backend = if (format == .hwp5) @import("../hwp5/edit/formatting_projection.zig").Backend else @import("../hwpx/formatting_projection.zig").Backend;
    return struct {
        const Self = @This();
        backend: Backend,
        lifetime: *const Binding,
        history: ?*History,
        const History = if (format == .hwp5) @import("../hwp5/edit/editor_history.zig").History else @import("../hwpx/editor_history.zig").History;
        fn revision(self: *const Self) ?u32 {
            return if (self.history) |h| h.revision() else null;
        }
        /// Query and apply share the same binding/owner resolver. No query-result
        /// cache grants later authority; each apply rechecks live revision/SSOT.
        pub fn checkBinding(self: *const Self, binding: m.Binding) !void {
            try self.lifetime.check(binding, self.revision());
        }
        pub fn resolve(self: *const Self, ref: []const u8) !m.Owner {
            return self.backend.owner(try self.lifetime.coordinate(ref));
        }
        pub fn validate(self: *const Self, owner: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
            var budget: Budget = .{ .backing = self.backend.allocator, .limit = m.limits.projection_bytes };
            var arena = std.heap.ArenaAllocator.init(budget.allocator());
            defer arena.deinit();
            var snapshot: Backend.Snapshot = .{ .allocator = if (format == .hwp5) arena.allocator() else self.backend.session.allocator };
            defer snapshot.deinit();
            var backend = self.backend;
            backend.snapshot = &snapshot;
            var scope = @import("../model/formatting_scope.zig").Scope(Backend){ .backend = backend, .allocator = arena.allocator() };
            self.validateWith(&scope, budget.allocator(), owner, ranges, patch) catch |err| return budget.classify(err);
        }
        fn validateWith(self: *const Self, scope: anytype, scratch: std.mem.Allocator, owner: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
            if (self.revision() == null) return error.HistoryNotEnabled;
            for (ranges) |range| try scope.validateRange(owner, range);
            if (patch.reset) |reset| {
                try scope.backend.authorizeOwner(owner);
                const resources = try scope.backend.resetResources(owner, scratch);
                if (reset != .paragraph) {
                    if (resources.character == null) return error.MissingResetStyleCharacter;
                    for (ranges) |range| try scope.backend.validateRange(owner, range);
                }
                if (reset != .character and resources.paragraph == null) return error.MissingResetStyleParagraph;
            }
            const a = scratch;
            const fields = try p.requestedFields(a, patch);
            defer a.free(fields);
            // Reject value-specific source constraints before admission/mutation.
            try scope.backend.preflight(scratch, owner, ranges, patch);
            // Observations share this one-call scope, never a mutable model.
            for (fields) |field| {
                const value = try p.observe(scope.allocator, scope, owner, ranges, field);
                // A source CHAR unit may still accept a dimensionless percent
                // request. The actual writer dry run above decides this case.
                const requested_spacing = format == .hwpx and std.mem.eql(u8, field, "paragraph.spacing.value") and patch.paragraph.spacing != null and value.state == .known and std.mem.eql(u8, value.writeUnavailableReason orelse "", "UnsupportedParagraphSpacingUnit");
                const metric_field = std.mem.eql(u8, field, "character.ratio") or std.mem.eql(u8, field, "character.charSpacing") or std.mem.eql(u8, field, "character.relativeSize") or std.mem.eql(u8, field, "character.offset");
                // 이 예외는 바로 앞의 동일 source writer dry-run이 성공한 sparse intent에만 적용됩니다.
                const requested_metric = metric_field and ((value.state == .unknown and std.mem.eql(u8, value.reason orelse "", "MissingLanguageMetric") and std.mem.eql(u8, value.writeUnavailableReason orelse "", "MissingSourceField")) or std.mem.eql(u8, value.writeUnavailableReason orelse "", "UnsupportedSourceMetricValue"));
                const requested_legacy_style = format == .hwp5 and std.mem.eql(u8, field, "character.underline.style") and value.state == .known and std.mem.eql(u8, value.writeUnavailableReason orelse "", "UnsupportedLegacyCharacterDecorations");
                const requested_strike_style = format == .hwpx and std.mem.eql(u8, field, "character.strike.style") and patch.character.strike_enabled == true and std.mem.eql(u8, value.writeUnavailableReason orelse "", "InactiveCharacterStrikeStyle");
                const requested_underline_creation = format == .hwpx and std.mem.eql(u8, field, "character.underline.style") and patch.character.underline_style != null and patch.character.underline_kind != null and patch.character.underline_kind.? != .none and value.state == .unknown and std.mem.eql(u8, value.reason orelse "", "MissingUnderlineStyle") and std.mem.eql(u8, value.writeUnavailableReason orelse "", "MissingSourceField");
                const requested_shadow_creation = std.mem.startsWith(u8, field, "character.shadow.") and patch.character.shadow != null and @import("../model/character_shadow.zig").complete(patch.character.shadow.?) and value.state == .unknown and std.mem.eql(u8, value.reason orelse "", "MissingShadow") and std.mem.eql(u8, value.writeUnavailableReason orelse "", "MissingSourceField");
                const resource_field = std.mem.eql(u8, field, "character.border") or std.mem.eql(u8, field, "character.background") or std.mem.eql(u8, field, "paragraph.border") or std.mem.eql(u8, field, "paragraph.background");
                const requested_resource = resource_field and value.state == .unknown and std.mem.eql(u8, value.reason orelse "", "UnknownBorderFillValue") and std.mem.eql(u8, value.writeUnavailableReason orelse "", "UnknownSourceValue");
                if (requested_resource) try scope.backend.authorize(owner, ranges, field);
                if (requested_shadow_creation) try scope.backend.authorize(owner, ranges, field);
                if (requested_metric or requested_legacy_style or requested_strike_style or requested_underline_creation) try scope.backend.authorize(owner, ranges, field);
                if (!value.writable and !requested_spacing and !requested_metric and !requested_legacy_style and !requested_strike_style and !requested_shadow_creation and !requested_underline_creation and !requested_resource) return error.FormattingTargetNotWritable;
            }
            if (comptime format == .hwp5) {
                try @import("../hwp5/edit/character_property_payload.zig").validate(patch.character);
                for (patch.fonts) |font| if (font) |value| switch (value) {
                    .id => |id| if (id > 65535) return error.InvalidFontId,
                    .name => {},
                };
            } else {
                if (patch.character.outline_kind) |kind| _ = try @import("../hwpx/character_outline_kind.zig").token(kind);
            }
            try scope.backend.validateFonts(patch);
            if (patch.paragraph.spacing) |value| try @import("../hwpx/paragraph_spacing_patch.zig").validate(value);
        }
        pub fn normalizedPlan(self: *const Self, a: std.mem.Allocator, input: m.Apply) ![]m.Operation {
            try self.checkBinding(input.binding);
            if (self.revision() == null) return error.HistoryNotEnabled;
            if (self.history.?.stats().poisoned) return error.MutationUncertain;
            if (self.history.?.stats().protocolVersion != 2) return error.AtomicFormattingRequiresOwnedHistory;
            var budget: Budget = .{ .backing = a, .limit = m.limits.projection_bytes };
            var arena = std.heap.ArenaAllocator.init(budget.allocator());
            defer arena.deinit();
            const Scoped = @import("../model/formatting_scope.zig").Scope(Backend);
            var snapshot: Backend.Snapshot = .{ .allocator = if (format == .hwp5) arena.allocator() else self.backend.session.allocator };
            defer snapshot.deinit();
            var backend = self.backend;
            backend.snapshot = &snapshot;
            var scope: Scoped = .{ .backend = backend, .allocator = arena.allocator() };
            const Resolver = struct {
                service: *const Self,
                scope: *Scoped,
                scratch: std.mem.Allocator,
                pub fn checkBinding(r: @This(), binding: m.Binding) !void {
                    try r.service.checkBinding(binding);
                }
                pub fn resolve(r: @This(), ref: []const u8) !m.Owner {
                    return r.scope.owner(try r.service.lifetime.coordinate(ref));
                }
                pub fn resolveReset(r: @This(), owner: m.Owner) !m.ResetResources {
                    return r.scope.backend.resetResources(owner, r.scratch);
                }
                pub fn validate(r: @This(), owner: m.Owner, ranges: []const m.Range, patch: m.Patch) !void {
                    try r.service.validateWith(r.scope, r.scratch, owner, ranges, patch);
                }
            };
            return m.plan(a, input, Resolver{ .service = self, .scope = &scope, .scratch = budget.allocator() }) catch |err| return budget.classify(err);
        }
        /// Both formats consume this exact plan through ONE existing history call.
        /// Ownership/error recovery remains in History; MutationUncertain propagates.
        pub fn apply(self: *const Self, a: std.mem.Allocator, input: m.Apply) !bool {
            const history = self.history orelse return error.HistoryNotEnabled;
            if (history.stats().poisoned) return error.MutationUncertain;
            try self.checkBinding(input.binding);
            const plan = try self.normalizedPlan(a, input);
            defer a.free(plan);
            return commands.apply(format, a, history, self.backend.session, plan);
        }
        pub fn capabilities(self: *const Self, a: std.mem.Allocator) ![]u8 {
            var arena = std.heap.ArenaAllocator.init(a);
            defer arena.deinit();
            const aa = arena.allocator();
            var root = p.map(aa);
            try p.put(aa, &root, "schemaVersion", p.integer(1));
            try p.put(aa, &root, "format", try p.text(aa, @tagName(format)));
            try p.put(aa, &root, "atomic", p.boolean(true));
            try p.put(aa, &root, "requiresHistoryProtocol", p.integer(2));
            try p.put(aa, &root, "coordinateSpace", try p.text(aa, "native-source-utf16"));
            var binding = p.map(aa);
            try p.put(aa, &binding, "session", try p.text(aa, try self.lifetime.session(aa)));
            try p.put(aa, &binding, "revision", if (self.revision()) |r| p.integer(r) else .null);
            try p.put(aa, &root, "binding", binding);
            var limits = p.map(aa);
            inline for (.{ .{ "requestBytes", m.limits.request_bytes }, .{ "replyBytes", m.limits.reply_bytes }, .{ "targets", m.limits.targets }, .{ "ranges", m.limits.ranges }, .{ "commands", m.limits.commands }, .{ "fontNameBytes", m.limits.font_name_bytes }, .{ "projectionBytes", m.limits.projection_bytes } }) |entry| try p.put(aa, &limits, entry[0], p.integer(entry[1]));
            try p.put(aa, &root, "limits", limits);
            var fields = p.map(aa);
            for (p.fields) |field| {
                const unsupported = false;
                const readonly = unsupported;
                var row = p.map(aa);
                try p.put(aa, &row, "readable", p.boolean(!unsupported));
                const history_ready = if (self.history) |h| h.stats().protocolVersion == 2 and !h.stats().poisoned else false;
                try p.put(aa, &row, "writable", p.boolean(!readonly and history_ready));
                if (readonly or !history_ready) try p.put(aa, &row, "reason", try p.text(aa, if (readonly) "FormattingWriterUnavailable" else "OwnedHistoryUnavailable"));
                const enums: ?[]const []const u8 = if (std.mem.eql(u8, field, "character.underline.kind"))
                    (if (format == .hwp5) &.{ "none", "bottom", "top" } else &.{ "none", "bottom", "center", "top" })
                else if (std.mem.eql(u8, field, "character.shadow.kind")) &.{ "none", "drop", "continuous" } else if (std.mem.eql(u8, field, "character.underline.style") or std.mem.eql(u8, field, "character.strike.style")) (if (format == .hwp5) &.{ "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLEWAVE", "THICK3D", "THICKREV3D", "3D" } else &.{ "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLEWAVE", "THICK3D", "THICKREV3D", "3D", "REV3D" }) else if (std.mem.eql(u8, field, "character.outlineKind"))
                    (if (format == .hwp5) &.{ "none", "solid", "dot", "thick", "dash", "dash_dot", "dash_dot_dot" } else &.{ "none", "solid" })
                else if (std.mem.eql(u8, field, "paragraph.alignment")) &.{ "LEFT", "RIGHT", "CENTER", "JUSTIFY", "DISTRIBUTE", "DISTRIBUTE_SPACE" } else if (std.mem.eql(u8, field, "character.effects.relief")) &.{ "none", "emboss", "engrave" } else if (std.mem.eql(u8, field, "character.effects.script")) &.{ "normal", "superscript", "subscript" } else null;
                if (enums) |values| {
                    var array = p.V{ .array = std.json.Array.init(aa) };
                    for (values) |value| try array.array.append(try p.text(aa, value));
                    try p.put(aa, &row, "enumValues", array);
                }
                if (std.mem.eql(u8, field, "character.size")) try p.put(aa, &row, "unit", try p.text(aa, "hundredth-point"));
                if (std.mem.eql(u8, field, "character.textColor") or std.mem.eql(u8, field, "character.underline.color") or std.mem.eql(u8, field, "character.strike.color")) try p.put(aa, &row, "unit", try p.text(aa, "RGB24"));
                if (std.mem.eql(u8, field, "character.shadow.color")) try p.put(aa, &row, "unit", try p.text(aa, "RGB24"));
                if (std.mem.eql(u8, field, "character.shadow.offsetX") or std.mem.eql(u8, field, "character.shadow.offsetY")) try p.put(aa, &row, "unit", try p.text(aa, "percent"));
                try p.put(aa, &fields, field, row);
            }
            try p.put(aa, &root, "fields", fields);
            return encode(a, root);
        }
        fn encode(a: std.mem.Allocator, root: p.V) ![]u8 {
            const buffer = try a.alloc(u8, m.limits.reply_bytes);
            defer a.free(buffer);
            var writer = std.Io.Writer.fixed(buffer);
            std.json.Stringify.value(root, .{}, &writer) catch return error.LimitExceeded;
            return a.dupe(u8, writer.buffered());
        }
        pub fn query(self: *const Self, a: std.mem.Allocator, input: Query) ![]u8 {
            var budget: Budget = .{ .backing = a, .limit = m.limits.projection_bytes };
            return self.queryWith(a, budget.allocator(), input) catch |err| return budget.classify(err);
        }
        fn queryWith(self: *const Self, a: std.mem.Allocator, scratch: std.mem.Allocator, input: Query) ![]u8 {
            try self.checkBinding(input.binding);
            var arena = std.heap.ArenaAllocator.init(scratch);
            defer arena.deinit();
            const aa = arena.allocator();
            var snapshot: Backend.Snapshot = .{ .allocator = if (format == .hwp5) aa else self.backend.session.allocator };
            defer snapshot.deinit();
            var backend = self.backend;
            backend.snapshot = &snapshot;
            var scope = @import("../model/formatting_scope.zig").Scope(Backend){ .backend = backend, .allocator = aa };
            const selected_fields = input.fields orelse &p.fields;
            var root = p.map(aa);
            try p.put(aa, &root, "schemaVersion", p.integer(1));
            var binding = p.map(aa);
            try p.put(aa, &binding, "session", try p.text(aa, input.binding.session));
            try p.put(aa, &binding, "revision", if (self.revision()) |r| p.integer(r) else .null);
            try p.put(aa, &root, "binding", binding);
            var targets = p.V{ .array = std.json.Array.init(aa) };
            var per_target = p.V{ .array = std.json.Array.init(aa) };
            const collected = try aa.alloc([]p.Observation, selected_fields.len);
            for (collected) |*values| values.* = try aa.alloc(p.Observation, input.selectors.len);
            for (input.selectors, 0..) |selector, index| {
                const owner = try scope.owner(.{ .section = selector.section, .paragraph = selector.paragraph });
                // Supplied ranges are admission inputs even for fields:[] or
                // Para-only queries. Never mint an unchecked range-bearing ref.
                for (selector.ranges) |range| try scope.validateRange(owner, range);
                const ref = try self.lifetime.reference(aa, owner);
                var target = p.map(aa);
                try p.put(aa, &target, "ref", try p.text(aa, ref));
                if (selector.ranges.len != 0) {
                    var ranges = p.V{ .array = std.json.Array.init(aa) };
                    for (selector.ranges) |range| {
                        var row = p.map(aa);
                        try p.put(aa, &row, "startUnit", p.integer(range.startUnit));
                        try p.put(aa, &row, "endUnit", p.integer(range.endUnit));
                        try ranges.array.append(row);
                    }
                    try p.put(aa, &target, "ranges", ranges);
                }
                try targets.array.append(target);
                var fields = p.map(aa);
                for (selected_fields, 0..) |field, field_index| {
                    var value = p.observe(aa, &scope, owner, selector.ranges, field) catch |err| switch (err) {
                        error.OutOfMemory => return err,
                        else => p.unavailable(@errorName(err)),
                    };
                    if (value.writable) {
                        if (self.history) |h| {
                            if (h.stats().poisoned) {
                                value.writable = false;
                                value.writeUnavailableReason = "MutationUncertain";
                            } else if (h.stats().protocolVersion != 2) {
                                value.writable = false;
                                value.writeUnavailableReason = "AtomicFormattingRequiresOwnedHistory";
                            }
                        } else {
                            value.writable = false;
                            value.writeUnavailableReason = "HistoryNotEnabled";
                        }
                    }
                    collected[field_index][index] = value;
                    try p.put(aa, &fields, field, try p.observationJson(aa, value));
                }
                var observation = p.map(aa);
                try p.put(aa, &observation, "ref", try p.text(aa, ref));
                try p.put(aa, &observation, "fields", fields);
                try per_target.array.append(observation);
            }
            var aggregate = p.map(aa);
            for (selected_fields, collected) |field, values| try p.put(aa, &aggregate, field, try p.observationJson(aa, try p.aggregate(values)));
            var observations = p.map(aa);
            try p.put(aa, &observations, "perTarget", per_target);
            try p.put(aa, &observations, "aggregate", aggregate);
            try p.put(aa, &root, "targets", targets);
            try p.put(aa, &root, "observations", observations);
            // Query is read-only: allocation/serialization failure cannot become a
            // mutation claim. Byte cap is checked before publishing the owned reply.
            return encode(a, root);
        }
    };
}
