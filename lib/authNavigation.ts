let authFlowRequested = false
let cloudVerifyPending = false

export function requestAuthFlow(): void {
  authFlowRequested = true
  // Returning-user sign-in: verify Cloud entitlement after the session lands.
  cloudVerifyPending = true
}

export function clearAuthFlow(): void {
  authFlowRequested = false
}

export function isAuthFlowRequested(): boolean {
  return authFlowRequested
}

/** True once per auth attempt; clears the pending flag. */
export function consumeCloudVerifyPending(): boolean {
  const pending = cloudVerifyPending
  cloudVerifyPending = false
  return pending
}

export function clearCloudVerifyPending(): void {
  cloudVerifyPending = false
}
