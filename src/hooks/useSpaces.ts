import { useContext } from 'react'
import { SpacesContext, type SpacesContextValue } from '../context/SpacesContext'

export function useSpaces(): SpacesContextValue {
  const value = useContext(SpacesContext)
  if (!value) {
    throw new Error('useSpaces must be used inside a SpacesProvider')
  }
  return value
}
