import isImageUrl from './isImageUrl';

/**
 * Interface for the trust object following the BRC-68 protocol
 */
interface Trust {
  name: string;
  note: string;
  icon: string;
  publicKey: string;
}

/**
 * Validates that a trust object of a domain follows the BRC-68 protocol
 * @param trust - BRC-68 trust object
 * @param obj - Options object
 * @param obj.skipNote - Optional flag to skip note validation (default: false)
 * @returns Promise<boolean> - Resolves to true if validation succeeds
 */
const validateTrust = async (
  trust: Trust,
  { skipNote = false } = {}
): Promise<boolean> => {
  if (trust.name.length < 5 || trust.name.length > 30) {
    const e = new Error(
      'Trust validation failed, name must be 5-30 characters'
    );
    (e as any).field = 'name';
    throw e;
  }
  if (!skipNote) {
    if (trust.note.length < 5 || trust.note.length > 50) {
      const e = new Error(
        'Trust validation failed, note must be 5-50 characters'
      );
      (e as any).field = 'note';
      throw e;
    }
  }
  const iconValid = await isImageUrl(trust.icon);
  if (!iconValid) {
    const e = new Error('Trust validation failed, icon image URL is invalid');
    (e as any).field = 'icon';
    throw e;
  }
  if (/^(02|03)[a-f0-9]{64}$/.test(trust.publicKey) !== true) {
    const e = new Error('Trust validation failed, public key is invalid');
    (e as any).field = 'publicKey';
    throw e;
  }
  return true;
};

export default validateTrust;
