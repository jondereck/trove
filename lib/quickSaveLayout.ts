export function quickSaveBottomPadding(
  platform: string,
  keyboardHeight: number,
  safeAreaBottom: number,
): number {
  return platform === 'android' && keyboardHeight > 0
    ? keyboardHeight
    : safeAreaBottom
}
