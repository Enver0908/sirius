const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;        // 128-bit IV
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag
const ENCODING = 'hex';

/**
 * ENCRYPTION_KEY'i 32 byte'a normalize eder.
 * Kısa key verilirse SHA-256 hash'i alınır.
 * @returns {Buffer}
 */
function _getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is not set in environment variables');
  }

  // Tam 32 byte (64 hex char) ise direkt kullan
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  // Değilse SHA-256 ile 32 byte'a dönüştür
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Metni AES-256-GCM ile şifreler.
 *
 * @param {string} text - Şifrelenecek düz metin
 * @returns {string} Format: iv:authTag:encryptedData (tümü hex)
 * @throws {Error} ENCRYPTION_KEY yoksa veya şifreleme başarısızsa
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('encrypt() requires a non-empty string');
  }

  const key = _getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(text, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag().toString(ENCODING);

  return `${iv.toString(ENCODING)}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM ile şifrelenmiş metni çözer.
 *
 * @param {string} hash - Format: iv:authTag:encryptedData (tümü hex)
 * @returns {string} Çözülmüş düz metin
 * @throws {Error} Format geçersizse veya auth tag doğrulaması başarısızsa
 */
function decrypt(hash) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('decrypt() requires a non-empty string');
  }

  const parts = hash.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format — expected iv:authTag:data');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  const key = _getKey();
  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
