/**
 * dsh-peak — DeepSeek API peak/off-peak pricing indicator.
 *
 * A dual-face bundle plugin (`dsh.bundle.patch` → `cordis.patch.yml`,
 * `dsh.client.platform` → `web`): the host half registers a model-visible
 * `dsh_peak_status` tool; the client half mounts a composer pill that turns
 * red during peak pricing and green off-peak, with a live countdown to the
 * next switch. Zero runtime dependencies on both halves.
 */

/** Stable Cordis plugin name. */
export const name: string

/** Hard dependency: the tool registry. */
export const inject: readonly string[]

/** Apply the plugin: register the `dsh_peak_status` tool. */
export function apply(ctx: unknown): void
