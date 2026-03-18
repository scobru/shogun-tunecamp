import fs from "fs";

const file = "src/server/routes/metadata.security.test.ts";
let content = fs.readFileSync(file, "utf-8");

content = content.replace(
    `(isSafeUrl as jest.Mock).mockResolvedValue(false);`,
    `(isSafeUrl as jest.Mock<any>).mockResolvedValue(false);`
);
content = content.replace(
    `(isSafeUrl as jest.Mock).mockResolvedValue(true);`,
    `(isSafeUrl as jest.Mock<any>).mockResolvedValue(true);`
);

fs.writeFileSync(file, content);
