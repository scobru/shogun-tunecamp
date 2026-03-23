function SeaArray() {}
Object.assign(SeaArray, { from: Array.from });
try {
  console.log(SeaArray.from([1, 2, 3]));
} catch (e) {
  console.error("Error with SeaArray.from:", e.message);
}

try {
  let subtle = require('crypto').webcrypto.subtle;
  // wait we need DOM to test Illegal invocation but let's test Array.from
} catch (e) {}
