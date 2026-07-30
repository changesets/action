import * as fs from "node:fs/promises";
import path from "node:path";
import { markdownTable } from "markdown-table";
import * as yaml from "yaml";

await main();

async function main() {
  for await (const readmePath of fs.glob("**/README.md", {
    exclude: ["**/node_modules/**"],
  })) {
    const actionPath = path.join(path.dirname(readmePath), "action.yml");
    const actionExists = await fs.stat(actionPath).catch(() => null);
    if (!actionExists) continue;

    const action = yaml.parse(await fs.readFile(actionPath, "utf8"));
    const inputs = action.inputs ?? {};
    const outputs = action.outputs ?? {};

    const content = [
      renderSection("Inputs", inputs),
      renderSection("Outputs", outputs),
    ].join("\n\n");

    const readme = await fs.readFile(readmePath, "utf8");
    const updated = readme.replace(
      /<!-- api-start -->[\s\S]*?<!-- api-end -->/,
      `<!-- api-start -->\n\n${content}\n\n<!-- api-end -->`,
    );
    await fs.writeFile(readmePath, updated);
  }
}

function renderSection(title: string, entries: Record<string, any>) {
  const rows: string[][] = [];
  for (const [name, entry] of Object.entries(entries)) {
    let description = (entry.description ?? "").trim().replace(/\|/g, "\\|");
    if (entry.required) description = `**Required.** ${description}`;
    rows.push([`\`${name}\``, description]);
  }
  if (rows.length === 0) {
    return `${title}: _none_`;
  }
  rows.unshift([title, "Description"]);
  return markdownTable(rows);
}
