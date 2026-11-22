// Après l'empaquetage Windows : applique l'icône et les infos au .exe avec rcedit.
// (Remplace l'étape "winCodeSign" d'electron-builder qui échoue sans droits
//  administrateur à cause de liens symboliques.)
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const mod = require('rcedit');
  const rcedit = mod.rcedit || mod.default || mod;
  try {
    await rcedit(exe, {
      icon: path.join(__dirname, 'icon.ico'),
      'version-string': {
        ProductName: 'CAPES SES Révision',
        FileDescription: 'CAPES SES Révision',
        CompanyName: 'CAPES SES Révision',
        LegalCopyright: '',
        OriginalFilename: path.basename(exe),
      },
      'file-version': context.packager.appInfo.version,
      'product-version': context.packager.appInfo.version,
    });
    console.log('  • icône appliquée à', path.basename(exe));
  } catch (e) {
    console.warn('  • icône non appliquée (sans gravité) :', e.message);
  }
};
