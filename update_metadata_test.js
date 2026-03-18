import fs from "fs";

const file = "src/server/routes/metadata.security.test.ts";
let content = fs.readFileSync(file, "utf-8");

content = content.replace(
    `const { isSafeUrl } = await import('../utils/networkUtils.js');`,
    `const { isSafeUrl } = await import('../../utils/networkUtils.js');`
);
content = content.replace(
    `jest.unstable_mockModule('../utils/networkUtils.js'`,
    `jest.unstable_mockModule('../../utils/networkUtils.js'`
);

fs.writeFileSync(file, content);
console.log("Updated metadata.security.test.ts");
