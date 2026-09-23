const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");

const version_uri = "http://www.hancom.co.kr/hwpml/2011/version";

pub const Version = struct {
    major: u32,
    minor: u32,
    micro: ?u32,
    build_number: ?u32,
    patch: ?u32,
    revision: ?u32,
    os: ?u32,
    xml_version: ?[]u8,
    target_application: ?[]u8,
    application: ?[]u8,
    app_version: ?[]u8,
    xml_bytes: usize,

    pub fn deinit(self: *Version, a: std.mem.Allocator) void {
        if (self.xml_version) |value| a.free(value);
        if (self.target_application) |value| a.free(value);
        if (self.application) |value| a.free(value);
        if (self.app_version) |value| a.free(value);
        self.* = undefined;
    }
};

const Context = struct {
    allocator: std.mem.Allocator,
    max_attribute_bytes: usize,
    version: ?Version = null,

    fn number(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, name: []const u8) !?u32 {
        const value = (try attrs.attribute(self.allocator, tag, scope, name, self.max_attribute_bytes)) orelse return null;
        defer self.allocator.free(value);
        if (value.len == 0) return error.InvalidVersionNumber;
        return std.fmt.parseInt(u32, value, 10) catch return error.InvalidVersionNumber;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end or depth != 1) return;
        if (!try attrs.element(tag, scope, version_uri, "HCFVersion")) return error.InvalidVersionRoot;
        const major = (try self.number(tag, scope, "major")) orelse return error.MissingVersionMajor;
        const minor = (try self.number(tag, scope, "minor")) orelse return error.MissingVersionMinor;
        const micro = try self.number(tag, scope, "micro");
        const build_number = try self.number(tag, scope, "buildNumber");
        const patch = try self.number(tag, scope, "patch");
        const revision = try self.number(tag, scope, "revision");
        const os = try self.number(tag, scope, "os");
        const xml_version = try attrs.attribute(self.allocator, tag, scope, "xmlVersion", self.max_attribute_bytes);
        errdefer if (xml_version) |value| self.allocator.free(value);
        const target_application = try attrs.attribute(self.allocator, tag, scope, "tagetApplication", self.max_attribute_bytes);
        errdefer if (target_application) |value| self.allocator.free(value);
        const application = try attrs.attribute(self.allocator, tag, scope, "application", self.max_attribute_bytes);
        errdefer if (application) |value| self.allocator.free(value);
        const app_version = try attrs.attribute(self.allocator, tag, scope, "appVersion", self.max_attribute_bytes);
        errdefer if (app_version) |value| self.allocator.free(value);
        self.version = .{
            .major = major,
            .minor = minor,
            .micro = micro,
            .build_number = build_number,
            .patch = patch,
            .revision = revision,
            .os = os,
            .xml_version = xml_version,
            .target_application = target_application,
            .application = application,
            .app_version = app_version,
            .xml_bytes = 0,
        };
    }
};

pub fn read(a: std.mem.Allocator, archive: zip.Archive, max_xml_bytes: usize, max_attribute_bytes: usize) !Version {
    const entry = archive.find("version.xml") orelse return error.MissingVersionXml;
    const bytes = try archive.decode(entry, max_xml_bytes);
    defer a.free(bytes);
    var context: Context = .{ .allocator = a, .max_attribute_bytes = max_attribute_bytes };
    errdefer if (context.version) |*version| version.deinit(a);
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = max_xml_bytes, .max_characters = max_xml_bytes } },
        .max_elements = 4096,
        .max_events = 8192,
        .max_depth = 64,
    }, .{ .context = &context, .on_tag = Context.onTag });
    var version = context.version orelse return error.MissingVersionRoot;
    version.xml_bytes = bytes.len;
    return version;
}
