import { AppTab } from '../types';

/**
 * Actions the tour can fire to produce live telemetry mid-narration.
 *
 * A tour that only describes the UI is a worse version of the documentation. These fire the
 * same preset handlers the demo chips use, so the narration lands on a real response with
 * real numbers instead of on a description of one.
 */
export type TourActionId = 'auto-simple' | 'auto-coding' | 'cache-seed' | 'cache-hit';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /**
   * `data-tour-id` of the element to tether the step to.
   * Omit for a step that should float centrally (intro/outro).
   */
  target?: string;
  /** Tab that must be active for `target` to exist. The tour switches to it on entry. */
  tab?: AppTab;
  /** Step is only reachable as the admin persona; skipped otherwise with a note. */
  adminOnly?: boolean;
  /** Fires a real gateway call when the step is entered. */
  action?: TourActionId;
  /** Secondary line, rendered muted - the "why this matters" rather than the "what". */
  note?: string;
}

/**
 * The guided demo.
 *
 * Ordered as a narrative rather than as a UI inventory: govern (routing), then save
 * (cache), then prove (flow + telemetry), then the surrounding admin surfaces. Each
 * scenario runs for real, so the numbers quoted in the copy are deliberately vague
 * ("cheapest tier", "a fraction") - hard-coded figures would be wrong the first time a
 * model price or a network condition changed.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Apigee AI Gateway, in about three minutes',
    body:
      'This demo sends real traffic through a live Apigee proxy to real models on Vertex AI. ' +
      'Nothing here is mocked. I will run a few calls and point out what the gateway did to each one.',
    note: 'You can leave at any point with Esc, and restart from the Guide me button.',
  },
  {
    id: 'presets',
    title: 'The scenario shortcuts',
    body:
      'Each chip loads a prompt chosen to trigger one specific gateway behaviour. ' +
      'You can also just type your own prompt.',
    target: 'scenario-presets',
    tab: 'ai-gateway',
  },
  {
    id: 'auto-simple',
    title: 'One endpoint, many models',
    body:
      'I have sent a trivial question to /auto. The client never names a model. ' +
      'Watch the Model Routing card on the right: an LLM router classified this as a simple ' +
      'lookup and picked the cheapest tier.',
    target: 'telemetry-model-routing',
    tab: 'ai-gateway',
    action: 'auto-simple',
    note: 'The category-to-model map lives on the API Product as custom attributes, not in code.',
  },
  {
    id: 'auto-coding',
    title: 'Same endpoint, different model',
    body:
      'Now a coding prompt, to the exact same URL. The router moved it to Claude Opus, on ' +
      'Vertex, through the same gateway. Look at the purple MODEL hint on the reply - it flags ' +
      'what changed since the previous call.',
    target: 'telemetry-comparison',
    tab: 'ai-gateway',
    action: 'auto-coding',
    note: 'Switching vendor costs the client nothing: no SDK change, no new credential.',
  },
  {
    id: 'cache-seed',
    title: 'Now the expensive one',
    body:
      'A long analytical prompt with caching switched on. Watch the Semantic Cache card: ' +
      'on a cold cache this runs against a real model and seeds the vector store, and the ' +
      'latency and cost here are what that genuinely costs you.',
    target: 'telemetry-latency',
    tab: 'ai-gateway',
    action: 'cache-seed',
  },
  {
    id: 'cache-hit',
    title: 'The same question, reworded',
    body:
      'Different words, same meaning - and the Semantic Cache card reads Vector Cache Hit, ' +
      '$0 token cost. It matched on embedding similarity, not on an exact string. The ' +
      '"Changed from previous call" band quantifies the difference.',
    target: 'telemetry-comparison',
    tab: 'ai-gateway',
    action: 'cache-hit',
    /*
      Deliberately not promising "cache MISS -> HIT" in the body. The vector index is
      shared and its TTL outlives a rehearsal, so the previous step is often a hit too,
      and the band then shows a modest latency delta instead. Copy that describes a
      transition the viewer cannot see is worse than copy that describes the card.
    */
    note:
      'No model is credited on a hit: the cache keys on the prompt alone and the router ' +
      'never runs. If the previous call was already a hit, the delta here will be small.',
  },
  {
    id: 'history',
    title: 'Every call is still inspectable',
    body:
      'Click any earlier reply to load its telemetry back into the panel. The comparison band ' +
      'follows, so you can step back through a session and show what each call did differently.',
    target: 'chat-messages',
    tab: 'ai-gateway',
  },
  {
    id: 'request-flow',
    title: 'Prove it, policy by policy',
    body:
      'Request Flow on any reply opens the exact sequence of Apigee policies that call went ' +
      'through - auth, Model Armor, routing, cache, quota, cost accounting.',
    target: 'chat-messages',
    tab: 'ai-gateway',
    note: 'This is usually the moment an architect in the room starts asking good questions.',
  },
  {
    id: 'settings',
    title: 'Change the conditions',
    body:
      'Switch environment, persona, API key tier or caching here, then re-run a scenario to ' +
      'show the gateway reacting.',
    target: 'gateway-settings',
  },
  {
    id: 'mcp',
    title: 'The same governance for tools',
    body:
      'The MCP tab runs tool calls - not prompts - through the same gateway, with the same ' +
      'identity and quota enforcement.',
    target: 'tab-mcp-gateway',
    tab: 'mcp-gateway',
    note: 'The MCP backend is currently deployed to prod only.',
  },
  {
    id: 'analytics',
    title: 'What it all cost',
    body:
      'Traffic, tokens and spend per model and per developer, from Apigee analytics.',
    target: 'tab-analytics',
    tab: 'analytics',
    adminOnly: true,
  },
  {
    id: 'monetization',
    title: 'Charging for it',
    body:
      'Rate plans, prepaid balances and per-developer billing - the commercial layer on top of ' +
      'the same traffic.',
    target: 'tab-monetization',
    tab: 'monetization',
    adminOnly: true,
  },
  {
    id: 'done',
    title: 'That is the tour',
    body:
      'Re-run any scenario from the chips, or type your own prompt and watch how the gateway ' +
      'classifies it. Guide me restarts this at any time.',
    // Back to the playground: the previous two steps are admin screens, and ending on one
    // of those leaves whoever took the tour looking at a billing table.
    tab: 'ai-gateway',
  },
];
