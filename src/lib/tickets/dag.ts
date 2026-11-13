import { err, ok, type Result } from "@/lib/result";
import type { Ticket } from "@/lib/tickets/schema";

/** The part of a ticket the graph functions read. Ids are assumed unique (`TicketListSchema`). */
export type DagNode = Pick<Ticket, "id" | "dependsOn">;

export type DagError =
  | { kind: "unknownDependency"; ticket: string; dependency: string }
  | { kind: "selfDependency"; ticket: string }
  /** Starts and ends at the same ticket; each step is "depends on". */
  | { kind: "cycle"; path: string[] };

type Graph = Map<string, string[]>;

const byId = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

export function formatDagError(error: DagError): string {
  switch (error.kind) {
    case "unknownDependency":
      return `${error.ticket} depends on unknown ticket ${error.dependency}`;
    case "selfDependency":
      return `${error.ticket} depends on itself`;
    case "cycle":
      return `dependency cycle: ${error.path.join(" → ")}`;
  }
}

function referenceErrors(nodes: readonly DagNode[], known: ReadonlySet<string>): DagError[] {
  return nodes.flatMap((node) =>
    node.dependsOn.flatMap((dependency): DagError[] => {
      if (dependency === node.id) return [{ kind: "selfDependency", ticket: node.id }];
      if (!known.has(dependency))
        return [{ kind: "unknownDependency", ticket: node.id, dependency }];
      return [];
    }),
  );
}

/** Edges from each ticket to its known dependencies, self-references dropped. */
function buildGraph(nodes: readonly DagNode[], known: ReadonlySet<string>): Graph {
  return new Map(
    nodes.map((node) => [
      node.id,
      node.dependsOn.filter((dependency) => dependency !== node.id && known.has(dependency)),
    ]),
  );
}

/**
 * Strongly connected components with more than one ticket (Tarjan's algorithm). Iterative, so a
 * long dependency chain can't overflow the call stack.
 */
function cyclicComponents(order: readonly string[], graph: Graph): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const enter = (id: string): { id: string; next: number } => {
    index.set(id, index.size);
    low.set(id, index.size - 1);
    stack.push(id);
    onStack.add(id);
    return { id, next: 0 };
  };
  const lower = (id: string, value: number): void => {
    low.set(id, Math.min(low.get(id) ?? value, value));
  };
  const closeComponent = (root: string): void => {
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== root);
    if (component.length > 1) components.push(component);
  };

  for (const root of order) {
    if (index.has(root)) continue;
    const work = [enter(root)];
    for (let frame = work.at(-1); frame; frame = work.at(-1)) {
      const dependency = graph.get(frame.id)?.[frame.next];
      if (dependency !== undefined) {
        frame.next += 1;
        if (!index.has(dependency)) work.push(enter(dependency));
        else if (onStack.has(dependency)) lower(frame.id, index.get(dependency) ?? 0);
        continue;
      }
      work.pop();
      const frameLow = low.get(frame.id) ?? 0;
      const parent = work.at(-1);
      if (parent) lower(parent.id, frameLow);
      if (frameLow === index.get(frame.id)) closeComponent(frame.id);
    }
  }
  return components;
}

/** The shortest cycle through the component's lowest id, found by BFS inside the component. */
function cyclePath(component: readonly string[], graph: Graph): string[] {
  const members = new Set(component);
  const start = [...component].sort(byId)[0] ?? "";
  const previous = new Map<string, string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] ?? "";
    for (const dependency of graph.get(current) ?? []) {
      if (!members.has(dependency)) continue;
      if (dependency === start) return [...walkBack(previous, current, start), start];
      if (previous.has(dependency)) continue;
      previous.set(dependency, current);
      queue.push(dependency);
    }
  }
  return [start]; // Unreachable: every member of a cyclic component lies on a cycle.
}

function walkBack(previous: ReadonlyMap<string, string>, end: string, start: string): string[] {
  const path = [end];
  for (let id = end; id !== start;) {
    id = previous.get(id) ?? start;
    path.unshift(id);
  }
  return path;
}

/**
 * Checks the tickets' dependencies form a DAG. Reports every unknown reference and
 * self-reference, in ticket order, then one cycle path per group of mutually dependent tickets,
 * ordered by each cycle's first ticket.
 */
export function validateDag(nodes: readonly DagNode[]): Result<void, DagError[]> {
  const known = new Set(nodes.map((node) => node.id));
  const graph = buildGraph(nodes, known);
  const cycles = cyclicComponents([...known], graph)
    .map((component) => cyclePath(component, graph))
    .sort((a, b) => byId(a[0] ?? "", b[0] ?? ""))
    .map((path): DagError => ({ kind: "cycle", path }));
  const errors = [...referenceErrors(nodes, known), ...cycles];
  return errors.length === 0 ? ok(undefined) : err(errors);
}

/** Inserts into an array kept in descending order, so the smallest value pops off the end. */
function insertDescending(values: number[], value: number): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? 0) > value) low = middle + 1;
    else high = middle;
  }
  values.splice(low, 0, value);
}

/**
 * Orders tickets so every ticket comes after its dependencies. Among tickets that are ready at
 * the same time, the one earliest in the input goes first, so the result is deterministic and an
 * already-ordered list comes back unchanged. Fails with `validateDag`'s errors on an invalid graph.
 */
export function topoSort<T extends DagNode>(nodes: readonly T[]): Result<T[], DagError[]> {
  const valid = validateDag(nodes);
  if (!valid.ok) return valid;

  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const dependents = nodes.map((): number[] => []);
  const waitingOn = nodes.map((node) => new Set(node.dependsOn).size);
  nodes.forEach((node, index) => {
    for (const dependency of new Set(node.dependsOn))
      dependents[position.get(dependency) ?? 0]?.push(index);
  });

  const ready = waitingOn.flatMap((count, index) => (count === 0 ? [index] : [])).reverse();
  const sorted: T[] = [];
  for (let next = ready.pop(); next !== undefined; next = ready.pop()) {
    const node = nodes[next];
    if (node) sorted.push(node);
    for (const dependent of dependents[next] ?? []) {
      const remaining = (waitingOn[dependent] ?? 0) - 1;
      waitingOn[dependent] = remaining;
      if (remaining === 0) insertDescending(ready, dependent);
    }
  }
  return ok(sorted);
}
