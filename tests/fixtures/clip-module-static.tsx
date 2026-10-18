import { createRoot } from 'react-dom/client'
import { StaticPrototypeSurface, type ClipStaticFixtureState } from '../../src/renderer/src/pages/StaticPrototypeSurface.js'

const query = new URLSearchParams(location.search)
const screen = query.get('screen') === 'clip-report' ? 'clip-report' : 'clip-pool'
const state = (query.get('state') ?? 'default') as ClipStaticFixtureState
createRoot(document.getElementById('root')!).render(<StaticPrototypeSurface screen={screen} mode="static-fixture" fixtureState={state} onBack={() => undefined} />)
