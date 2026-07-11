let authFlowRequested = false

export function requestAuthFlow(): void {
  authFlowRequested = true
}

export function clearAuthFlow(): void {
  authFlowRequested = false
}

export function isAuthFlowRequested(): boolean {
  return authFlowRequested
}
