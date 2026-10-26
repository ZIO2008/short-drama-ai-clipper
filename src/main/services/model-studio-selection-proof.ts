const proofMarker = Symbol('model-studio-selection-proof')

export type ModelStudioSelectionProof = {
  readonly selectedModel: string
  readonly [proofMarker]: true
}

export const createModelStudioSelectionProof = (selectedModel: string): ModelStudioSelectionProof => ({
  selectedModel,
  [proofMarker]: true,
})

export const isModelStudioSelectionProof = (value: unknown): value is ModelStudioSelectionProof => (
  typeof value === 'object' && value !== null && (value as Record<PropertyKey, unknown>)[proofMarker] === true
)
