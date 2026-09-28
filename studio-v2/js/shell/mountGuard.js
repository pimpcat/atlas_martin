/**
 * Evita que montajes async obsoletos escriban DOM tras cambiar de vista en el shell v2.
 */
let _mountSeq = 0;

/** @returns {number} */
export function nextMountToken() {
  return ++_mountSeq;
}

/** @param {number} token */
export function isMountStale(token) {
  return token !== _mountSeq;
}

export class StaleMountError extends Error {
  constructor() {
    super("Montaje de vista superseded");
    this.name = "StaleMountError";
  }
}

/** @param {number} [token] */
export function staleCheck(token) {
  if (token == null) return;
  if (isMountStale(token)) throw new StaleMountError();
}
