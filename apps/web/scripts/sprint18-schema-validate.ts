// SPRINT-18: a LOCAL schema.org validator for the emitted JSON-LD. No network at run time: it
// reads schema.org's own published vocabulary file and checks the graph against it.
//
//   curl -L -o schemaorg-current-https.jsonld https://schema.org/version/latest/schemaorg-current-https.jsonld
//   pnpm --filter @harolds/web exec tsx scripts/sprint18-schema-validate.ts <vocab.jsonld> <graph.jsonld>...
//
// For every node it checks that: @type is a class schema.org defines; every property is one
// schema.org defines; the node's type (or an ancestor) is in that property's domainIncludes; and
// the value fits rangeIncludes — a nested node's type, a reference by @id, a literal of the right
// datatype, or an enumeration member named by label (how Google documents dayOfWeek: "Monday").
import { readFileSync } from "node:fs";

/* eslint-disable @typescript-eslint/no-explicit-any -- walks an untyped JSON-LD vocabulary document */
type VocabNode = Record<string, any>;
const ids = (v: unknown): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => (x as { "@id": string })["@id"]);

function main() {
  const [vocabPath, ...files] = process.argv.slice(2);
  if (!vocabPath || files.length === 0) throw new Error("usage: <vocab.jsonld> <graph.jsonld>...");
  const vocab = JSON.parse(readFileSync(vocabPath, "utf8")) as { "@graph": VocabNode[] };

  const classes = new Map<string, string[]>(); // id -> direct superclasses
  const properties = new Map<string, { domains: string[]; ranges: string[] }>();
  const enumMembers = new Map<string, Set<string>>(); // enumeration class -> member labels
  for (const node of vocab["@graph"]) {
    // @type is a string, or an array of strings ("rdfs:Class", "schema:DayOfWeek", …).
    const types: string[] = (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).filter(
      (t: unknown): t is string => typeof t === "string",
    );
    if (types.includes("rdfs:Class")) classes.set(node["@id"], ids(node["rdfs:subClassOf"]));
    else if (types.includes("rdf:Property")) {
      properties.set(node["@id"], { domains: ids(node["schema:domainIncludes"]), ranges: ids(node["schema:rangeIncludes"]) });
    }
    for (const t of types) {
      if (t.startsWith("schema:") && t !== "rdfs:Class" && t !== "rdf:Property" && node["rdfs:label"]) {
        const label = typeof node["rdfs:label"] === "string" ? node["rdfs:label"] : node["rdfs:label"]?.["@value"];
        if (label) (enumMembers.get(t) ?? enumMembers.set(t, new Set()).get(t)!).add(label);
      }
    }
  }

  const ancestors = (cls: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(cls)) return seen;
    seen.add(cls);
    for (const parent of classes.get(cls) ?? []) ancestors(parent, seen);
    return seen;
  };
  const isSubClassOf = (cls: string, of: string) => ancestors(cls).has(of);

  let failures = 0;
  for (const file of files) {
    const doc = JSON.parse(readFileSync(file, "utf8")) as { "@context": string; "@graph": VocabNode[] };
    const errors: string[] = [];
    if (doc["@context"] !== "https://schema.org") errors.push(`@context is ${doc["@context"]}, expected https://schema.org`);

    const checkValue = (path: string, value: unknown, ranges: string[]) => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => checkValue(`${path}[${i}]`, v, ranges));
        return;
      }
      if (value !== null && typeof value === "object") {
        const node = value as VocabNode;
        const keys = Object.keys(node);
        if (keys.length === 1 && keys[0] === "@id") return; // a reference to another node
        const type = `schema:${node["@type"]}`;
        if (!ranges.some((r) => isSubClassOf(type, r))) {
          errors.push(`${path}: ${node["@type"]} is not in rangeIncludes [${ranges.map((r) => r.slice(7)).join(", ")}]`);
        }
        checkNode(path, node);
        return;
      }
      const literal =
        typeof value === "string"
          ? ["schema:Text", "schema:URL", "schema:Date", "schema:DateTime", "schema:Time"]
          : typeof value === "number"
            ? ["schema:Number", "schema:Integer", "schema:Float"]
            : typeof value === "boolean"
              ? ["schema:Boolean"]
              : [];
      if (ranges.some((r) => literal.includes(r))) return;
      // An enumeration member given by its label, e.g. dayOfWeek: "Monday".
      if (typeof value === "string" && ranges.some((r) => enumMembers.get(r)?.has(value))) return;
      errors.push(`${path}: ${JSON.stringify(value)} does not fit rangeIncludes [${ranges.map((r) => r.slice(7)).join(", ")}]`);
    };

    const checkNode = (path: string, node: VocabNode) => {
      const type = `schema:${node["@type"]}`;
      if (!classes.has(type)) {
        errors.push(`${path}: unknown type ${node["@type"]}`);
        return;
      }
      const owned = ancestors(type);
      for (const [key, value] of Object.entries(node)) {
        if (key === "@type" || key === "@id" || key === "@context") continue;
        const prop = properties.get(`schema:${key}`);
        if (!prop) {
          errors.push(`${path}.${key}: unknown property`);
          continue;
        }
        if (!prop.domains.some((d) => owned.has(d))) {
          errors.push(`${path}.${key}: not a property of ${node["@type"]} (domainIncludes ${prop.domains.map((d) => d.slice(7)).join(", ")})`);
          continue;
        }
        checkValue(`${path}.${key}`, value, prop.ranges);
      }
    };

    doc["@graph"].forEach((node, i) => checkNode(`${node["@type"] ?? `#${i}`}`, node));

    const label = file.split(/[/\\]/).pop();
    if (errors.length === 0) {
      console.log(`PASS  ${label}: ${doc["@graph"].length} nodes (${doc["@graph"].map((n) => n["@type"]).join(", ")}) validate against schema.org`);
    } else {
      failures++;
      console.log(`FAIL  ${label}`);
      for (const e of errors) console.log(`        ${e}`);
    }
  }
  if (failures > 0) process.exit(1);
}

main();
