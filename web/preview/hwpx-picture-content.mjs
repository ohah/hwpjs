/** Native-derived picture locations only; image decoding and layout stay separate. */
export function attachHwpxPictures(editor, content) {
  content.pictures = [];
  content.pictureErrors = [];
  const sections = [...new Set(content.paragraphs.map((paragraph) => paragraph.section))];
  const displayed = content.window
    ? new Set(content.paragraphs.map((paragraph) => `${paragraph.section}:${paragraph.paragraph}`))
    : null;
  for (const section of sections) {
    let sites;
    try {
      sites = editor.pictureSites(section);
    } catch (error) {
      content.pictureErrors.push({ section, error: error.message });
      continue;
    }
    let owners = null,
      ownerBatchError = null;
    if (
      typeof editor.pictureOwners === "function" &&
      sites.some((site) => site.state === "located" || site.state === "unsupported_anchor")
    ) {
      try {
        owners = new Map(editor.pictureOwners(section).map((row) => [row.pictureNode, row]));
      } catch (error) {
        if (error.message !== "HwpxPictureOwnersAbiUnavailable") ownerBatchError = error.message;
      }
    }
    for (const site of sites) {
      const picture = {
        ...site,
        section,
        paragraph: site.paragraph === null ? null : site.paragraph - 1,
        owner: null,
        ownerError: null,
        geometry: null,
        geometryError: null,
        sizeProtected: null,
        sizeProtectionError: null,
        position: null,
        positionError: null,
        flow: null,
        flowError: null,
        crop: null,
        cropError: null,
        transform: null,
        transformError: null,
        renderingCorners: null,
        renderingCornersError: null,
      };
      if (site.state === "located" || site.state === "unsupported_anchor") {
        try {
          if (ownerBatchError) throw new Error(ownerBatchError);
          let owner;
          if (owners) {
            const row = owners.get(site.pictureNode);
            if (!row) throw new Error("MissingPictureOwnerBatchRow");
            if (row.error !== null) throw new Error(row.error);
            owner = row.owner;
          } else {
            if (typeof editor.pictureOwner !== "function")
              throw new Error("HwpxPictureOwnerAbiUnavailable");
            owner = editor.pictureOwner(section, site.pictureNode);
          }
          picture.owner = { ...owner, paragraph: owner.paragraph - 1 };
        } catch (error) {
          picture.ownerError = error.message;
        }
      }
      const host = picture.owner?.paragraph ?? picture.paragraph;
      if (displayed && host !== null && !displayed.has(`${section}:${host}`)) continue;
      if (site.state === "located" || picture.owner !== null) {
        try {
          if (typeof editor.pictureFlow !== "function")
            throw new Error("HwpxPictureFlowAbiUnavailable");
          picture.flow = editor.pictureFlow(section, site.pictureNode);
        } catch (error) {
          picture.flowError = error.message;
        }
        try {
          if (typeof editor.picturePosition !== "function")
            throw new Error("HwpxPicturePositionAbiUnavailable");
          picture.position = editor.picturePosition(section, site.pictureNode);
        } catch (error) {
          picture.positionError = error.message;
        }
        try {
          picture.geometry = editor.pictureGeometry(section, site.pictureNode);
        } catch (error) {
          picture.geometryError = error.message;
        }
        try {
          if (typeof editor.pictureSizeProtection !== "function")
            throw new Error("HwpxPictureSizeProtectionAbiUnavailable");
          picture.sizeProtected = editor.pictureSizeProtection(section, site.pictureNode);
        } catch (error) {
          picture.sizeProtectionError = error.message;
        }
        try {
          picture.crop = editor.pictureCrop(section, site.pictureNode);
        } catch (error) {
          picture.cropError = error.message;
        }
        try {
          picture.transform = editor.pictureTransform(section, site.pictureNode);
        } catch (error) {
          picture.transformError = error.message;
        }
        try {
          if (typeof editor.pictureRenderingCorners !== "function")
            throw new Error("HwpxPictureCornersAbiUnavailable");
          picture.renderingCorners = editor.pictureRenderingCorners(section, site.pictureNode);
        } catch (error) {
          picture.renderingCornersError = error.message;
        }
      }
      picture.groupResizeAvailable = false;
      picture.groupResizeError = null;
      if (picture.owner && picture.owner.anchorNode !== site.pictureNode) {
        try {
          if (typeof editor.groupedPictureResizeAvailable !== "function")
            throw new Error("HwpxGroupedPictureResizeAbiUnavailable");
          picture.groupResizeAvailable =
            editor.groupedPictureResizeAvailable(section, site.pictureNode) === true;
        } catch (error) {
          picture.groupResizeError = error.message;
        }
      }
      content.pictures.push(picture);
    }
  }
  return content;
}
