const crypto = require('crypto');

module.exports = {
  getRandomBytesAsync: async (length) => {
    return new Uint8Array(crypto.randomBytes(length));
  },
  digestStringAsync: async (algo, str) => {
    const hash = crypto.createHash(algo.toLowerCase().replace('-', ''));
    hash.update(str);
    return hash.digest('hex');
  },
};

