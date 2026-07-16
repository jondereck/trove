import { Platform } from 'react-native'

/**
 * On-device OCR via ML Kit. Returns extracted text or '' when unavailable
 * (web, missing native module, empty image, or recognition failure).
 */
export async function extractTextFromImage(imageUri: string): Promise<string> {
  if (Platform.OS === 'web' || !imageUri) return ''

  try {
    const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition')
    const result = await recognizeText(imageUri)
    const text = typeof result?.text === 'string' ? result.text.trim() : ''
    return text.slice(0, 4000)
  } catch (e) {
    console.warn('extractTextFromImage:', e)
    return ''
  }
}
