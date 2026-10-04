export const passwordMessage = 'Mindestens 6 Zeichen, ein Großbuchstabe, ein Kleinbuchstabe, eine Zahl und ein Sonderzeichen (maximal 128 Zeichen).';
export function validPassword(value) {
  return typeof value === 'string' && value.length >= 6 && value.length <= 128
    && /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value) && /\p{Nd}/u.test(value)
    && /[^\p{L}\p{N}\s]/u.test(value);
}
