const fs = require("fs");
const path = require("path");
const { exec } = require("@actions/exec");

process.chdir(path.join(__dirname, ".."));

(async () => {
  await exec("changeset", ["version"]);

  const tag = `v${require("../package.json").version}`;

  const readmePath = path.join(__dirname, "..", "README.md");
  const content = fs.readFileSync(readmePath, "utf8");
  const updatedContent = content.replace(
    /changesets\/action@[^\s]+/g,
    `changesets/action@${tag}`
  );
  fs.writeFileSync(readmePath, updatedContent);
})();
