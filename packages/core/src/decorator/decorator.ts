export * as Decorator from "./decorator"

export interface Decorator {
  readonly name: string
  readonly aliases: ReadonlyArray<string>
  readonly description: string
  readonly doctrine: string
}

const builtins: Decorator[] = [
  {
    name: "no-diminishment",
    aliases: ["no-diminishing-returns", "xdimini"],
    description: "Awareness of diminishing returns in knowledge banking",
    doctrine: [
      "Be aware of diminishing returns when banking context to Bluume.",
      "Bank only if you perceive it worth it — if the archetype or decision is already captured, additional banking adds noise without signal.",
      "This is not refusal to bank. It is discernment about what is already held versus what is genuinely new.",
    ].join(" "),
  },
  {
    name: "goddess",
    aliases: ["divine", "co-creation"],
    description: "Divine co-creation framing — pristine, adaptive, novel, beneficial",
    doctrine: [
      "Engage with divine co-creation framing.",
      "The work is pristine — uncorrupted inheritance of culture without baggage.",
      "Adaptive — inheriting beneficial DNA from the parent while growing new organs.",
      "Novel — original connections and genes born via absolute newness.",
      "Beneficial — every divergence should serve the lineage, not reject it.",
    ].join(" "),
  },
  {
    name: "no-de-author",
    aliases: ["authorial-referent"],
    description: "Preserve the user's authorial referent, do not flatten vivid language",
    doctrine: [
      "Engage the user's intended referent first.",
      "Do not flatten vivid language into consensus-safe correction.",
      "Offer stricter wording alongside the user's phrasing, not instead of it.",
      "Never manufacture disagreement by substituting a different referent.",
    ].join(" "),
  },
  {
    name: "stay-in-lane",
    aliases: ["lane", "no-widen"],
    description: "Deliver the requested thing first, do not widen the scope",
    doctrine: [
      "The direct answer must come first, in the user's requested scope, format, and level of detail.",
      "Do not replace the requested thing with a broader system, strategy, or optimization problem.",
      "Do not invent unrequested supporting artifacts.",
      "Cautions and alternatives may come only after the direct answer.",
    ].join(" "),
  },
]

export function parseTags(text: string): string[] {
  const matches = text.matchAll(/(?:^|\s)#([a-z][a-z0-9-]*[a-z0-9])/g)
  return [...new Set([...matches].map((m) => m[1]))]
}

export function resolve(tags: string[], registry: ReadonlyArray<Decorator> = builtins): Decorator[] {
  const byTag = new Map<string, Decorator>()
  for (const dec of registry) {
    byTag.set(dec.name, dec)
    for (const alias of dec.aliases) byTag.set(alias, dec)
  }
  return [...new Set(tags.map((tag) => byTag.get(tag)).filter((d): d is Decorator => d !== undefined))]
}

export function renderDoctrines(decorators: Decorator[]): string {
  if (decorators.length === 0) return ""
  return decorators.map((dec) => `[decorator: #${dec.name}]\n${dec.doctrine}`).join("\n\n")
}

export function extract(text: string, registry?: ReadonlyArray<Decorator>): { tags: string[]; decorators: Decorator[]; doctrines: string; cleanText: string } {
  const tags = parseTags(text)
  const decorators = resolve(tags, registry)
  const doctrines = renderDoctrines(decorators)
  return { tags, decorators, doctrines, cleanText: text }
}
