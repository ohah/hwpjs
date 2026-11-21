import {
  copyPictureInput,
  PICTURE_REPLACEMENT_LIMITS,
} from '../../../js/picture-replacement-input.mjs';

// The port must obtain live-session authority from Core. This lane never issues it.
// Capture before opening the chooser; a later selection cannot lend its authority.
export function createPictureReplacementInputLane(port) {
  let generation = 0;
  let active = null;
  let disposed = false;
  let submitting = false;
  function invalidate() {
    generation++;
  }
  return {
    invalidate,
    capture() {
      if (disposed || active || submitting) return null;
      const epoch = generation;
      const owner = port.capture();
      if (!owner || disposed || epoch !== generation) return null;
      const ticket = Object.freeze({});
      active = { ticket, owner, epoch, submitted: false };
      return ticket;
    },
    cancel(ticket) {
      if (active?.ticket === ticket) active = null;
    },
    async read(ticket, file) {
      const current = active;
      if (!current || current.ticket !== ticket || current.submitted)
        return { status: 'rejected-unapplied', error: 'PictureReplacementInputUnavailable' };
      current.submitted = true;
      let sent = false;
      const isCurrent = () => {
        if (disposed || active !== current || generation !== current.epoch) return false;
        const valid = port.isCurrent(current.owner);
        return valid === true && !disposed && active === current && generation === current.epoch;
      };
      try {
        if (!isCurrent())
          return { status: 'rejected-unapplied', error: 'StalePictureReplacementSelection' };
        if (
          !file ||
          !Number.isSafeInteger(file.size) ||
          file.size <= 0 ||
          file.size > PICTURE_REPLACEMENT_LIMITS.imageBytes
        )
          return { status: 'rejected-unapplied', error: 'InvalidPictureReplacementFileSize' };
        const buffer = await file.arrayBuffer();
        const bytes = copyPictureInput(buffer, PICTURE_REPLACEMENT_LIMITS.imageBytes, 'Image');
        // Native owns complete PNG/JPEG validation, resource COW and geometry preservation.
        // The Core port repeats ownership validation at queued execution time.
        const submit = port.submit.bind(port);
        if (!isCurrent())
          return { status: 'rejected-unapplied', error: 'StalePictureReplacementSelection' };
        submitting = true;
        sent = true;
        return await submit(current.owner, bytes);
      } finally {
        if (sent) submitting = false;
        if (active === current) active = null;
      }
    },
    dispose() {
      disposed = true;
      invalidate();
      active = null;
    },
  };
}
