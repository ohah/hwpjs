/** Signature-detected format, rather than a misleading source extension, names the saved file. */
export function documentDownloadName(name: string, format: "hwp5" | "hwpx") {
  const suffix = format === "hwp5" ? ".hwp" : ".hwpx";
  if (name.toLowerCase().endsWith(suffix)) return name;
  return (name.replace(/\.(?:hwp|hwpx)$/i, "") || "document") + suffix;
}
