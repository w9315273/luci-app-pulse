const { spec } = require('node:test/reporters');
const { Readable } = require('node:stream');

module.exports = async function* (source) {
 for await (const chunk of Readable.from(source).pipe(new spec())) {
  yield chunk.toString()
   .replace(/\b(\d+(?:\.\d+)?)ms(?=\))/g, (_, value) => Number(value).toFixed(2) + 'ms')
   .replace(/\bduration_ms (\d+(?:\.\d+)?)/g, (_, value) => 'duration_ms ' + Number(value).toFixed(2));
 }
};
