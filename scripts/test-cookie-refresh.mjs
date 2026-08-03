import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COOKIE_REFRESH_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`;

function decryptText(enc, keyBuffer) {
  const payload = Buffer.from(enc, 'base64');
  if (payload.length < 13) throw new Error("Invalid payload");
  const nonce = payload.subarray(0, 12);
  const ciphertextAndTag = payload.subarray(12);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function buildCorrespondPath(timestamp) {
  const payload = Buffer.from(`refresh_${timestamp}`);
  const encrypted = crypto.publicEncrypt(
    {
      key: COOKIE_REFRESH_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    payload
  );
  return encrypted.toString('hex');
}

async function testUserAgent(ua, cookie) {
  const ts = Date.now();
  const path = buildCorrespondPath(ts);
  const url = `https://www.bilibili.com/correspond/1/${path}`;

  console.log(`\nTesting UA: "${ua}"`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Cookie': cookie,
    }
  });
  const html = await res.text();
  const hasToken = html.includes('id="1-name"');
  console.log('Status:', res.status, 'HTML len:', html.length, 'Contains 1-name:', hasToken);
  if (!hasToken) {
    console.log('HTML snippet:', html.substring(0, 300));
  }
}

async function main() {
  const configDir = path.join(os.homedir(), 'Library', 'Application Support', 'OpenBliveStudio');
  const masterKeyPath = path.join(configDir, 'master_key.b64');
  const accountsPath = path.join(configDir, 'accounts.json');

  const masterKeyB64 = fs.readFileSync(masterKeyPath, 'utf8').trim();
  const masterKeyBuf = Buffer.from(masterKeyB64, 'base64');
  const accountsJson = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  const currentUid = accountsJson.current_uid;
  const userData = accountsJson.users[currentUid];
  const cookie = decryptText(userData.enc_cookie, masterKeyBuf);

  await testUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', cookie);
  await testUserAgent('Mozilla/5.0 (Macintosh; Apple Silicon; Mac OS X 13_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', cookie);
  await testUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', cookie);
}

main();
