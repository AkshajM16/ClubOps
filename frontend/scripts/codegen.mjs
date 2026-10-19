// Only two local inputs are needed; use Codegen's core API without file discovery.
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "graphql";
import { codegen } from "@graphql-codegen/core";
import * as operations from "@graphql-codegen/typescript-operations";
import * as documents from "@graphql-codegen/typed-document-node";

const output = await codegen({
  filename: "src/graphql/generated.ts",
  schema: parse(await readFile("../backend/schema.graphql", "utf8")),
  documents: [
    {
      location: "src/graphql/operations.graphql",
      document: parse(await readFile("src/graphql/operations.graphql", "utf8")),
    },
  ],
  config: {
    scalars: { Decimal: "string", DateTime: "string" },
    enumsAsTypes: true,
  },
  plugins: [{ operations: {} }, { documents: {} }],
  pluginMap: { operations, documents },
});
await writeFile("src/graphql/generated.ts", output);
console.log("Generated src/graphql/generated.ts from the backend schema.");
