const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '..', '..', 'client', 'public', 'logo.png');
const logoCid = 'adnatepaynest-logo';

const hasLogo = () => fs.existsSync(logoPath);

const drawLogo = (doc, x, y, options = {}) => {
  if (!hasLogo()) return false;

  doc.image(logoPath, x, y, options);
  return true;
};

module.exports = {
  drawLogo,
  hasLogo,
  logoCid,
  logoPath,
};
