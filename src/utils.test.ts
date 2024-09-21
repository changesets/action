import path from "path";
import { getChangelogEntry, sortTheThings } from "./utils.js";
import fs from "fs";
import { getLevel, ReleaseLevelKey } from "./releaseLevels.js";

const filePath = path.join(__dirname, "testlog.md");
let changelog = fs.readFileSync(filePath, "utf-8");

test("it works for version 3.0.0", () => {
  let entry = getChangelogEntry(changelog, "3.0.0");
  expect(entry.highestLevel).toBe(getLevel({ key: "major" }).index);
  expect(entry.content).toContain("Replace jade with pug");
});

test("it works for version 3.0.1", () => {
  let entry = getChangelogEntry(changelog, "3.0.1");
  expect(entry.highestLevel).toBe(getLevel({ key: "patch" }).index);
  expect(entry.content).toContain("Move frontmatter in docs into comments");
});

test("it works for version 2.0.0", () => {
  let entry = getChangelogEntry(changelog, "2.0.0");
  expect(entry.highestLevel).toBe(getLevel({ key: "major" }).index);
  expect(entry.content).toContain("Export { emailSender } as the API");
});

test("it works for version 1.0.2", () => {
  let entry = getChangelogEntry(changelog, "1.0.2");
  expect(entry.highestLevel).toBe(getLevel({ key: "patch" }).index);
  expect(entry.content).toContain("Update patch-level dependencies");
});

test("it works for version 1.0.0", () => {
  let entry = getChangelogEntry(changelog, "1.0.0");
  expect(entry.highestLevel).toBe(getLevel({ key: "major" }).index);
  expect(entry.content).toContain(
    "This is the first release of keystone-alpha"
  );
});

test("it sorts the things right", () => {
  let things = [
    {
      name: "a",
      highestLevel: getLevel({ key: "major" }).index,
      private: true,
    },
    {
      name: "b",
      highestLevel: getLevel({ key: "minor" }).index,
      private: false,
    },
    {
      name: "c",
      highestLevel: getLevel({ key: "major" }).index,
      private: false,
    },
    {
      name: "d",
      highestLevel: getLevel({ key: "patch" }).index,
      private: true,
    },
    {
      name: "e",
      highestLevel: getLevel({ key: "patch" }).index,
      private: false,
    },
    {
      name: "f",
      highestLevel: getLevel({ key: "minor" }).index,
      private: true,
    },
  ];
  const sorted = things.sort(sortTheThings);
  expect(sorted.map((t) => t.name)).toEqual(["c", "b", "e", "a", "f", "d"]);
});
