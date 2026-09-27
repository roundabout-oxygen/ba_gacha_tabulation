const fs = require('fs');
const path = require('path');

const dir = __dirname;
const indexHtmlPath = path.join(dir, 'index.html');
const styleCssPath = path.join(dir, 'style.css');
const appJsPath = path.join(dir, 'app.js');
const outputPath = path.join(dir, 'Index.html'); // Capitalized for GAS standard

try {
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  let appJs = fs.readFileSync(appJsPath, 'utf8');

  // Strip local stylesheet link
  indexHtml = indexHtml.replace('<link rel="stylesheet" href="style.css">', '');
  
  // Strip local app.js link
  indexHtml = indexHtml.replace('<script src="app.js"></script>', '');

  // Inject CSS inside head
  indexHtml = indexHtml.replace('</head>', `<style>\n${styleCss}\n</style>\n</head>`);

  // Inject JS inside body
  indexHtml = indexHtml.replace('</body>', `<script>\n${appJs}\n</script>\n</body>`);

  fs.writeFileSync(outputPath, indexHtml, 'utf8');
  console.log('Successfully compiled combined GAS Index.html!');
} catch (err) {
  console.error('Error compiling:', err);
}
