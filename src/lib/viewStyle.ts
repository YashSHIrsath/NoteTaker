export type ViewStyle = 'professional' | 'clipboard'

export function readViewStyle(metadata: Record<string, unknown> | undefined): ViewStyle {
  return metadata?.view_style === 'clipboard' ? 'clipboard' : 'professional'
}
