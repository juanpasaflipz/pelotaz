// Runs before the TypeScript scripts. Dependencies use APIs that older Node
// versions lack and crash while loading, deep inside a library, so the check
// has to happen before anything else is imported.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.error(
    `Pelotaz needs Node 22.19 or newer; this is Node ${process.versions.node}.\n` +
      'Run "nvm install 22 && nvm use" (the repo has an .nvmrc), then "npm install" again.',
  );
  process.exit(1);
}
