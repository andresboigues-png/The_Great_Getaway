const fs = require('fs');
const acorn = require('acorn');
try {
  const code = fs.readFileSync('frontend/static/js/app.js', 'utf8');
  acorn.parse(code, {ecmaVersion: 2020});
  console.log("Syntax OK");
} catch(e) {
  console.error("Syntax Error:", e);
}
