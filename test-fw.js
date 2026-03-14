import fs from "fs";

async function run() {
    try {
        const response = await fetch("https://stereo.kenobit.it/library/tracks/1144", {
            headers: {
                "Accept": "application/activity+json"
            }
        });
        const data = await response.json();
        fs.writeFileSync("fw-1144.json", JSON.stringify(data, null, 2));
        console.log("Saved to fw-1144.json");
    } catch (e) {
        console.error(e);
    }
}

run();
