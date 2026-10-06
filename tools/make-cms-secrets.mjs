// Generate the CMS login secrets. Run on YOUR computer, never in CI:
//     node tools/make-cms-secrets.mjs <username>
// Prints a new random password (shown once — save it in a password manager)
// and the three values to paste into Cloudflare Pages as type "Secret":
//     CMS_USERNAME, CMS_PASSWORD_HASH, CMS_SESSION_SECRET
// Nothing is written to disk or sent anywhere.
import { hashPassword, b64url, DEFAULT_ITERATIONS } from '../worker/auth.js';

const username = (process.argv[2] || '').trim();
if (!/^[a-z0-9._-]{3,40}$/i.test(username)) {
  console.error('Usage: node tools/make-cms-secrets.mjs <username>   (3–40 letters, digits, . _ -)');
  process.exit(1);
}

// 24 characters from a 62-symbol alphabet ≈ 143 bits of entropy
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const pick = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => ALPHABET[x % ALPHABET.length]).join('');
const password = `${pick(6)}-${pick(6)}-${pick(6)}-${pick(6)}`;

const hash = await hashPassword(password, DEFAULT_ITERATIONS);
const sessionSecret = b64url(crypto.getRandomValues(new Uint8Array(32)));

console.log(`
Your new CMS login (shown ONCE — save the password in a password manager now)
  username: ${username}
  password: ${password}

Paste these into Cloudflare → Workers & Pages → portfolio → Settings →
Variables and Secrets → Add → Type: Secret (for Production AND Preview):

  CMS_USERNAME        ${username}
  CMS_PASSWORD_HASH   ${hash}
  CMS_SESSION_SECRET  ${sessionSecret}

Then close this terminal window so the password isn't left on screen.
`);
