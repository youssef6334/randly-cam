// add-about-link.js
// Run once with: node add-about-link.js
// Automatically inserts the "aboutLink" translation line right after "contactLink"
// in every one of the 12 languages inside script.js.

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'script.js');

if (!fs.existsSync(filePath)) {
  console.error('! script.js not found in this folder. Put this script next to script.js and run again.');
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Each entry: the exact existing contactLink line (unique per language) -> the aboutLink text to insert after it
const replacements = [
  { contact: `contactLink: "تواصل معنا",`, about: `عن الموقع` },
  { contact: `contactLink: "Contact Us",`, about: `About Us` },
  { contact: `contactLink: "Contacto",`, about: `Sobre Nosotros` },
  { contact: `contactLink: "Contact",`, about: `À Propos` },
  { contact: `contactLink: "Kontakt",`, about: `Über Uns` },
  { contact: `contactLink: "Contatti",`, about: `Chi Siamo` },
  { contact: `contactLink: "Contato",`, about: `Sobre Nós` },
  { contact: `contactLink: "Bize Ulaşın",`, about: `Hakkımızda` },
  { contact: `contactLink: "Связаться с нами",`, about: `О нас` },
  { contact: `contactLink: "हमसे संपर्क करें",`, about: `हमारे बारे में` },
  { contact: `contactLink: "Hubungi Kami",`, about: `Tentang Kami` },
  { contact: `contactLink: "联系我们",`, about: `关于我们` },
];

let updatedCount = 0;
let skippedCount = 0;

replacements.forEach(({ contact, about }) => {
  const alreadyHasAbout = content.includes(`aboutLink: "${about}"`);
  if (alreadyHasAbout) {
    skippedCount++;
    return;
  }
  if (content.includes(contact)) {
    content = content.replace(contact, `${contact}\n        aboutLink: "${about}",`);
    updatedCount++;
  } else {
    console.log(`  ! could not find line for: ${contact} (skipped — check it manually)`);
  }
});

fs.writeFileSync(filePath, content, 'utf8');

console.log(`Done. Added aboutLink to ${updatedCount} language(s), skipped ${skippedCount} (already had it).`);
console.log('Review script.js, then commit and push.');