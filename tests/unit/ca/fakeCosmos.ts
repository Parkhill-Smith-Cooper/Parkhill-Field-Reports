import type { CosmosContainerLike } from "@/repositories/ca/cosmosCaRepository";

/**
 * In-memory stand-in for the part of an @azure/cosmos Container the CA
 * repository uses: point reads (404 → no resource), create (409 if it
 * exists), ETag-conditional replace (412 on a stale ETag), delete, and the
 * two query shapes the repository issues. Lets the Cosmos repository's logic
 * be tested without any Azure account.
 */
const err = (code: number) => Object.assign(new Error(`Cosmos ${code}`), { code });

export function fakeContainer(): CosmosContainerLike & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  let etag = 0;
  const key = (id: string, pk: string) => `${pk}\u0000${id}`;
  const stamp = (doc: Record<string, unknown>) => ({ ...structuredClone(doc), _etag: `"${++etag}"` });

  return {
    docs,
    item(id, pk) {
      return {
        async read<T>() {
          const doc = docs.get(key(id, pk));
          return doc ? { resource: structuredClone(doc) as T & { _etag?: string }, statusCode: 200 } : { statusCode: 404 };
        },
        async replace<T>(body: T, options?: { accessCondition?: { type: "IfMatch"; condition: string } }) {
          const current = docs.get(key(id, pk));
          if (!current) throw err(404);
          if (options?.accessCondition && current._etag !== options.accessCondition.condition) throw err(412);
          const next = stamp(body as Record<string, unknown>);
          docs.set(key(id, pk), next);
          return { resource: structuredClone(next) as T & { _etag?: string } };
        },
        async delete() {
          if (!docs.delete(key(id, pk))) throw err(404);
          return {};
        },
      };
    },
    items: {
      async create<T>(body: T) {
        const b = body as Record<string, unknown>;
        const k = key(String(b.id), String(b.projectNumber));
        if (docs.has(k)) throw err(409);
        const doc = stamp(b);
        docs.set(k, doc);
        return { resource: structuredClone(doc) as T & { _etag?: string } };
      },
      query<T>(spec: { query: string; parameters: { name: string; value: string }[] }) {
        const param = (name: string) => spec.parameters.find((p) => p.name === name)?.value;
        return {
          async fetchAll() {
            let list = [...docs.values()];
            const p = param("@p");
            const t = param("@t");
            if (p !== undefined) list = list.filter((d) => d.projectNumber === p);
            if (t !== undefined) list = list.filter((d) => d.type === t);
            if (spec.query.includes("c.type = 'project'")) list = list.filter((d) => d.type === "project");
            if (spec.query.startsWith("SELECT c.id")) list = list.map((d) => ({ id: d.id }));
            return { resources: structuredClone(list) as T[] };
          },
        };
      },
    },
  };
}
