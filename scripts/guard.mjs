// Safety check: refuses to continue unless we're inside the ois-education repository.
// Run before dev/deploy commands so nothing ever runs against another project by mistake.
import { execSync } from "node:child_process";
import path from "node:path";

const EXPECTED_REMOTE = /github\.com[/:]mrvermacodes10\/ois-education(\.git)?$/i;
const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let root, remote;
try {
  root = run("git rev-parse --show-toplevel");
  remote = run("git remote get-url origin");
} catch {
  console.error("✗ Not inside a Git repository with an 'origin' remote. Stopping.");
  process.exit(1);
}
if (!EXPECTED_REMOTE.test(remote)) {
  console.error(`✗ This is not the OIS Education repo.\n  Folder: ${root}\n  Remote: ${remote}\nStopping so no other project is touched.`);
  process.exit(1);
}
console.log(`✓ OIS Education repo confirmed (${path.basename(root)} → ${remote})`);
