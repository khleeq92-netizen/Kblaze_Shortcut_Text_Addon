// Generates an RSA key pair so the unpacked extension keeps a stable ID
// (needed for the Google OAuth redirect URI https://<id>.chromiumapp.org/).
import crypto from 'node:crypto';
import fs from 'node:fs';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });
const b64 = der.toString('base64');
const hash = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
const id = [...hash].map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
fs.writeFileSync('quicktext-hub-key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
console.log('Private key written to quicktext-hub-key.pem (keep it secret, it is git-ignored).');
console.log('\nAdd this line to .env:\nQTH_EXTENSION_KEY=' + b64);
console.log('\nResulting extension ID: ' + id);
console.log('OAuth redirect URI:     https://' + id + '.chromiumapp.org/');
