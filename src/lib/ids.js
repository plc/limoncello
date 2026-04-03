/**
 * ID generation for Limoncello cards
 *
 * Uses nanoid with alphanumeric alphabet and crd_ prefix.
 */

const { customAlphabet } = require('nanoid');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const shortId = customAlphabet(alphabet, 12);

const cardId = () => `crd_${shortId()}`;
const projectId = () => `prj_${shortId()}`;

module.exports = { cardId, projectId };
