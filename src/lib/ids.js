/**
 * ID generation for Prello cards
 *
 * Uses nanoid with alphanumeric alphabet and crd_ prefix.
 */

const { customAlphabet } = require('nanoid');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortId = customAlphabet(alphabet, 12);

const cardId = () => `crd_${shortId()}`;

module.exports = { cardId };
