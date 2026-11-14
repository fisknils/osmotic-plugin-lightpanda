const { Osmotic } = require('osmotic');

// Only pages after render() go through Lightpanda; the rest are fetched as usual
Osmotic.plugins([require('../dist/index.cjs')({ renderAll: false })]);

new Osmotic()
	// quotes.toscrape.com/js-delayed adds its quotes 10 seconds after the page loads
	.render({ waitFor: '.quote', timeout: 20000 })
	.get('https://quotes.toscrape.com/js-delayed/')
	.find('.quote')
	.set({ text: '.text', author: '.author' })
	.data((quote) => console.log(quote))
	.config({ maxPages: 1 })
	.run();
